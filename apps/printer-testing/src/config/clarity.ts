import { NativeModules, Platform } from "react-native";

const projectId = process.env.EXPO_PUBLIC_CLARITY_PROJECT_ID ?? "sztjr0z3x0";
let started = false;

export async function startClarity(): Promise<void> {
    if (
        started ||
        Platform.OS === "web" ||
        !NativeModules.Clarity ||
        !NativeModules.ClarityEmitter
    )
        return;

    started = true;
    try {
        const Clarity = await import("@microsoft/react-native-clarity");
        Clarity.setOnSessionStartedCallback(() => {
            void Clarity.setCustomTag("app", "printer-testing");
        });
        Clarity.initialize(projectId);
    } catch (error) {
        started = false;
        console.warn("Unable to start Microsoft Clarity", error);
    }
}
