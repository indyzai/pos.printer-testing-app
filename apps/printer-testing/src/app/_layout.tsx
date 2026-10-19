import { Platform } from "react-native";
import * as Device from "expo-device";
import { traceLog } from "../trace-log";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, type ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
    ThemeProvider,
    AppPaperProvider,
    SnackbarProvider,
    useAppTheme,
} from "@indyzai/pos-ui-native";
import { PrinterAuthProvider } from "../auth/AuthProvider";
import { startClarity } from "../config/clarity";

void SplashScreen.preventAutoHideAsync();
function Notifications({ children }: { children: ReactNode }) {
    const { themeColors } = useAppTheme();
    return <SnackbarProvider colors={themeColors}>{children}</SnackbarProvider>;
}
export default function RootLayout() {
    useEffect(() => {
        traceLog.write("info", "App", "Printer tools started", {
            platform: Platform.OS,
            osVersion: Device.osVersion,
            model: Device.modelName,
            manufacturer: Device.manufacturer,
        });
        void SplashScreen.hideAsync();
        void startClarity();
    }, []);
    return (
        <SafeAreaProvider>
            <ThemeProvider>
                <AppPaperProvider>
                    <Notifications>
                        <PrinterAuthProvider>
                            <Stack screenOptions={{ headerShown: false }}>
                                <Stack.Screen name="(tabs)" />
                                <Stack.Screen name="login" />
                                <Stack.Screen name="signup" />
                                <Stack.Screen name="device-setup" />
                                <Stack.Screen name="auth/callback" />
                            </Stack>
                        </PrinterAuthProvider>
                    </Notifications>
                </AppPaperProvider>
            </ThemeProvider>
        </SafeAreaProvider>
    );
}
