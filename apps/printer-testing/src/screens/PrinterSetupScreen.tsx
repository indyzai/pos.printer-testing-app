import { traceLog } from "../trace-log";
import { usbScanSummary, usbDeviceLabel } from "../usb-scan";
import { useAuthSession } from "@indyzai/pos-auth/session";
import type {
    UsbScanReport,
    PrinterTarget,
} from "@indyzai/pos-printing-native/types";
import {
    PosLogo,
    AppPressable as Pressable,
    radii,
    useAppTheme,
    type ThemeColors,
} from "@indyzai/pos-ui-native";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PosWorkspace } from "../pos-workspace";
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
    const { session } = useAuthSession();
    const { themeColors, isDark, setMode } = useAppTheme();
    const { width } = useWindowDimensions();
    const styles = useMemo(() => createStyles(themeColors), [themeColors]);
    const wideLayout = width >= 960;
    const [usbReport, setUsbReport] = useState<UsbScanReport | null>(null);
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
    useEffect(() => {
        traceLog.write("info", "Setup", message);
    }, [message]);
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
            empty: "No supported USB print connections found. Use the USB check above to inspect the OTG connection.",
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

    async function scan(usbOnly = false) {
        traceLog.write("info", "Scan", "Scan requested", { mode: usbOnly ? "usb" : "all", platform: Platform.OS });
        const usbResult: { report?: UsbScanReport } = {};
        setBusy(true);
        setUsbReport(null);
        setDevices((current) =>
            usbOnly
                ? current.filter((device) => device.target.connection !== "usb")
                : [],
        );
        setScanErrors((current) =>
            usbOnly ? { ...current, usb: undefined } : {},
        );
        setScanProgress((current) => ({
            bluetooth: usbOnly
                ? current.bluetooth
                : isNative
                  ? "scanning"
                  : "unavailable",
            usb: Platform.OS === "android" ? "scanning" : "unavailable",
            network: "done",
        }));
        setMessage(
            usbOnly
                ? "Checking USB OTG connection…"
                : "Scanning Bluetooth and USB connections…",
        );
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
        const jobs = usbOnly
            ? []
            : [
                  scanGroup("bluetooth", async () =>
                      (await printerTransport.listBluetooth()).map(
                          (device) => ({
                              label: device.name,
                              detail: `${Platform.OS === "ios" ? "Bluetooth LE" : "Paired Bluetooth"} · ${device.address}`,
                              target: {
                                  connection: "bluetooth" as const,
                                  address: device.address,
                              },
                          }),
                      ),
                  ),
              ];
        if (Platform.OS === "android") {
            jobs.push(
                scanGroup("usb", async () => {
                    const report = await printerTransport.scanUsb();
                    usbResult.report = report;
                    setUsbReport(report);
                    return report.printers.map((device) => ({
                        label: device.name,
                        detail: `USB OTG · ${device.vendorId}:${device.productId}`,
                        target: { connection: "usb" as const, ...device },
                    }));
                }),
            );
        }
        const results = await Promise.all(jobs);
        const found = results.flatMap((result) => result.found);
        const errors = results.map((result) => result.error).filter(Boolean);
        setMessage(
            found.length
                ? `${found.length} device${found.length === 1 ? "" : "s"} found. Select one to test.`
                : usbResult.report
                  ? usbScanSummary(usbResult.report)
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
        traceLog.write("info", "Printer", "Test print requested", {
            language: commandLanguage,
            paperWidth,
            connection: selected.connection,
        });
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
                        <View style={styles.logo}>
                            <PosLogo size={56} color={themeColors.primary} />
                        </View>
                        <View>
                            <Text style={styles.brand}>IndyzAI</Text>
                            <Text style={styles.brandSub}>
                                PRINTER WORKSPACE
                            </Text>
                        </View>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={
                                isDark ? "Use light theme" : "Use dark theme"
                            }
                            onPress={() => setMode(isDark ? "light" : "dark")}
                            style={styles.themeButton}
                        >
                            <Text style={styles.smallButtonLabel}>
                                {isDark ? "Light mode" : "Dark mode"}
                            </Text>
                        </Pressable>
                    </View>
                    <Text style={styles.title}>Set up your printer</Text>
                    <Text style={styles.intro}>
                        Connect a device, save its settings, and send your first
                        test print.
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
                    <View
                        style={[
                            styles.workspace,
                            wideLayout && styles.workspaceWide,
                        ]}
                    >
                        <View
                            style={[
                                styles.sidebar,
                                wideLayout && styles.sidebarWide,
                            ]}
                        >
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
                                        disabled={busy}
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
                                        No printers saved yet. Scan or add a
                                        network printer below.
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
                                            disabled={busy}
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
                                            disabled={busy}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Delete ${config.name}`}
                                            onPress={() =>
                                                void removeConfig(config)
                                            }
                                            style={styles.deleteButton}
                                        >
                                            <Text style={styles.deleteText}>
                                                Delete
                                            </Text>
                                        </Pressable>
                                    </View>
                                ))}
                            </View>
                            <PosWorkspace
                                key={
                                    session
                                        ? `${session.user.id}:${session.tenant.id}:${session.token}`
                                        : "guest"
                                }
                                config={configs.find(
                                    (config) => config.id === activeConfigId,
                                )}
                                printerBusy={busy}
                                onBusyChange={setBusy}
                            />
                        </View>
                        <View style={styles.setupColumn}>
                            <View style={styles.card}>
                                <Text style={styles.eyebrow}>STEP 01</Text>
                                <Text style={styles.cardTitle}>
                                    Discover devices
                                </Text>
                                <Text style={styles.copy}>
                                    Bluetooth{" "}
                                    {Platform.OS === "ios"
                                        ? "LE"
                                        : "paired devices"}{" "}
                                    ·{" "}
                                    {Platform.OS === "android"
                                        ? "USB / USB OTG"
                                        : "USB OTG on Android"}{" "}
                                    · Wi-Fi / LAN setup
                                </Text>
                                {Platform.OS === "android" && (
                                    <Text style={styles.note}>
                                        Tap a USB result to grant Android access
                                        to that device.
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
                                        <ActivityIndicator
                                            color={themeColors.background}
                                        />
                                    ) : (
                                        <Text style={styles.primaryLabel}>
                                            Scan for printers
                                        </Text>
                                    )}
                                </Pressable>
                                {Platform.OS === "android" && (
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={busy}
                                        onPress={() => void scan(true)}
                                        style={[
                                            styles.secondaryButton,
                                            busy && styles.disabled,
                                        ]}
                                    >
                                        <Text style={styles.secondaryLabel}>
                                            Check USB / OTG only
                                        </Text>
                                    </Pressable>
                                )}
                                <Text
                                    accessibilityRole="alert"
                                    style={styles.status}
                                >
                                    {message}
                                </Text>
                                {scanProgress.bluetooth !== "idle" &&
                                    scanTotal > 0 && (
                                        <View style={styles.progressArea}>
                                            <Text style={styles.progressLabel}>
                                                {busy &&
                                                scanFinished < scanTotal
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
                                            {scanProgress[group.key] ===
                                            "scanning" ? (
                                                <ActivityIndicator
                                                    size="small"
                                                    color="#1B6EF3"
                                                />
                                            ) : (
                                                <Text style={styles.groupCount}>
                                                    {group.key === "network"
                                                        ? "Saved / manual"
                                                        : scanProgress[
                                                                group.key
                                                            ] === "unavailable"
                                                          ? "Unavailable"
                                                          : scanProgress[
                                                                  group.key
                                                              ] === "error"
                                                            ? "Check access"
                                                            : scanProgress[
                                                                    group.key
                                                                ] === "idle"
                                                              ? "Ready"
                                                              : `${group.entries.length} found`}
                                                </Text>
                                            )}
                                        </View>
                                        {group.key === "usb" && usbReport && (
                                            <View style={styles.progressArea}>
                                                <Text
                                                    accessibilityRole="alert"
                                                    style={styles.copy}
                                                >
                                                    {usbScanSummary(usbReport)}
                                                </Text>
                                                {usbReport.devices.map(
                                                    (device) => (
                                                        <Text
                                                            key={
                                                                device.deviceName
                                                            }
                                                            selectable
                                                            style={
                                                                styles.deviceDetail
                                                            }
                                                        >
                                                            {usbDeviceLabel(
                                                                device,
                                                            )}
                                                        </Text>
                                                    ),
                                                )}
                                            </View>
                                        )}
                                        {scanErrors[group.key] && (
                                            <Text style={styles.groupError}>
                                                {scanErrors[group.key]}
                                            </Text>
                                        )}
                                        {group.entries.length === 0 &&
                                            scanProgress[group.key] !==
                                                "scanning" && (
                                                <Text style={styles.groupEmpty}>
                                                    {scanProgress[group.key] ===
                                                    "idle"
                                                        ? "Start a scan to look for devices."
                                                        : scanProgress[
                                                                group.key
                                                            ] === "unavailable"
                                                          ? group.key ===
                                                                "usb" &&
                                                            Platform.OS ===
                                                                "ios"
                                                              ? "USB OTG scanning is available on Android."
                                                              : "Requires a native development build."
                                                          : group.empty}
                                                </Text>
                                            )}
                                        {group.entries.map((device, index) => (
                                            <Pressable
                                                disabled={busy}
                                                key={`${device.detail}-${index}`}
                                                accessibilityRole="button"
                                                onPress={() =>
                                                    void selectDiscovered(
                                                        device,
                                                    )
                                                }
                                                style={[
                                                    styles.device,
                                                    selected ===
                                                        device.target &&
                                                        styles.selected,
                                                ]}
                                            >
                                                <View style={styles.deviceIcon}>
                                                    <Text
                                                        style={
                                                            styles.deviceIconText
                                                        }
                                                    >
                                                        {group.key ===
                                                        "bluetooth"
                                                            ? "BT"
                                                            : group.key ===
                                                                "usb"
                                                              ? "USB"
                                                              : "LAN"}
                                                    </Text>
                                                </View>
                                                <View style={styles.deviceBody}>
                                                    <Text
                                                        style={
                                                            styles.deviceName
                                                        }
                                                    >
                                                        {device.label}
                                                    </Text>
                                                    <Text
                                                        style={
                                                            styles.deviceDetail
                                                        }
                                                    >
                                                        {device.detail}
                                                    </Text>
                                                </View>
                                                <Text style={styles.chevron}>
                                                    ›
                                                </Text>
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
                                    Connect to the same network as your printer.
                                    Enter its IP address and raw TCP port.
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
                                    disabled={busy}
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
                                            characteristic UUIDs provided by
                                            your printer.
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
                                    Save connection details and print language
                                    on this device for the next session.
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
                                <Text style={styles.fieldLabel}>
                                    Command language
                                </Text>
                                <View style={styles.options}>
                                    {languages.map((language) => (
                                        <Pressable
                                            disabled={busy}
                                            key={language}
                                            accessibilityRole="button"
                                            onPress={() =>
                                                setCommandLanguage(language)
                                            }
                                            style={[
                                                styles.option,
                                                commandLanguage === language &&
                                                    styles.optionSelected,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.optionText,
                                                    commandLanguage ===
                                                        language &&
                                                        styles.optionTextSelected,
                                                ]}
                                            >
                                                {language}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>
                                <Text style={styles.fieldLabel}>
                                    Paper width
                                </Text>
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
                                    disabled={!selected || busy}
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
                                <Text style={styles.cardTitle}>
                                    Test connection
                                </Text>
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
                                        Printing requires a native development
                                        build.
                                    </Text>
                                )}
                            </View>
                        </View>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const createStyles = (c: ThemeColors) =>
    StyleSheet.create({
        workspace: { gap: 20 },
        workspaceWide: {
            flexDirection: "row-reverse",
            alignItems: "flex-start",
            gap: 24,
        },
        sidebar: { gap: 16, minWidth: 0 },
        sidebarWide: { width: 320, flexShrink: 0 },
        setupColumn: { flex: 1, minWidth: 0, gap: 16 },
        screen: { flex: 1, backgroundColor: c.background },
        safe: { flex: 1 },
        content: {
            width: "100%",
            maxWidth: 1180,
            alignSelf: "center",
            padding: 20,
            paddingTop: 28,
            paddingBottom: BottomTabInset + 40,
            gap: 16,
        },
        header: {
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 4,
            flexWrap: "wrap",
        },
        logo: { width: 56, height: 56, flexShrink: 0 },
        themeButton: {
            marginLeft: "auto",
            minHeight: 44,
            paddingHorizontal: 12,
            borderRadius: radii.medium,
            backgroundColor: c.surface,
            justifyContent: "center",
            borderWidth: 1,
            borderColor: c.outlineMuted,
        },
        brand: { color: c.text, fontSize: 21, fontWeight: "800" },
        brandSub: {
            color: c.primary,
            fontSize: 10,
            fontWeight: "800",
            letterSpacing: 2,
        },
        title: {
            color: c.text,
            fontSize: 28,
            lineHeight: 38,
            fontWeight: "800",
        },
        intro: {
            color: c.textSecondary,
            fontSize: 15,
            lineHeight: 22,
            marginTop: -10,
        },
        overview: {
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: c.primarySoft,
            borderRadius: radii.large,
            paddingVertical: 16,
            marginBottom: 2,
        },
        overviewItem: { flex: 1, alignItems: "center", gap: 2 },
        overviewNumber: { color: c.primary, fontSize: 25, fontWeight: "800" },
        overviewLabel: {
            color: c.textSecondary,
            fontSize: 12,
            fontWeight: "600",
        },
        overviewDivider: {
            width: 1,
            height: 34,
            backgroundColor: c.outlineMuted,
        },
        card: {
            backgroundColor: c.surface,
            borderRadius: radii.large,
            padding: 20,
            gap: 12,
            borderWidth: 1,
            borderColor: c.outlineMuted,
        },
        cardHeader: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
        },
        eyebrow: {
            color: c.primary,
            fontSize: 11,
            fontWeight: "800",
            letterSpacing: 1.5,
        },
        cardTitle: { color: c.text, fontSize: 20, fontWeight: "700" },
        copy: { color: c.textSecondary, fontSize: 14, lineHeight: 21 },
        smallButton: {
            backgroundColor: c.primarySoft,
            borderRadius: radii.small,
            paddingHorizontal: 12,
            paddingVertical: 9,
        },
        smallButtonLabel: { color: c.primary, fontWeight: "700", fontSize: 13 },
        primaryButton: {
            backgroundColor: c.primary,
            minHeight: 50,
            borderRadius: radii.medium,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 4,
        },
        disabled: { opacity: 0.5 },
        primaryLabel: { color: c.background, fontWeight: "700", fontSize: 15 },
        status: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
        progressArea: { gap: 7, paddingVertical: 4 },
        progressLabel: {
            color: c.textSecondary,
            fontSize: 12,
            fontWeight: "700",
        },
        progressTrack: {
            height: 6,
            borderRadius: 3,
            backgroundColor: c.primarySoft,
            overflow: "hidden",
        },
        progressFill: { height: "100%", backgroundColor: c.primary },
        group: {
            gap: 8,
            borderTopWidth: 1,
            borderTopColor: c.outlineMuted,
            paddingTop: 12,
        },
        groupHeader: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
        },
        groupTitle: { color: c.text, fontSize: 15, fontWeight: "700" },
        groupCount: { color: c.textSecondary, fontSize: 12, fontWeight: "600" },
        groupError: { color: c.error, fontSize: 12, lineHeight: 17 },
        groupEmpty: { color: c.textSecondary, fontSize: 12, lineHeight: 18 },
        device: {
            borderWidth: 1,
            borderColor: c.outlineMuted,
            borderRadius: radii.medium,
            padding: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
        },
        selected: { borderColor: c.primary, backgroundColor: c.primarySoft },
        deviceIcon: {
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: c.primarySoft,
            alignItems: "center",
            justifyContent: "center",
        },
        deviceIconText: { color: c.primary, fontSize: 10, fontWeight: "800" },
        deviceBody: { flex: 1 },
        deviceName: { color: c.text, fontWeight: "700", fontSize: 15 },
        deviceDetail: { color: c.textSecondary, fontSize: 12, marginTop: 2 },
        chevron: { color: c.primary, fontSize: 24 },
        fieldLabel: {
            color: c.textSecondary,
            fontSize: 13,
            fontWeight: "700",
            marginBottom: -7,
        },
        input: {
            borderWidth: 1,
            borderColor: c.outline,
            borderRadius: radii.medium,
            paddingHorizontal: 14,
            minHeight: 46,
            color: c.text,
            fontSize: 15,
        },
        secondaryButton: {
            minHeight: 46,
            borderRadius: radii.medium,
            backgroundColor: c.primarySoft,
            alignItems: "center",
            justifyContent: "center",
        },
        secondaryLabel: { color: c.primary, fontWeight: "700" },
        note: { color: c.textSecondary, fontSize: 12 },
        options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
        option: {
            borderWidth: 1,
            borderColor: c.outline,
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: radii.small,
        },
        optionSelected: { backgroundColor: c.primary, borderColor: c.primary },
        optionText: { color: c.textSecondary, fontWeight: "700", fontSize: 12 },
        optionTextSelected: { color: c.surface },
        savedRow: {
            borderTopWidth: 1,
            borderTopColor: c.outlineMuted,
            paddingTop: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
        },
        savedDetails: { flex: 1 },
        deleteButton: { padding: 8 },
        deleteText: { color: c.error, fontSize: 12, fontWeight: "700" },
    });
