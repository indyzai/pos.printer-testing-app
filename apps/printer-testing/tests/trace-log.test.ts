import type { PrinterTarget } from "@indyzai/pos-printing-native/types";
import { afterEach, expect, test } from "bun:test";
import { createTraceLog, formatTraceLogs, traceLog } from "../src/trace-log";
import { createTracedPrinterTransport } from "../src/traced-printer-transport";
afterEach(() => traceLog.clear());
test("trace storage is bounded and notifies the live viewer", () => {
    const log = createTraceLog(2);
    let notifications = 0;
    const stop = log.subscribe(() => notifications++);
    for (let i = 0; i < 3; i++) log.write("info", "USB", `event ${i}`);
    expect(log.getSnapshot().map((entry) => entry.message)).toEqual([
        "event 1",
        "event 2",
    ]);
    expect(notifications).toBe(3);
    stop();
    log.clear();
    expect(log.getSnapshot()).toEqual([]);
    expect(notifications).toBe(3);
});
test("copyable logs redact secrets and print contents, including nested values", () => {
    const log = createTraceLog();
    log.write("error", "USB", "token=secret-value", {
        accessToken: "private-token",
        password: "private-password",
        nested: { payload: "print-bytes", content: "receipt contents" },
        error: new Error("Bearer access-secret"),
    });
    const output = formatTraceLogs(log.getSnapshot());
    for (const secret of [
        "secret-value",
        "private-token",
        "private-password",
        "print-bytes",
        "receipt contents",
        "access-secret",
    ])
        expect(output).not.toContain(secret);
    expect(output).toContain("[redacted]");
    expect(output).toContain("ERROR [USB]");
});
test("USB tracing records the full inventory and preserves the scan result", async () => {
    const report = {
        hostSupported: true,
        diagnosticsAvailable: true,
        devices: [
            {
                deviceName: "usb",
                name: "CD410-UB",
                vendorId: 1,
                productId: 2,
                deviceClass: 255,
                hasPermission: false,
                interfaces: [
                    {
                        id: 0,
                        interfaceClass: 7,
                        endpoints: [{ address: 1, type: 2, direction: 0 }],
                    },
                ],
            },
        ],
        printers: [],
    };
    const raw = {
        scanUsb: async () => report,
        listUsb: async () => [],
        listBluetooth: async () => [],
        connect: async (target: PrinterTarget) => target,
        write: async () => ({ bytesWritten: 10 }),
    };
    const transport = createTracedPrinterTransport(raw);
    expect(await transport.scanUsb()).toBe(report);
    expect(formatTraceLogs(traceLog.getSnapshot())).toContain("CD410-UB");
    expect(formatTraceLogs(traceLog.getSnapshot())).toContain(
        '"hasPermission": false',
    );
    expect(formatTraceLogs(traceLog.getSnapshot())).toContain('"direction": 0');
});
test("print tracing records byte counts, excludes actual bytes and propagates failures", async () => {
    const raw = {
        scanUsb: async () => ({
            hostSupported: true,
            diagnosticsAvailable: true,
            devices: [],
            printers: [],
        }),
        listUsb: async () => [],
        listBluetooth: async () => [],
        connect: async (target: PrinterTarget) => target,
        write: async () => ({ bytesWritten: 10 }),
    };
    const transport = createTracedPrinterTransport(raw);
    expect(
        await transport.write({ connection: "usb" }, "sensitive-print-data"),
    ).toEqual({ bytesWritten: 10 });
    expect(formatTraceLogs(traceLog.getSnapshot())).not.toContain(
        "sensitive-print-data",
    );
    raw.write = async () => {
        throw new Error("USB permission denied");
    };
    await expect(
        transport.write({ connection: "usb" }, "bytes"),
    ).rejects.toThrow("USB permission denied");
    expect(traceLog.getSnapshot().at(-1)?.level).toBe("error");
});
