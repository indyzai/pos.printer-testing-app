import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useAppTheme } from "@indyzai/pos-ui-native";

export default function AppTabs() {
    const { themeColors: colors } = useAppTheme();

    return (
        <NativeTabs
            backgroundColor={colors.background}
            indicatorColor={colors.surface}
            labelStyle={{ selected: { color: colors.text } }}
        >
            <NativeTabs.Trigger name="index">
                <NativeTabs.Trigger.Label>Printers</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    src={require("../../assets/images/tabIcons/home.png")}
                    renderingMode="template"
                />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="explore">
                <NativeTabs.Trigger.Label>Guide</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    src={require("../../assets/images/tabIcons/explore.png")}
                    renderingMode="template"
                />
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="logs">
                <NativeTabs.Trigger.Label>Logs</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    sf="doc.text.magnifyingglass"
                    md="article"
                />
            </NativeTabs.Trigger>
        </NativeTabs>
    );
}
