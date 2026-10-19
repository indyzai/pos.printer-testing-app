import type { UsbScanReport } from "@indyzai/pos-printing-native/types";

export function usbScanSummary(report: UsbScanReport): string {
    if (report.printers.length)
        return `${report.printers.length} USB print connection${report.printers.length === 1 ? "" : "s"} found. Tap the printer and allow USB access.`;
    if (!report.diagnosticsAvailable)
        return "No USB print connection found. Install a newly built APK to enable USB device diagnostics; a JavaScript update alone cannot add them.";
    if (report.hostSupported === false)
        return "Android reports no USB host support on this device.";
    if (!report.devices.length)
        return "Android cannot see a USB device. Reconnect the powered printer using an OTG adapter and a data cable. Try a USB mouse with the same adapter to check the tablet connection.";
    return `Android sees ${report.devices.length} USB device${report.devices.length === 1 ? "" : "s"}, but none has a supported bulk-output connection. Check the printer model and whether it requires a vendor or USB-serial driver.`;
}
export function usbDeviceLabel(
    device: UsbScanReport["devices"][number],
): string {
    const hex = (value: number) =>
        value.toString(16).padStart(4, "0").toUpperCase();
    return `${device.name} · USB ${hex(device.vendorId)}:${hex(device.productId)} · ${device.hasPermission ? "access allowed" : "access not yet granted"}`;
}
