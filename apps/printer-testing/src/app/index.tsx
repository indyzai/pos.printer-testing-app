import type { PrinterTarget } from "@indyzai/pos-printing-native/types";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BottomTabInset } from "../constants/theme";
import type { CommandLanguage, PrinterConfig } from "../printer-config";
import {
    deletePrinterConfig,
    listPrinterConfigs,
    savePrinterConfig,
} from "../printer-config-store";
import { printerTransport } from "../printer-transport";
import { networkPrinterTarget, testPayloadFor } from "../printer-test-data";

type FoundPrinter = {
    label: string;
    detail: string;
    target: PrinterTarget;
    savedConfig?: PrinterConfig;
};
type ScanGroup = "bluetooth" | "usb" | "network";
type ScanPhase = "idle" | "scanning" | "done" | "error" | "unavailable";
const languages: CommandLanguage[] = ["ESC/POS", "ZPL", "EPL", "CPCL"];

export default function HomeScreen() {
    const [devices, setDevices] = useState<FoundPrinter[]>([]);
    const [scanProgress, setScanProgress] = useState<
        Record<ScanGroup, ScanPhase>
    >({
        bluetooth: "idle",
        usb: "idle",
        network: "done",
    });
    const [scanErrors, setScanErrors] = useState<
        Partial<Record<ScanGroup, string>>
    >({});
    const [selected, setSelected] = useState<PrinterTarget | null>(null);
    const [host, setHost] = useState("");
    const [port, setPort] = useState("9100");
    const [serviceUuid, setServiceUuid] = useState("");
    const [characteristicUuid, setCharacteristicUuid] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("Ready to find printers.");
    const [configs, setConfigs] = useState<PrinterConfig[]>([]);
    const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
    const [configName, setConfigName] = useState("");
    const [commandLanguage, setCommandLanguage] =
        useState<CommandLanguage>("ESC/POS");
    const [paperWidth, setPaperWidth] = useState("80mm");
    const isNative = Platform.OS === "android" || Platform.OS === "ios";
    const networkDevices: FoundPrinter[] = configs
        .filter((config) => config.target.connection === "network")
        .map((config) => ({
            label: config.name,
            detail: `${config.target.address}:${config.target.port} · saved address`,
            target: config.target,
            savedConfig: config,
        }));
    if (
        selected?.connection === "network" &&
        !networkDevices.some(
            (device) =>
                device.target.address === selected.address &&
                device.target.port === selected.port,
        )
    ) {
        networkDevices.unshift({
            label: selected.address ?? "Network printer",
            detail: `${selected.address}:${selected.port} · current address`,
            target: selected,
        });
    }
    const groups: {
        key: ScanGroup;
        title: string;
        empty: string;
        entries: FoundPrinter[];
    }[] = [
        {
            key: "bluetooth",
            title: "Bluetooth",
            empty: "No paired or nearby Bluetooth printers found.",
            entries: devices.filter(
                (device) => device.target.connection === "bluetooth",
            ),
        },
        {
            key: "usb",
            title: "USB / OTG",
            empty: "No USB bulk-output devices found.",
            entries: devices.filter(
                (device) => device.target.connection === "usb",
            ),
        },
        {
            key: "network",
            title: "Network",
            empty: "Add a printer IP address below to use Wi-Fi or LAN.",
            entries: networkDevices,
        },
    ];
    const scanTotal =
        Platform.OS === "android" ? 2 : Platform.OS === "ios" ? 1 : 0;
    const scanFinished = (["bluetooth", "usb"] as const).filter(
        (key) => scanProgress[key] === "done" || scanProgress[key] === "error",
    ).length;

    useEffect(() => {
        void listPrinterConfigs()
            .then((saved) => {
                setConfigs(saved);
                if (saved[0]) applyConfig(saved[0]);
            })
            .catch((error) =>
                setMessage(
                    `Could not load printer configurations: ${String(error)}`,
                ),
            );
    }, []);

    function applyConfig(config: PrinterConfig) {
        setSelected(config.target);
        setActiveConfigId(config.id);
        setConfigName(config.name);
        setCommandLanguage(config.commandLanguage);
        setPaperWidth(config.paperWidth);
        if (config.target.connection === "network") {
            setHost(config.target.address ?? "");
            setPort(String(config.target.port ?? 9100));
        }
        setServiceUuid(config.target.serviceUuid ?? "");
        setCharacteristicUuid(config.target.characteristicUuid ?? "");
        setMessage(
            `${config.name} loaded. Send a test print to verify the connection.`,
        );
    }

    async function saveConfig() {
        if (!selected || !configName.trim()) {
            setMessage(
                "Select a printer and enter a configuration name before saving.",
            );
            return;
        }
        const target =
            selected.connection === "bluetooth" && Platform.OS === "ios"
                ? {
                      ...selected,
                      serviceUuid: serviceUuid.trim(),
                      characteristicUuid: characteristicUuid.trim(),
                  }
                : selected;
        const config: PrinterConfig = {
            id:
                activeConfigId ??
                `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: configName.trim(),
            target,
            commandLanguage,
            paperWidth: paperWidth.trim(),
            updatedAt: Date.now(),
        };
        try {
            await savePrinterConfig(config);
            setConfigs(await listPrinterConfigs());
            setActiveConfigId(config.id);
            setMessage(`${config.name} saved locally.`);
        } catch (error) {
            setMessage(`Could not save configuration: ${String(error)}`);
        }
    }

    async function removeConfig(config: PrinterConfig) {
        try {
            await deletePrinterConfig(config.id);
            setConfigs(await listPrinterConfigs());
            if (activeConfigId === config.id) setActiveConfigId(null);
            setMessage(`${config.name} deleted.`);
        } catch (error) {
            setMessage(`Could not delete configuration: ${String(error)}`);
        }
    }

    function newConfig() {
        setActiveConfigId(null);
        setConfigName("");
        setMessage(
            "New configuration. Select a printer or keep the current connection, then save it with a name.",
        );
    }

    async function selectDiscovered(device: FoundPrinter) {
        if (device.savedConfig) {
            applyConfig(device.savedConfig);
            return;
        }
        setBusy(true);
        try {
            const target =
                device.target.connection === "usb"
                    ? await printerTransport.connect(device.target)
                    : device.target;
            setSelected(target);
            setActiveConfigId(null);
            setConfigName(device.label);
            setMessage(
                `${device.label} selected. Send a test print to check it.`,
            );
        } catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    }

    async function scan() {
        setBusy(true);
        setDevices([]);
        setScanErrors({});
        setScanProgress({
            bluetooth: isNative ? "scanning" : "unavailable",
            usb: Platform.OS === "android" ? "scanning" : "unavailable",
            network: "done",
        });
        setMessage("Scanning Bluetooth and USB connections…");
        if (!isNative) {
            setMessage(
                "Bluetooth and USB scanning require a native development build. Saved network addresses are shown below.",
            );
            setBusy(false);
            return;
        }
        async function scanGroup(
            group: "bluetooth" | "usb",
            job: () => Promise<FoundPrinter[]>,
        ) {
            try {
                const found = await job();
                setDevices((current) => [...current, ...found]);
                setScanProgress((current) => ({ ...current, [group]: "done" }));
                return { found, error: "" };
            } catch (error) {
                const detail =
                    error instanceof Error ? error.message : String(error);
                setScanErrors((current) => ({ ...current, [group]: detail }));
                setScanProgress((current) => ({
                    ...current,
                    [group]: "error",
                }));
                return { found: [] as FoundPrinter[], error: detail };
            }
        }
        const jobs = [
            scanGroup("bluetooth", async () =>
                (await printerTransport.listBluetooth()).map((device) => ({
                    label: device.name,
                    detail: `${Platform.OS === "ios" ? "Bluetooth LE" : "Paired Bluetooth"} · ${device.address}`,
                    target: {
                        connection: "bluetooth" as const,
                        address: device.address,
                    },
                })),
            ),
        ];
        if (Platform.OS === "android") {
            jobs.push(
                scanGroup("usb", async () =>
                    (await printerTransport.listUsb()).map((device) => ({
                        label: device.name,
                        detail: `USB OTG · ${device.vendorId}:${device.productId}`,
                        target: { connection: "usb" as const, ...device },
                    })),
                ),
            );
        }
        const results = await Promise.all(jobs);
        const found = results.flatMap((result) => result.found);
        const errors = results.map((result) => result.error).filter(Boolean);
        setMessage(
            found.length
                ? `${found.length} device${found.length === 1 ? "" : "s"} found. Select one to test.`
                : "No Bluetooth or USB devices found. Check pairing, OTG support, cable, and power.",
        );
        if (errors.length)
            setMessage(
                (found.length ? `${found.length} found. ` : "") +
                    errors.join(" "),
            );
        setBusy(false);
    }

    function selectNetwork() {
        let target: PrinterTarget;
        try {
            target = networkPrinterTarget(host, port);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
            return;
        }
        setSelected(target);
        setActiveConfigId(null);
        setMessage(
            `Network printer set to ${target.address}:${target.port}. Send a test print to check it.`,
        );
    }

    async function testPrint() {
        if (!selected) return;
        setBusy(true);
        try {
            const target =
                selected.connection === "bluetooth" && Platform.OS === "ios"
                    ? {
                          ...selected,
                          serviceUuid: serviceUuid.trim(),
                          characteristicUuid: characteristicUuid.trim(),
                      }
                    : selected;
            const result = await printerTransport.write(
                target,
                testPayloadFor(commandLanguage),
            );
            setMessage(
                `Test receipt sent (${result.bytesWritten} bytes). Check the printer output.`,
            );
        } catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    }

    return (
        <View style={styles.screen}>
            <SafeAreaView style={styles.safe}>
                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.header}>
                        <Image
                            source={require("../../assets/images/icon.png")}
                            style={styles.logo}
                        />
                        <View>
                            <Text style={styles.brand}>IndyzAI</Text>
                            <Text style={styles.brandSub}>
                                POS DEVICE TOOLS
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.title}>Printer setup</Text>
                    <Text style={styles.intro}>
                        Discover devices, save each printer, and verify its
                        output.
                    </Text>
                    <View style={styles.overview}>
                        <View style={styles.overviewItem}>
                            <Text style={styles.overviewNumber}>
                                {configs.length}
                            </Text>
                            <Text style={styles.overviewLabel}>
                                Saved printers
                            </Text>
                        </View>
                        <View style={styles.overviewDivider} />
                        <View style={styles.overviewItem}>
                            <Text style={styles.overviewNumber}>
                                {devices.length}
                            </Text>
                            <Text style={styles.overviewLabel}>
                                Found nearby
                            </Text>
                        </View>
                    </View>
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <View>
                                <Text style={styles.eyebrow}>
                                    YOUR WORKSPACE
                                </Text>
                                <Text style={styles.cardTitle}>
                                    Saved printers
                                </Text>
                            </View>
                            <Pressable
                                accessibilityRole="button"
                                onPress={newConfig}
                                style={styles.smallButton}
                            >
                                <Text style={styles.smallButtonLabel}>
                                    + New
                                </Text>
                            </Pressable>
                        </View>
                        {configs.length === 0 && (
                            <Text style={styles.copy}>
                                No printers saved yet. Scan or add a network
                                printer below.
                            </Text>
                        )}
                        {configs.map((config) => (
                            <View
                                key={config.id}
                                style={[
                                    styles.savedRow,
                                    activeConfigId === config.id &&
                                        styles.selected,
                                ]}
                            >
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => applyConfig(config)}
                                    style={styles.savedDetails}
                                >
                                    <Text style={styles.deviceName}>
                                        {config.name}
                                    </Text>
                                    <Text style={styles.deviceDetail}>
                                        {config.target.connection.toUpperCase()}{" "}
                                        · {config.commandLanguage} ·{" "}
                                        {config.paperWidth}
                                    </Text>
                                </Pressable>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`Delete ${config.name}`}
                                    onPress={() => void removeConfig(config)}
                                    style={styles.deleteButton}
                                >
                                    <Text style={styles.deleteText}>
                                        Delete
                                    </Text>
                                </Pressable>
                            </View>
                        ))}
                    </View>
                    <View style={styles.card}>
                        <Text style={styles.eyebrow}>STEP 01</Text>
                        <Text style={styles.cardTitle}>Discover devices</Text>
                        <Text style={styles.copy}>
                            Bluetooth{" "}
                            {Platform.OS === "ios" ? "LE" : "paired devices"} ·{" "}
                            {Platform.OS === "android"
                                ? "USB / USB OTG"
                                : "USB OTG on Android"}{" "}
                            · Wi-Fi / LAN setup
                        </Text>
                        {Platform.OS === "android" && (
                            <Text style={styles.note}>
                                Tap a USB result to grant Android access to that
                                device.
                            </Text>
                        )}
                        <Pressable
                            accessibilityRole="button"
                            disabled={busy}
                            onPress={() => void scan()}
                            style={[
                                styles.primaryButton,
                                busy && styles.disabled,
                            ]}
                        >
                            {busy ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.primaryLabel}>
                                    Scan for printers
                                </Text>
                            )}
                        </Pressable>
                        <Text accessibilityRole="alert" style={styles.status}>
                            {message}
                        </Text>
                        {scanProgress.bluetooth !== "idle" && scanTotal > 0 && (
                            <View style={styles.progressArea}>
                                <Text style={styles.progressLabel}>
                                    {busy && scanFinished < scanTotal
                                        ? "Scanning connections"
                                        : "Scan complete"}{" "}
                                    · {scanFinished}/{scanTotal}
                                </Text>
                                <View
                                    accessibilityRole="progressbar"
                                    accessibilityValue={{
                                        min: 0,
                                        max: scanTotal,
                                        now: scanFinished,
                                    }}
                                    style={styles.progressTrack}
                                >
                                    <View
                                        style={[
                                            styles.progressFill,
                                            {
                                                width: `${Math.round((scanFinished / scanTotal) * 100)}%`,
                                            },
                                        ]}
                                    />
                                </View>
                            </View>
                        )}
                        {groups.map((group) => (
                            <View key={group.key} style={styles.group}>
                                <View style={styles.groupHeader}>
                                    <Text style={styles.groupTitle}>
                                        {group.title}
                                    </Text>
                                    {scanProgress[group.key] === "scanning" ? (
                                        <ActivityIndicator
                                            size="small"
                                            color="#1B6EF3"
                                        />
                                    ) : (
                                        <Text style={styles.groupCount}>
                                            {group.key === "network"
                                                ? "Saved / manual"
                                                : scanProgress[group.key] ===
                                                    "unavailable"
                                                  ? "Unavailable"
                                                  : scanProgress[group.key] ===
                                                      "error"
                                                    ? "Check access"
                                                    : scanProgress[
                                                            group.key
                                                        ] === "idle"
                                                      ? "Ready"
                                                      : `${group.entries.length} found`}
                                        </Text>
                                    )}
                                </View>
                                {scanErrors[group.key] && (
                                    <Text style={styles.groupError}>
                                        {scanErrors[group.key]}
                                    </Text>
                                )}
                                {group.entries.length === 0 &&
                                    scanProgress[group.key] !== "scanning" && (
                                        <Text style={styles.groupEmpty}>
                                            {scanProgress[group.key] === "idle"
                                                ? "Start a scan to look for devices."
                                                : scanProgress[group.key] ===
                                                    "unavailable"
                                                  ? group.key === "usb" &&
                                                    Platform.OS === "ios"
                                                      ? "USB OTG scanning is available on Android."
                                                      : "Requires a native development build."
                                                  : group.empty}
                                        </Text>
                                    )}
                                {group.entries.map((device, index) => (
                                    <Pressable
                                        key={`${device.detail}-${index}`}
                                        accessibilityRole="button"
                                        onPress={() =>
                                            void selectDiscovered(device)
                                        }
                                        style={[
                                            styles.device,
                                            selected === device.target &&
                                                styles.selected,
                                        ]}
                                    >
                                        <View style={styles.deviceIcon}>
                                            <Text style={styles.deviceIconText}>
                                                {group.key === "bluetooth"
                                                    ? "BT"
                                                    : group.key === "usb"
                                                      ? "USB"
                                                      : "LAN"}
                                            </Text>
                                        </View>
                                        <View style={styles.deviceBody}>
                                            <Text style={styles.deviceName}>
                                                {device.label}
                                            </Text>
                                            <Text style={styles.deviceDetail}>
                                                {device.detail}
                                            </Text>
                                        </View>
                                        <Text style={styles.chevron}>›</Text>
                                    </Pressable>
                                ))}
                            </View>
                        ))}
                    </View>
                    <View style={styles.card}>
                        <Text style={styles.eyebrow}>STEP 02</Text>
                        <Text style={styles.cardTitle}>
                            Add network printer
                        </Text>
                        <Text style={styles.copy}>
                            Connect to the same network as your printer. Enter
                            its IP address and raw TCP port.
                        </Text>
                        <Text style={styles.fieldLabel}>
                            IP address or hostname
                        </Text>
                        <TextInput
                            accessibilityLabel="Printer IP address or hostname"
                            autoCapitalize="none"
                            autoCorrect={false}
                            value={host}
                            onChangeText={setHost}
                            placeholder="192.168.1.100"
                            placeholderTextColor="#6F7683"
                            style={styles.input}
                        />
                        <Text style={styles.fieldLabel}>TCP port</Text>
                        <TextInput
                            accessibilityLabel="Printer TCP port"
                            keyboardType="numeric"
                            value={port}
                            onChangeText={setPort}
                            placeholder="9100"
                            placeholderTextColor="#6F7683"
                            style={styles.input}
                        />
                        <Pressable
                            accessibilityRole="button"
                            onPress={selectNetwork}
                            style={styles.secondaryButton}
                        >
                            <Text style={styles.secondaryLabel}>
                                Use this printer
                            </Text>
                        </Pressable>
                    </View>
                    {selected?.connection === "bluetooth" &&
                        Platform.OS === "ios" && (
                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>
                                    BLE write settings
                                </Text>
                                <Text style={styles.copy}>
                                    Enter the service and writable
                                    characteristic UUIDs provided by your
                                    printer.
                                </Text>
                                <TextInput
                                    accessibilityLabel="BLE service UUID"
                                    autoCapitalize="none"
                                    value={serviceUuid}
                                    onChangeText={setServiceUuid}
                                    placeholder="Service UUID"
                                    placeholderTextColor="#6F7683"
                                    style={styles.input}
                                />
                                <TextInput
                                    accessibilityLabel="BLE characteristic UUID"
                                    autoCapitalize="none"
                                    value={characteristicUuid}
                                    onChangeText={setCharacteristicUuid}
                                    placeholder="Writable characteristic UUID"
                                    placeholderTextColor="#6F7683"
                                    style={styles.input}
                                />
                            </View>
                        )}
                    <View style={styles.card}>
                        <Text style={styles.eyebrow}>STEP 03</Text>
                        <Text style={styles.cardTitle}>
                            Printer configuration
                        </Text>
                        <Text style={styles.copy}>
                            Save connection details and print language on this
                            device for the next session.
                        </Text>
                        <Text style={styles.fieldLabel}>
                            Configuration name
                        </Text>
                        <TextInput
                            accessibilityLabel="Configuration name"
                            value={configName}
                            onChangeText={setConfigName}
                            placeholder="Counter receipt printer"
                            placeholderTextColor="#6F7683"
                            style={styles.input}
                        />
                        <Text style={styles.fieldLabel}>Command language</Text>
                        <View style={styles.options}>
                            {languages.map((language) => (
                                <Pressable
                                    key={language}
                                    accessibilityRole="button"
                                    onPress={() => setCommandLanguage(language)}
                                    style={[
                                        styles.option,
                                        commandLanguage === language &&
                                            styles.optionSelected,
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.optionText,
                                            commandLanguage === language &&
                                                styles.optionTextSelected,
                                        ]}
                                    >
                                        {language}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                        <Text style={styles.fieldLabel}>Paper width</Text>
                        <TextInput
                            accessibilityLabel="Paper width"
                            value={paperWidth}
                            onChangeText={setPaperWidth}
                            placeholder="80mm or 4in"
                            placeholderTextColor="#6F7683"
                            style={styles.input}
                        />
                        <Pressable
                            accessibilityRole="button"
                            disabled={!selected}
                            onPress={() => void saveConfig()}
                            style={[
                                styles.secondaryButton,
                                !selected && styles.disabled,
                            ]}
                        >
                            <Text style={styles.secondaryLabel}>
                                {activeConfigId
                                    ? "Update configuration"
                                    : "Save configuration"}
                            </Text>
                        </Pressable>
                    </View>
                    <View style={styles.card}>
                        <Text style={styles.eyebrow}>STEP 04</Text>
                        <Text style={styles.cardTitle}>Test connection</Text>
                        <Text style={styles.copy}>
                            {selected
                                ? `${selected.connection.toUpperCase()} · ${commandLanguage} · ${paperWidth}`
                                : "Select a discovered printer or configure a network address first."}
                        </Text>
                        <Pressable
                            accessibilityRole="button"
                            disabled={!selected || busy || !isNative}
                            onPress={() => void testPrint()}
                            style={[
                                styles.primaryButton,
                                (!selected || busy || !isNative) &&
                                    styles.disabled,
                            ]}
                        >
                            <Text style={styles.primaryLabel}>
                                Print{" "}
                                {commandLanguage === "ESC/POS"
                                    ? "test receipt"
                                    : "test label"}
                            </Text>
                        </Pressable>
                        {!isNative && (
                            <Text style={styles.note}>
                                Printing requires a native development build.
                            </Text>
                        )}
                    </View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: "#F9FAFF" },
    safe: { flex: 1 },
    content: {
        width: "100%",
        maxWidth: 760,
        alignSelf: "center",
        padding: 20,
        paddingBottom: BottomTabInset + 40,
        gap: 16,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
    },
    logo: { width: 44, height: 44, borderRadius: 12 },
    brand: { color: "#1A1C1E", fontSize: 21, fontWeight: "800" },
    brandSub: {
        color: "#1B6EF3",
        fontSize: 10,
        fontWeight: "800",
        letterSpacing: 2,
    },
    title: {
        color: "#1A1C1E",
        fontSize: 32,
        lineHeight: 38,
        fontWeight: "800",
    },
    intro: { color: "#43474F", fontSize: 15, lineHeight: 22, marginTop: -10 },
    overview: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#D7E2FF",
        borderRadius: 16,
        paddingVertical: 16,
        marginBottom: 2,
    },
    overviewItem: { flex: 1, alignItems: "center", gap: 2 },
    overviewNumber: { color: "#1B6EF3", fontSize: 25, fontWeight: "800" },
    overviewLabel: { color: "#43474F", fontSize: 12, fontWeight: "600" },
    overviewDivider: { width: 1, height: 34, backgroundColor: "#B6CAFA" },
    card: {
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        padding: 20,
        gap: 12,
        borderWidth: 1,
        borderColor: "#E5E9F0",
    },
    cardHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    eyebrow: {
        color: "#1B6EF3",
        fontSize: 11,
        fontWeight: "800",
        letterSpacing: 1.5,
    },
    cardTitle: { color: "#1A1C1E", fontSize: 20, fontWeight: "700" },
    copy: { color: "#43474F", fontSize: 14, lineHeight: 21 },
    smallButton: {
        backgroundColor: "#D7E2FF",
        borderRadius: 9,
        paddingHorizontal: 12,
        paddingVertical: 9,
    },
    smallButtonLabel: { color: "#1B6EF3", fontWeight: "700", fontSize: 13 },
    primaryButton: {
        backgroundColor: "#1B6EF3",
        minHeight: 50,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 4,
    },
    disabled: { opacity: 0.5 },
    primaryLabel: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
    status: { color: "#43474F", fontSize: 13, lineHeight: 19 },
    progressArea: { gap: 7, paddingVertical: 4 },
    progressLabel: { color: "#43474F", fontSize: 12, fontWeight: "700" },
    progressTrack: {
        height: 6,
        borderRadius: 3,
        backgroundColor: "#D7E2FF",
        overflow: "hidden",
    },
    progressFill: { height: "100%", backgroundColor: "#1B6EF3" },
    group: {
        gap: 8,
        borderTopWidth: 1,
        borderTopColor: "#E5E9F0",
        paddingTop: 12,
    },
    groupHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    groupTitle: { color: "#1A1C1E", fontSize: 15, fontWeight: "700" },
    groupCount: { color: "#43474F", fontSize: 12, fontWeight: "600" },
    groupError: { color: "#BA1A1A", fontSize: 12, lineHeight: 17 },
    groupEmpty: { color: "#6F7683", fontSize: 12, lineHeight: 18 },
    device: {
        borderWidth: 1,
        borderColor: "#E5E9F0",
        borderRadius: 12,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    selected: { borderColor: "#1B6EF3", backgroundColor: "#EEF4FF" },
    deviceIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: "#D7E2FF",
        alignItems: "center",
        justifyContent: "center",
    },
    deviceIconText: { color: "#1B6EF3", fontSize: 10, fontWeight: "800" },
    deviceBody: { flex: 1 },
    deviceName: { color: "#1A1C1E", fontWeight: "700", fontSize: 15 },
    deviceDetail: { color: "#43474F", fontSize: 12, marginTop: 2 },
    chevron: { color: "#1B6EF3", fontSize: 24 },
    fieldLabel: {
        color: "#43474F",
        fontSize: 13,
        fontWeight: "700",
        marginBottom: -7,
    },
    input: {
        borderWidth: 1,
        borderColor: "#C3C6CF",
        borderRadius: 12,
        paddingHorizontal: 14,
        minHeight: 46,
        color: "#1A1C1E",
        fontSize: 15,
    },
    secondaryButton: {
        minHeight: 46,
        borderRadius: 12,
        backgroundColor: "#D7E2FF",
        alignItems: "center",
        justifyContent: "center",
    },
    secondaryLabel: { color: "#1B6EF3", fontWeight: "700" },
    note: { color: "#43474F", fontSize: 12 },
    options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    option: {
        borderWidth: 1,
        borderColor: "#C3C6CF",
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 9,
    },
    optionSelected: { backgroundColor: "#1B6EF3", borderColor: "#1B6EF3" },
    optionText: { color: "#43474F", fontWeight: "700", fontSize: 12 },
    optionTextSelected: { color: "#FFFFFF" },
    savedRow: {
        borderTopWidth: 1,
        borderTopColor: "#E5E9F0",
        paddingTop: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    savedDetails: { flex: 1 },
    deleteButton: { padding: 8 },
    deleteText: { color: "#BA1A1A", fontSize: 12, fontWeight: "700" },
});
