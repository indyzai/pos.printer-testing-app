import { useMemo } from "react";
import { radii, useAppTheme, type ThemeColors } from "@indyzai/pos-ui-native";
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
        body: "Android: connect the powered printer through an OTG adapter and run the USB check. Desktop web: use a compatible Chrome/Edge browser over HTTPS or localhost, press Choose USB printer, and grant access. Some OS drivers prevent the browser from claiming a printer. iPhone/iPad generic USB printing is unavailable; wired accessory support requires an approved manufacturer SDK/protocol.",
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
    const { themeColors } = useAppTheme();
    const styles = useMemo(() => createStyles(themeColors), [themeColors]);
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
                            ? "Use WebUSB for compatible desktop USB printers, or the native Android/iOS app for its supported connections."
                            : "Direct printer access requires a development build with the native printer module. Expo Go cannot scan or print."}
                    </Text>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const createStyles = (c: ThemeColors) =>
    StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.background },
        safe: { flex: 1 },
        content: {
            width: "100%",
            maxWidth: 800,
            alignSelf: "center",
            padding: 20,
            paddingBottom: BottomTabInset + 40,
            gap: 16,
        },
        eyebrow: {
            color: c.primary,
            fontSize: 11,
            fontWeight: "800",
            letterSpacing: 2,
        },
        title: { color: c.text, fontSize: 32, fontWeight: "800" },
        intro: {
            color: c.textSecondary,
            fontSize: 16,
            lineHeight: 23,
            marginTop: -8,
            marginBottom: 8,
        },
        card: {
            backgroundColor: c.surface,
            borderRadius: radii.large,
            padding: 20,
            gap: 8,
            borderWidth: 1,
            borderColor: c.outlineMuted,
        },
        heading: { color: c.text, fontSize: 20, fontWeight: "700" },
        body: { color: c.textSecondary, fontSize: 15, lineHeight: 23 },
        note: {
            color: c.textSecondary,
            fontSize: 13,
            lineHeight: 20,
            textAlign: "center",
            marginTop: 8,
        },
    });
