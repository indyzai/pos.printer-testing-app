import * as Clipboard from "expo-clipboard";
export function copyLogText(value: string): Promise<boolean> {
    return Clipboard.setStringAsync(value);
}
