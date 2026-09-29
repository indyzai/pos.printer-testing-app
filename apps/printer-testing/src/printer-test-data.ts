import type { PrinterTarget } from "@indyzai/pos-printing-native/types";
import type { CommandLanguage } from "./printer-config";

const payloads: Record<CommandLanguage, string> = {
    "ESC/POS":
        "G0AbYQFJbmR5ekFJIFByaW50ZXIgTGFiChthAENvbm5lY3Rpb24gdGVzdApQcmludCBwYXRoIGlzIHdvcmtpbmcuCgoKHVYA",
    ZPL: "XlhBXkZPMzAsMzBeQTBOLDMyLDMyXkZESW5keXpBSSBQcmludGVyIExhYl5GU15GTzMwLDgwXkEwTiwyNSwyNV5GRENvbm5lY3Rpb24gdGVzdCBPS15GU15YWg==",
    EPL: "TgpBMjAsMjAsMCwzLDEsMSxOLCJJbmR5ekFJIFByaW50ZXIgTGFiIgpBMjAsNzAsMCwyLDEsMSxOLCJDb25uZWN0aW9uIHRlc3QgT0siClAxCg==",
    CPCL: "ISAwIDIwMCAyMDAgMjAwIDEKVEVYVCA0IDAgMjAgMjAgSW5keXpBSSBQcmludGVyIExhYgpURVhUIDAgMCAyMCA4MCBDb25uZWN0aW9uIHRlc3QgT0sKRk9STQpQUklOVAo=",
};

export function testPayloadFor(language: CommandLanguage): string {
    return payloads[language];
}

export function networkPrinterTarget(
    host: string,
    port: string,
): PrinterTarget {
    const address = host.trim();
    const parsedPort = Number(port);
    if (
        !address ||
        !/^\d+$/.test(port.trim()) ||
        !Number.isInteger(parsedPort) ||
        parsedPort < 1 ||
        parsedPort > 65535
    ) {
        throw new Error(
            "Enter a printer IP address or hostname and a valid TCP port.",
        );
    }
    return { connection: "network", address, port: parsedPort };
}
