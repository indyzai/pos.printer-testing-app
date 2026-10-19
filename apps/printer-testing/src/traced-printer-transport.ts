import type {
    PrinterTarget,
    UsbPrinter,
    UsbScanReport,
} from "@indyzai/pos-printing-native/types";
import { traceOperation } from "./trace-log";

type Transport = {
    listUsb: () => Promise<UsbPrinter[]>;
    scanUsb: () => Promise<UsbScanReport>;
    listBluetooth: () => Promise<{ name: string; address: string }[]>;
    connect: (target: PrinterTarget) => Promise<PrinterTarget>;
    write: (
        target: PrinterTarget,
        data: string,
    ) => Promise<{ bytesWritten: number }>;
};
export function createTracedPrinterTransport(transport: Transport): Transport {
    return {
        listUsb: () =>
            traceOperation(
                "USB",
                "List print connections",
                () => transport.listUsb(),
                undefined,
                (result) => result,
            ),
        scanUsb: () =>
            traceOperation(
                "USB",
                "Inspect OTG devices",
                () => transport.scanUsb(),
                undefined,
                (report) => report,
            ),
        listBluetooth: () =>
            traceOperation(
                "Bluetooth",
                "List paired printers",
                () => transport.listBluetooth(),
                undefined,
                (devices) => ({ deviceCount: devices.length }),
            ),
        connect: (target) =>
            traceOperation(
                "Printer",
                target.connection === "usb"
                    ? "USB permission and connection"
                    : "Connect",
                () => transport.connect(target),
                target,
                (result) => result,
            ),
        write: (target, data) =>
            traceOperation(
                "Printer",
                "Send print bytes",
                () => transport.write(target, data),
                { target, encodedLength: data.length },
                (result) => result,
            ),
    };
}
