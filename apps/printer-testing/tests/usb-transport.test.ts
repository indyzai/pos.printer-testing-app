import { expect, mock, test } from "bun:test";
const report = {
    hostSupported: true,
    diagnosticsAvailable: true,
    devices: [],
    printers: [],
};
let bluetoothPermissionRequests = 0;
const nativeModule: {
    scanUsb?: () => Promise<typeof report>;
    listUsb: () => Promise<never[]>;
} = { scanUsb: async () => report, listUsb: async () => [] };
mock.module("react-native", () => ({
    Platform: { OS: "android", Version: 29 },
    PermissionsAndroid: {
        request: async () => {
            bluetoothPermissionRequests++;
            return "granted";
        },
        PERMISSIONS: { BLUETOOTH_CONNECT: "bluetooth" },
        RESULTS: { GRANTED: "granted" },
    },
}));
mock.module("expo-modules-core", () => ({
    requireOptionalNativeModule: () => nativeModule,
}));
const { printerTransport } =
    await import("../../../vendor/pos-ui-shared/packages-native/printing-native/src/transport");
test("USB scan does not request Bluetooth permissions", async () => {
    expect(await printerTransport.scanUsb()).toEqual(report);
    expect(bluetoothPermissionRequests).toBe(0);
});
test("USB scan gracefully identifies an older installed native module", async () => {
    const scan = nativeModule.scanUsb;
    try {
        nativeModule.scanUsb = undefined;
        expect(await printerTransport.scanUsb()).toMatchObject({
            hostSupported: null,
            diagnosticsAvailable: false,
            printers: [],
        });
    } finally {
        nativeModule.scanUsb = scan;
    }
});
