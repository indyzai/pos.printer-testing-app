import { useState, useSyncExternalStore } from "react";
import { FlatList, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { copyLogText } from "../copy-log-text";
import { AppPressable, useAppTheme } from "@indyzai/pos-ui-native";
import { BottomTabInset } from "../constants/theme";
import { formatTraceLogs, traceLog, type TraceEntry } from "../trace-log";

export default function LogsScreen() {
    const { themeColors: c } = useAppTheme();
    const entries = useSyncExternalStore(
        traceLog.subscribe,
        traceLog.getSnapshot,
        traceLog.getSnapshot,
    );
    const [status, setStatus] = useState("");
    const [copying, setCopying] = useState(false);
    async function copy(value: TraceEntry[]) {
        if (copying) return;
        setCopying(true);
        try {
            const copied = await copyLogText(formatTraceLogs(value));
            setStatus(
                copied
                    ? `${value.length} log ${value.length === 1 ? "entry" : "entries"} copied.`
                    : "Could not copy. Select the log text to copy manually.",
            );
        } catch {
            setStatus("Could not copy. Select the log text to copy manually.");
        } finally {
            setCopying(false);
        }
    }
    return (
        <SafeAreaView style={[s.screen, { backgroundColor: c.background }]}>
            <View style={s.content}>
                <Text style={[s.title, { color: c.text }]}>Trace logs</Text>
                <Text style={[s.copy, { color: c.textSecondary }]}>
                    Reproduce the printer issue, then copy the logs here. The
                    latest 500 events are kept for this app session.
                </Text>
                <View style={s.toolbar}>
                    <Text style={[s.count, { color: c.textSecondary }]}>
                        {entries.length} events
                    </Text>
                    <AppPressable
                        accessibilityRole="button"
                        disabled={!entries.length || copying}
                        onPress={() => void copy(entries)}
                        style={[
                            s.button,
                            {
                                backgroundColor: c.primarySoft,
                                opacity: entries.length && !copying ? 1 : 0.5,
                            },
                        ]}
                    >
                        <Text style={[s.action, { color: c.primary }]}>
                            {copying ? "Copying…" : "Copy all logs"}
                        </Text>
                    </AppPressable>
                    <AppPressable
                        accessibilityRole="button"
                        disabled={!entries.length}
                        onPress={() => {
                            traceLog.clear();
                            setStatus("Logs cleared.");
                        }}
                        style={[
                            s.button,
                            { borderWidth: 1, borderColor: c.outlineMuted },
                        ]}
                    >
                        <Text style={[s.action, { color: c.textSecondary }]}>
                            Clear
                        </Text>
                    </AppPressable>
                </View>
                {!!status && (
                    <Text
                        accessibilityRole="alert"
                        style={[s.copy, { color: c.textSecondary }]}
                    >
                        {status}
                    </Text>
                )}
                <FlatList
                    data={[...entries].reverse()}
                    keyExtractor={(entry) => String(entry.id)}
                    contentContainerStyle={{
                        gap: 12,
                        paddingBottom: BottomTabInset + 24,
                    }}
                    ListEmptyComponent={
                        <Text style={[s.copy, { color: c.textSecondary }]}>
                            No events yet. Run a scan or send a test print to
                            start tracing.
                        </Text>
                    }
                    renderItem={({ item }) => (
                        <View
                            style={[
                                s.entry,
                                {
                                    backgroundColor: c.surface,
                                    borderColor: c.outlineMuted,
                                },
                            ]}
                        >
                            <View style={s.entryHeader}>
                                <Text
                                    style={[
                                        s.meta,
                                        {
                                            color:
                                                item.level === "error"
                                                    ? c.error
                                                    : c.primary,
                                        },
                                    ]}
                                >
                                    {item.level.toUpperCase()} · {item.scope}
                                </Text>
                                <AppPressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`Copy log ${item.id}`}
                                    onPress={() => void copy([item])}
                                    disabled={copying}
                                    style={s.copyButton}
                                >
                                    <Text
                                        style={[s.action, { color: c.primary }]}
                                    >
                                        Copy
                                    </Text>
                                </AppPressable>
                            </View>
                            <Text
                                selectable
                                style={[s.mono, { color: c.textSecondary }]}
                            >
                                {item.timestamp}
                            </Text>
                            <Text
                                selectable
                                style={[s.message, { color: c.text }]}
                            >
                                {item.message}
                            </Text>
                            {item.details !== undefined && (
                                <Text
                                    selectable
                                    style={[s.mono, { color: c.textSecondary }]}
                                >
                                    {JSON.stringify(item.details, null, 2)}
                                </Text>
                            )}
                        </View>
                    )}
                />
            </View>
        </SafeAreaView>
    );
}
const s = StyleSheet.create({
    screen: { flex: 1 },
    content: {
        flex: 1,
        width: "100%",
        maxWidth: 1180,
        alignSelf: "center",
        padding: 20,
        gap: 14,
    },
    title: { fontSize: 28, fontWeight: "800" },
    copy: { fontSize: 14, lineHeight: 21 },
    toolbar: {
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
    },
    count: { marginRight: "auto", fontSize: 13 },
    button: {
        minHeight: 44,
        borderRadius: 12,
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    action: { fontSize: 13, fontWeight: "700" },
    entry: { padding: 16, borderWidth: 1, borderRadius: 16, gap: 8 },
    entryHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
    },
    meta: { fontSize: 12, fontWeight: "800", flexShrink: 1 },
    copyButton: {
        minHeight: 44,
        minWidth: 44,
        justifyContent: "center",
        alignItems: "center",
    },
    message: { fontSize: 14, fontWeight: "600" },
    mono: {
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        fontSize: 12,
        lineHeight: 18,
    },
});
