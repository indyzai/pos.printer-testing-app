export async function copyLogText(value: string): Promise<boolean> {
    const Clipboard = await import("expo-clipboard");
    return Clipboard.setStringAsync(value);
}
