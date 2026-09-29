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

type FoundPrinter = { label: string; detail: string; target: PrinterTarget };
const testReceipt =
    "G0AbYQFJbmR5ekFJIFByaW50ZXIgTGFiChthAENvbm5lY3Rpb24gdGVzdApQcmludCBwYXRoIGlzIHdvcmtpbmcuCgoKHVYA";
const testLabels: Record<Exclude<CommandLanguage, "ESC/POS">, string> = {
    ZPL: "XlhBXkZPMzAsMzBeQTBOLDMyLDMyXkZESW5keXpBSSBQcmludGVyIExhYl5GU15GTzMwLDgwXkEwTiwyNSwyNV5GRENvbm5lY3Rpb24gdGVzdCBPS15GU15YWg==",
    EPL: "TgpBMjAsMjAsMCwzLDEsMSxOLCJJbmR5ekFJIFByaW50ZXIgTGFiIgpBMjAsNzAsMCwyLDEsMSxOLCJDb25uZWN0aW9uIHRlc3QgT0siClAxCg==",
    CPCL: "ISAwIDIwMCAyMDAgMjAwIDEKVEVYVCA0IDAgMjAgMjAgSW5keXpBSSBQcmludGVyIExhYgpURVhUIDAgMCAyMCA4MCBDb25uZWN0aW9uIHRlc3QgT0sKRk9STQpQUklOVAo=",
};
const languages: CommandLanguage[] = ["ESC/POS", "ZPL", "EPL", "CPCL"];

