import type {
    PrinterTarget,
    UsbPrinter,
    UsbScanReport,
} from "@indyzai/pos-printing-native/types";

export type WebUsbAlternate = {
    alternateSetting: number;
    interfaceClass: number;
    endpoints: {
        endpointNumber: number;
        direction: "in" | "out";
        type: string;
    }[];
};
export type WebUsbConfiguration = {
    configurationValue: number;
    interfaces: {
        interfaceNumber: number;
        alternate: WebUsbAlternate;
        alternates: WebUsbAlternate[];
    }[];
};
export type WebUsbDevice = {
    vendorId: number;
    productId: number;
    productName?: string;
    serialNumber?: string;
    deviceClass: number;
    opened: boolean;
    configuration: WebUsbConfiguration | null;
    configurations: WebUsbConfiguration[];
    open(): Promise<void>;
    close(): Promise<void>;
    selectConfiguration(value: number): Promise<void>;
    claimInterface(value: number): Promise<void>;
    releaseInterface(value: number): Promise<void>;
    selectAlternateInterface(value: number, alternate: number): Promise<void>;
    transferOut(
        endpoint: number,
        data: Uint8Array,
    ): Promise<{ status: string; bytesWritten: number }>;
};
export type WebUsbApi = {
    getDevices(): Promise<WebUsbDevice[]>;
    requestDevice(options: { filters: object[] }): Promise<WebUsbDevice>;
};
function browserUsb(): WebUsbApi | null {
    if (typeof navigator === "undefined" || !globalThis.isSecureContext)
        return null;
    return (navigator as Navigator & { usb?: WebUsbApi }).usb ?? null;
}
const deviceKey = (device: WebUsbDevice) =>
    `webusb:${JSON.stringify([device.vendorId, device.productId, device.serialNumber || null])}`;
