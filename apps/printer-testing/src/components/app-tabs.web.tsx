import {
    TabList,
    type TabListProps,
    Tabs,
    TabSlot,
    TabTrigger,
    type TabTriggerSlotProps,
} from "expo-router/ui";
import { StyleSheet, Text, View } from "react-native";
import {
    AppPressable as Pressable,
    PosLogo,
    useAppTheme,
} from "@indyzai/pos-ui-native";

export default function AppTabs() {
    const { themeColors: c } = useAppTheme();
    return (
        <Tabs style={{ flex: 1, minHeight: 0, backgroundColor: c.background }}>
            <TabList asChild>
                <CustomTabList>
                    <TabTrigger name="home" href="/" asChild>
                        <TabButton>Printers</TabButton>
                    </TabTrigger>
                    <TabTrigger name="explore" href="/explore" asChild>
                        <TabButton>Guide</TabButton>
                    </TabTrigger>
                    <TabTrigger name="logs" href="/logs" asChild>
                        <TabButton>Logs</TabButton>
                    </TabTrigger>
                </CustomTabList>
            </TabList>
            <TabSlot style={{ flex: 1, minHeight: 0 }} />
        </Tabs>
    );
}
export function TabButton({
    children,
    isFocused,
    ...props
}: TabTriggerSlotProps) {
    const { themeColors: c } = useAppTheme();
    return (
        <Pressable
            {...props}
            style={({ pressed }) => [
                styles.tabButton,
                {
                    backgroundColor: isFocused ? c.primarySoft : "transparent",
                    opacity: pressed ? 0.7 : 1,
                },
            ]}
        >
            <Text
                style={[
                    styles.tabLabel,
                    { color: isFocused ? c.primary : c.textSecondary },
                ]}
            >
                {children}
            </Text>
        </Pressable>
    );
}
export function CustomTabList({ children, ...props }: TabListProps) {
    const { themeColors: c } = useAppTheme();
    return (
        <View
            {...props}
            style={[
                styles.navigation,
                {
                    backgroundColor: c.surface,
                    borderBottomColor: c.outlineMuted,
                },
            ]}
        >
            <View style={styles.inner}>
                <View style={styles.brand}>
                    <View style={styles.mark}>
                        <PosLogo size={36} color={c.primary} />
                    </View>
                    <Text
                        numberOfLines={1}
                        style={[styles.brandLabel, { color: c.text }]}
                    >
                        Printer tools
                    </Text>
                </View>
                <View style={styles.links}>{children}</View>
            </View>
        </View>
    );
}
const styles = StyleSheet.create({
    navigation: { width: "100%", borderBottomWidth: 1, flexShrink: 0 },
    inner: {
        width: "100%",
        maxWidth: 1180,
        alignSelf: "center",
        minHeight: 72,
        paddingHorizontal: 20,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
    },
    brand: {
        flexGrow: 1,
        flexShrink: 0,
        minWidth: 140,
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
    },
    mark: { width: 36, height: 36, flexShrink: 0 },
    brandLabel: { fontSize: 15, fontWeight: "800", flexShrink: 1 },
    links: { flexDirection: "row", gap: 4, flexShrink: 0 },
    tabButton: {
        minHeight: 44,
        borderRadius: 10,
        paddingHorizontal: 16,
        justifyContent: "center",
        alignItems: "center",
    },
    tabLabel: { fontSize: 14, fontWeight: "700" },
});