export default function HomeScreen() {
    const [devices, setDevices] = useState<FoundPrinter[]>([]);
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

    async function scan() {
        setBusy(true);
        setDevices([]);
        setSelected(null);
        setActiveConfigId(null);
        setMessage("Checking available connections…");
        if (!isNative) {
            setMessage(
                "Direct Bluetooth and USB scanning requires an Android or iOS development build. Add a Wi-Fi printer below.",
            );
            setBusy(false);
            return;
        }
        const jobs: Promise<FoundPrinter[]>[] = [
            printerTransport.listBluetooth().then((found) =>
                found.map((device) => ({
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
                printerTransport.listUsb().then((found) =>
                    found.map((device) => ({
                        label: device.name,
                        detail: `USB OTG · ${device.vendorId}:${device.productId}`,
                        target: { connection: "usb" as const, ...device },
                    })),
                ),
            );
        }
        const results = await Promise.allSettled(jobs);
        const found = results.flatMap((result) =>
            result.status === "fulfilled" ? result.value : [],
        );
        const errors = results.flatMap((result) =>
            result.status === "rejected"
                ? [
                      String(
                          result.reason instanceof Error
                              ? result.reason.message
                              : result.reason,
                      ),
                  ]
                : [],
        );
        setDevices(found);
        setMessage(
            found.length
                ? `${found.length} printer endpoint${found.length === 1 ? "" : "s"} found. Select one to test.`
                : "No Bluetooth or USB printers found. Check pairing, cable, power, and permissions.",
        );
        if (errors.length)
            setMessage(
                (found.length ? `${found.length} found. ` : "") +
                    errors.join(" "),
            );
        setBusy(false);
    }

    function selectNetwork() {
        const parsedPort = Number(port);
        if (
            !host.trim() ||
            !Number.isInteger(parsedPort) ||
            parsedPort < 1 ||
            parsedPort > 65535
        ) {
            setMessage(
                "Enter a printer IP address or hostname and a valid TCP port.",
            );
            return;
        }
        setSelected({
            connection: "network",
            address: host.trim(),
            port: parsedPort,
        });
        setActiveConfigId(null);
        setMessage(
            `Network printer set to ${host.trim()}:${parsedPort}. Send a test receipt to check it.`,
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
                commandLanguage === "ESC/POS"
                    ? testReceipt
                    : testLabels[commandLanguage],
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
                            <Text style={styles.brandSub}>PRINTER TESTING</Text>
                        </View>
                    </View>
                    <Text style={styles.title}>Find and test your printer</Text>
                    <Text style={styles.intro}>
                        Discover nearby printers, configure a connection, and
                        send a test receipt.
                    </Text>
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Scan connections</Text>
                        <Text style={styles.copy}>
                            Bluetooth{" "}
                            {Platform.OS === "ios" ? "LE" : "paired devices"} ·{" "}
                            {Platform.OS === "android"
                                ? "USB / USB OTG"
                                : "USB OTG on Android"}{" "}
                            · Wi-Fi / LAN setup
                        </Text>
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
                        {devices.map((device, index) => (
                            <Pressable
                                key={`${device.detail}-${index}`}
                                accessibilityRole="button"
                                onPress={() => {
                                    setSelected(device.target);
                                    setActiveConfigId(null);
                                    setConfigName(device.label);
                                    setMessage(
                                        `${device.label} selected. Send a test print to check it.`,
                                    );
                                }}
                                style={[
                                    styles.device,
                                    selected === device.target &&
                                        styles.selected,
                                ]}
                            >
                                <View style={styles.deviceIcon}>
                                    <Text style={styles.deviceIconText}>▣</Text>
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
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>
                            Wi-Fi / network printer
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
                            placeholderTextColor="#8992B4"
                            style={styles.input}
                        />
                        <Text style={styles.fieldLabel}>TCP port</Text>
                        <TextInput
                            accessibilityLabel="Printer TCP port"
                            keyboardType="numeric"
                            value={port}
                            onChangeText={setPort}
                            placeholder="9100"
                            placeholderTextColor="#8992B4"
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
                                    placeholderTextColor="#8992B4"
                                    style={styles.input}
                                />
                                <TextInput
                                    accessibilityLabel="BLE characteristic UUID"
                                    autoCapitalize="none"
                                    value={characteristicUuid}
                                    onChangeText={setCharacteristicUuid}
                                    placeholder="Writable characteristic UUID"
                                    placeholderTextColor="#8992B4"
                                    style={styles.input}
                                />
                            </View>
                        )}
                    <View style={styles.card}>
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
                            placeholderTextColor="#8992B4"
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
                            placeholderTextColor="#8992B4"
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
                        {configs.map((config) => (
                            <View key={config.id} style={styles.savedRow}>
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
    screen: { flex: 1, backgroundColor: "#F7F8FF" },
    safe: { flex: 1 },
    content: {
        width: "100%",
        maxWidth: 680,
        alignSelf: "center",
        padding: 20,
        paddingBottom: BottomTabInset + 40,
        gap: 18,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
    },
    logo: { width: 44, height: 44, borderRadius: 12 },
    brand: { color: "#17265A", fontSize: 22, fontWeight: "800" },
    brandSub: {
        color: "#5867B8",
        fontSize: 10,
        fontWeight: "800",
        letterSpacing: 2,
    },
    title: {
        color: "#17265A",
        fontSize: 32,
        lineHeight: 38,
        fontWeight: "800",
    },
    intro: { color: "#657197", fontSize: 16, lineHeight: 23, marginTop: -10 },
    card: {
        backgroundColor: "#FFFFFF",
        borderRadius: 22,
        padding: 20,
        gap: 12,
        borderWidth: 1,
        borderColor: "#E8EBFA",
    },
    cardTitle: { color: "#17265A", fontSize: 20, fontWeight: "700" },
    copy: { color: "#657197", fontSize: 14, lineHeight: 21 },
    primaryButton: {
        backgroundColor: "#4055B4",
        minHeight: 50,
        borderRadius: 13,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 4,
    },
    disabled: { opacity: 0.5 },
    primaryLabel: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
    status: { color: "#52629B", fontSize: 13, lineHeight: 19 },
    device: {
        borderWidth: 1,
        borderColor: "#E7EAF7",
        borderRadius: 14,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    selected: { borderColor: "#4055B4", backgroundColor: "#F1F3FF" },
    deviceIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: "#E9ECFF",
        alignItems: "center",
        justifyContent: "center",
    },
    deviceIconText: { color: "#4055B4", fontSize: 22 },
    deviceBody: { flex: 1 },
    deviceName: { color: "#17265A", fontWeight: "700", fontSize: 15 },
    deviceDetail: { color: "#657197", fontSize: 12, marginTop: 2 },
    chevron: { color: "#4055B4", fontSize: 24 },
    fieldLabel: {
        color: "#324174",
        fontSize: 13,
        fontWeight: "700",
        marginBottom: -7,
    },
    input: {
        borderWidth: 1,
        borderColor: "#DDE2F4",
        borderRadius: 12,
        paddingHorizontal: 14,
        minHeight: 46,
        color: "#17265A",
        fontSize: 15,
    },
    secondaryButton: {
        minHeight: 46,
        borderRadius: 12,
        backgroundColor: "#E9ECFF",
        alignItems: "center",
        justifyContent: "center",
    },
    secondaryLabel: { color: "#4055B4", fontWeight: "700" },
    note: { color: "#657197", fontSize: 12 },
    options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    option: {
        borderWidth: 1,
        borderColor: "#DDE2F4",
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 9,
    },
    optionSelected: { backgroundColor: "#4055B4", borderColor: "#4055B4" },
    optionText: { color: "#52629B", fontWeight: "700", fontSize: 12 },
    optionTextSelected: { color: "#FFFFFF" },
    savedRow: {
        borderTopWidth: 1,
        borderTopColor: "#E8EBFA",
        paddingTop: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    savedDetails: { flex: 1 },
    deleteButton: { padding: 8 },
    deleteText: { color: "#BB3D59", fontSize: 12, fontWeight: "700" },
});
