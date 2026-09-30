import type { PrinterTarget } from "@indyzai/pos-printing-native/types";

const unavailable = () =>
    Promise.reject(
        new Error(
            "Printer access requires an Android or iOS development build.",
        ),
    );

export const printerTransport = {
    listBluetooth: unavailable,
    listUsb: unavailable,
    connect: (_target: PrinterTarget): Promise<PrinterTarget> => unavailable(),
    write: (
        _target: PrinterTarget,
        _base64: string,
    ): Promise<{ bytesWritten: number }> => unavailable(),
};
