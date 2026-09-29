import { describe, expect, test } from "bun:test";
import { networkPrinterTarget, testPayloadFor } from "../src/printer-test-data";

describe("network printer configuration", () => {
    test("normalizes address and port", () => {
        expect(networkPrinterTarget(" 192.168.1.100 ", "9100")).toEqual({
            connection: "network", address: "192.168.1.100", port: 9100,
        });
    });

    test.each(["", "0", "65536", "1.5", "abc"])("rejects invalid port %s", (port) => {
        expect(() => networkPrinterTarget("printer.local", port)).toThrow();
    });

    test("rejects blank addresses", () => {
        expect(() => networkPrinterTarget("  ", "9100")).toThrow();
    });
});

describe("test print payloads", () => {
    test("ESC/POS starts with initialize and contains a print test", () => {
        const bytes = Buffer.from(testPayloadFor("ESC/POS"), "base64");
        expect(bytes.subarray(0, 2).equals(Buffer.from([0x1b, 0x40]))).toBe(true);
        expect(bytes.toString()).toContain("Connection test");
    });

    test.each(["ZPL", "EPL", "CPCL"] as const)("%s has a complete language-specific label", (language) => {
        const text = Buffer.from(testPayloadFor(language), "base64").toString();
        expect(text).toContain("IndyzAI Printer Lab");
        expect(text).toContain("Connection test OK");
        if (language === "ZPL") expect(text).toMatch(/^\^XA[\s\S]*\^XZ$/);
        if (language === "EPL") expect(text).toMatch(/^N\n[\s\S]*P1\n$/);
        if (language === "CPCL") expect(text).toMatch(/^! 0 [\s\S]*PRINT\n$/);
    });
});