function connections(device: WebUsbDevice): UsbPrinter[] {
    return device.configurations.flatMap((config) =>
        config.interfaces.flatMap((intf) =>
            intf.alternates.flatMap((alt) =>
                alt.endpoints
                    .filter(
                        (endpoint) =>
                            endpoint.type === "bulk" &&
                            endpoint.direction === "out",
                    )
                    .map((endpoint) => ({
                        deviceName: deviceKey(device),
                        name:
                            device.productName ||
                            `USB ${device.vendorId.toString(16)}:${device.productId.toString(16)}`,
                        vendorId: device.vendorId,
                        productId: device.productId,
                        configurationValue: config.configurationValue,
                        interfaceId: intf.interfaceNumber,
                        alternateSetting: alt.alternateSetting,
                        endpointAddress: endpoint.endpointNumber,
                    })),
            ),
        ),
    );
}
export function createWebUsbTransport(
    getUsb: () => WebUsbApi | null = browserUsb,
    timeoutMs = 30000,
) {
    let busy = false;
    function usb() {
        const api = getUsb();
        if (!api)
            throw new Error(
                "WebUSB is unavailable. Use a compatible Chrome/Edge browser over HTTPS or localhost. On iPhone/iPad use the native app's BLE or network connection.",
            );
        return api;
    }
    async function inventory(): Promise<UsbScanReport> {
        const devices = await usb().getDevices();
        return {
            hostSupported: true,
            diagnosticsAvailable: true,
            printers: devices.flatMap(connections),
            devices: devices.map((device) => ({
                deviceName: deviceKey(device),
                name: device.productName || "USB device",
                vendorId: device.vendorId,
                productId: device.productId,
                deviceClass: device.deviceClass,
                hasPermission: true,
                interfaces: device.configurations.flatMap((config) =>
                    config.interfaces.flatMap((intf) =>
                        intf.alternates.map((alt) => ({
                            id: intf.interfaceNumber,
                            interfaceClass: alt.interfaceClass,
                            endpoints: alt.endpoints.map((ep) => ({
                                address:
                                    ep.endpointNumber |
                                    (ep.direction === "in" ? 128 : 0),
                                type:
                                    ep.type === "bulk"
                                        ? 2
                                        : ep.type === "interrupt"
                                          ? 3
                                          : 1,
                                direction: ep.direction === "in" ? 128 : 0,
                            })),
                        })),
                    ),
                ),
            })),
        };
    }
    async function withDevice<T>(
        target: PrinterTarget,
        action: (device: WebUsbDevice, resolved: UsbPrinter) => Promise<T>,
    ): Promise<T> {
        if (busy) throw new Error("A USB operation is already running.");
        if (target.connection !== "usb")
            throw new Error(
                "This browser transport supports USB printers only. Use a native app for raw network or Bluetooth printing.",
            );
        busy = true;
        let device: WebUsbDevice | undefined;
        let claimed = false;
        try {
            const candidates = (await usb().getDevices()).filter(
                (entry) => deviceKey(entry) === target.deviceName,
            );
            if (candidates.length !== 1)
                throw new Error(
                    "USB printer missing or ambiguous. Choose the printer again; connect only one identical device if it has no serial number.",
                );
            device = candidates[0];
            const resolved = connections(device).find(
                (entry) =>
                    entry.interfaceId === target.interfaceId &&
                    entry.endpointAddress === target.endpointAddress &&
                    (target.configurationValue === undefined ||
                        entry.configurationValue ===
                            target.configurationValue) &&
                    (target.alternateSetting === undefined ||
                        entry.alternateSetting === target.alternateSetting),
            );
            if (!resolved)
                throw new Error(
                    "The selected USB bulk-output connection is unavailable. Choose the printer again.",
                );
            if (!device.opened) await device.open();
            if (
                device.configuration?.configurationValue !==
                resolved.configurationValue
            )
                await device.selectConfiguration(resolved.configurationValue!);
            try {
                await device.claimInterface(resolved.interfaceId);
                claimed = true;
            } catch {
                throw new Error(
                    "Cannot claim the printer's USB interface. Another app or the OS printer driver may own it, or this browser may restrict it. Close competing printer apps or use the native/system printer transport.",
                );
            }
            const active = device.configuration?.interfaces.find(
                (entry) => entry.interfaceNumber === resolved.interfaceId,
            );
            if (
                active?.alternate.alternateSetting !== resolved.alternateSetting
            )
                await device.selectAlternateInterface(
                    resolved.interfaceId,
                    resolved.alternateSetting!,
                );
            return await action(device, resolved);
        } finally {
            if (device) {
                if (claimed)
                    await device
                        .releaseInterface(target.interfaceId!)
                        .catch(() => undefined);
                if (device.opened) await device.close().catch(() => undefined);
            }
            busy = false;
        }
    }
    return {
        capabilities: () => ({
            usb: !!getUsb(),
            bluetooth: false,
            network: false,
            system: false,
        }),
        scanUsb: inventory,
        requestUsb: async (): Promise<UsbScanReport> => {
            // Invoke directly from the button's call stack, before any await: WebUSB requires user activation.
            try {
                await usb().requestDevice({ filters: [] });
            } catch (error) {
                if (error instanceof Error && error.name === "NotFoundError")
                    throw new Error(
                        "No USB printer selected. Choose a USB printer to grant browser access.",
                    );
                throw error;
            }
            return inventory();
        },
        listUsb: async () => (await inventory()).printers,
        listBluetooth: async (): Promise<
            { name: string; address: string }[]
        > => {
            throw new Error(
                "Use the native Android/iOS app for Bluetooth printer discovery.",
            );
        },
        connect: (target: PrinterTarget) =>
            withDevice(target, async (_device, resolved) => ({
                ...target,
                ...resolved,
            })),
        write: async (target: PrinterTarget, encoded: string) => {
            if (
                !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
                    encoded,
                ) ||
                !encoded.length ||
                encoded.length > 1398104
            )
                throw new Error(
                    "Print data must be valid base64 between 1 byte and 1 MB.",
                );
            const bytes = Uint8Array.from(atob(encoded), (char) =>
                char.charCodeAt(0),
            );
            if (!bytes.length || bytes.length > 1048576)
                throw new Error("Print data must be between 1 byte and 1 MB.");
            return withDevice(target, async (device, resolved) => {
                let offset = 0;
                const deadline = Date.now() + timeoutMs;
                try {
                    while (offset < bytes.length) {
                        if (Date.now() >= deadline)
                            throw new Error("USB transmission timed out.");
                        const chunk = bytes.subarray(
                            offset,
                            Math.min(offset + 16384, bytes.length),
                        );
                        let timer: ReturnType<typeof setTimeout> | undefined;
                        let result: { status: string; bytesWritten: number };
                        try {
                            result = await Promise.race([
                                device.transferOut(
                                    resolved.endpointAddress & 15,
                                    chunk,
                                ),
                                new Promise<never>((_resolve, reject) => {
                                    timer = setTimeout(
                                        () => {
                                            void device
                                                .close()
                                                .catch(() => undefined);
                                            reject(
                                                new Error(
                                                    "USB transmission timed out.",
                                                ),
                                            );
                                        },
                                        Math.max(1, deadline - Date.now()),
                                    );
                                }),
                            ]);
                        } finally {
                            clearTimeout(timer);
                        }
                        if (
                            result.status !== "ok" ||
                            !Number.isInteger(result.bytesWritten) ||
                            result.bytesWritten <= 0 ||
                            result.bytesWritten > chunk.length
                        )
                            throw new Error(
                                `USB transfer incomplete at byte ${offset}.`,
                            );
                        offset += result.bytesWritten;
                    }
                    return { bytesWritten: offset };
                } catch (error) {
                    throw new Error(
                        `Print outcome uncertain after ${offset} bytes. Check the paper before retrying. ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            });
        },
    };
}
