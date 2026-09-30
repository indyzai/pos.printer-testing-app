import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BottomTabInset } from "../constants/theme";

const sections = [
    {
        title: "Bluetooth",
        body: "On Android, pair a Bluetooth SPP printer in system settings before scanning. On iOS, scan for a BLE printer and enter its writable service and characteristic UUIDs before printing.",
    },
    {
        title: "USB and USB OTG",
        body: "Connect and power the printer with an OTG cable, then scan. Tap the USB result and allow Android device access before printing. Generic USB host printing is unavailable on iOS.",
    },
    {
        title: "Wi-Fi and Ethernet",
        body: "Connect your phone and printer to the same network. Find the printer IP address in its settings, then enter the address and raw TCP port (often 9100). Network printers are configured by address rather than broadcast scanned.",
    },
    {
        title: "Test receipts",
        body: "Select a printer and send the test receipt. Confirm the output on the device. This test uses ESC/POS commands, so choose a compatible receipt printer.",
    },
];

export default function GuideScreen() {
    return (
        <View style={styles.screen}>
            <SafeAreaView style={styles.safe}>
                <ScrollView contentContainerStyle={styles.content}>
                    <Text style={styles.eyebrow}>INDYZAI PRINTER TESTING</Text>
                    <Text style={styles.title}>Connection guide</Text>
                    <Text style={styles.intro}>
                        Set up the printer transport that matches your hardware.
                    </Text>
                    {sections.map((section) => (
                        <View style={styles.card} key={section.title}>
                            <Text style={styles.heading}>{section.title}</Text>
                            <Text style={styles.body}>{section.body}</Text>
                        </View>
                    ))}
                    <Text style={styles.note}>
                        {Platform.OS === "web"
                            ? "Use an Android or iOS development build for direct printer access."
                            : "Direct printer access requires a development build with the native printer module. Expo Go cannot scan or print."}
                    </Text>
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
        maxWidth: 680,
        alignSelf: "center",
        padding: 20,
        paddingBottom: BottomTabInset + 40,
        gap: 16,
    },
    eyebrow: {
        color: "#1B6EF3",
        fontSize: 11,
        fontWeight: "800",
        letterSpacing: 2,
    },
    title: { color: "#1A1C1E", fontSize: 32, fontWeight: "800" },
    intro: {
        color: "#43474F",
        fontSize: 16,
        lineHeight: 23,
        marginTop: -8,
        marginBottom: 8,
    },
    card: {
        backgroundColor: "#FFFFFF",
        borderRadius: 20,
        padding: 20,
        gap: 8,
        borderWidth: 1,
        borderColor: "#E5E9F0",
    },
    heading: { color: "#1A1C1E", fontSize: 20, fontWeight: "700" },
    body: { color: "#43474F", fontSize: 15, lineHeight: 23 },
    note: {
        color: "#43474F",
        fontSize: 13,
        lineHeight: 20,
        textAlign: "center",
        marginTop: 8,
    },
});
