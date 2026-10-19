import { expect, test } from "bun:test";
import type { UsbScanReport } from "@indyzai/pos-printing-native/types";
import { usbDeviceLabel, usbScanSummary } from "../src/usb-scan";
const empty: UsbScanReport = {
    hostSupported: true,
    diagnosticsAvailable: true,
    devices: [],
    printers: [],
};
test("USB check distinguishes no Android device from an unsupported printing interface", () => {
    expect(usbScanSummary(empty)).toContain("Android cannot see a USB device");
    const connected = {
        deviceName: "/dev/bus/usb/001/002",
        name: "CD410-UB",
        vendorId: 0x1234,
        productId: 0x0001,
        deviceClass: 255,
        hasPermission: false,
        interfaces: [],
    };
    expect(usbScanSummary({ ...empty, devices: [connected] })).toContain(
        "Android sees 1 USB device",
    );
    expect(usbDeviceLabel(connected)).toContain("1234:0001");
    expect(usbDeviceLabel(connected)).toContain("access not yet granted");
});
test("legacy APK cannot masquerade as a confirmed empty OTG bus", () => {
    expect(
        usbScanSummary({
            ...empty,
            hostSupported: null,
            diagnosticsAvailable: false,
        }),
    ).toContain("newly built APK");
});
test("unsupported USB host and discovered printers have distinct next steps", () => {
    expect(usbScanSummary({ ...empty, hostSupported: false })).toContain(
        "no USB host support",
    );
    expect(
        usbScanSummary({
            ...empty,
            printers: [
                {
                    deviceName: "usb",
                    name: "CD410-UB",
                    vendorId: 0x1234,
                    productId: 1,
                    interfaceId: 0,
                    endpointAddress: 1,
                },
            ],
        }),
    ).toContain("Tap the printer and allow USB access");
});
