import { expect, test } from "bun:test";
import {
    createWebUsbTransport,
    type WebUsbDevice,
} from "../src/web-usb-transport";
function fixture() {
    const alternate = {
        alternateSetting: 0,
        interfaceClass: 7,
        endpoints: [
            { endpointNumber: 1, direction: "out" as const, type: "bulk" },
        ],
    };
    const config = {
        configurationValue: 1,
        interfaces: [
            { interfaceNumber: 0, alternate, alternates: [alternate] },
        ],
    };
    const writes: number[] = [];
    let closed = 0;
    const device: WebUsbDevice = {
        vendorId: 0x1234,
        productId: 1,
        productName: "CD410-UB",
        serialNumber: "printer-1",
        deviceClass: 0,
        opened: false,
        configuration: null,
        configurations: [config],
        open: async () => {
            device.opened = true;
        },
        close: async () => {
            device.opened = false;
            closed++;
        },
        selectConfiguration: async () => {
            device.configuration = config;
        },
        claimInterface: async () => {},
        releaseInterface: async () => {},
        selectAlternateInterface: async () => {},
        transferOut: async (_endpoint, data) => {
            writes.push(data.length);
            return { status: "ok", bytesWritten: data.length };
        },
    };
    let selected = false;
    const transport = createWebUsbTransport(() => ({
        getDevices: async () => [device],
        requestDevice: async () => {
            selected = true;
            return device;
        },
    }));
    return {
        transport,
        device,
        writes,
        closed: () => closed,
        selected: () => selected,
    };
}
test("browser USB chooser starts synchronously from a button gesture and inventories endpoints", async () => {
    const f = fixture();
    const promise = f.transport.requestUsb();
    expect(f.selected()).toBe(true);
    const report = await promise;
    expect(report.printers[0]).toMatchObject({
        name: "CD410-UB",
        interfaceId: 0,
        endpointAddress: 1,
        configurationValue: 1,
    });
    expect(report.devices[0].interfaces[0].endpoints[0]).toMatchObject({
        type: 2,
        direction: 0,
    });
});
test("WebUSB writes the entire job in bounded chunks and closes the device", async () => {
    const f = fixture();
    const target = {
        connection: "usb" as const,
        ...(await f.transport.listUsb())[0],
    };
    const data = btoa("A".repeat(20000));
    expect(await f.transport.write(target, data)).toEqual({
        bytesWritten: 20000,
    });
    expect(f.writes).toEqual([16384, 3616]);
    expect(f.closed()).toBe(1);
});
test("WebUSB detects partial transfers and never reports a stalled job as success", async () => {
    const f = fixture();
    const target = {
        connection: "usb" as const,
        ...(await f.transport.listUsb())[0],
    };
    f.device.transferOut = async () => ({ status: "stall", bytesWritten: 0 });
    await expect(f.transport.write(target, btoa("test"))).rejects.toThrow(
        "outcome uncertain",
    );
    expect(f.closed()).toBe(1);
});
test("OS-owned USB interfaces produce an actionable error and release the device", async () => {
    const f = fixture();
    const target = {
        connection: "usb" as const,
        ...(await f.transport.listUsb())[0],
    };
    f.device.claimInterface = async () => {
        throw new Error("Access denied");
    };
    await expect(f.transport.connect(target)).rejects.toThrow(
        "OS printer driver",
    );
    expect(f.closed()).toBe(1);
});
test("unsupported browsers and raw TCP requests cannot masquerade as USB support", async () => {
    const transport = createWebUsbTransport(() => null);
    expect(transport.capabilities().usb).toBe(false);
    await expect(transport.scanUsb()).rejects.toThrow("WebUSB is unavailable");
    await expect(
        fixture().transport.connect({
            connection: "network",
            address: "printer",
            port: 9100,
        }),
    ).rejects.toThrow("USB printers only");
});
test("duplicate devices without serial numbers cannot print to an arbitrary device", async () => {
    const f = fixture();
    f.device.serialNumber = undefined;
    const api = {
        getDevices: async () => [f.device, { ...f.device }],
        requestDevice: async () => f.device,
    };
    const transport = createWebUsbTransport(() => api);
    const target = {
        connection: "usb" as const,
        ...(await transport.listUsb())[0],
    };
    await expect(transport.write(target, btoa("test"))).rejects.toThrow(
        "ambiguous",
    );
});

test("a hung USB transfer times out and closes the device without retrying", async () => {
    const f = fixture();
    f.device.transferOut = () => new Promise(() => {});
    const transport = createWebUsbTransport(
        () => ({
            getDevices: async () => [f.device],
            requestDevice: async () => f.device,
        }),
        5,
    );
    const target = {
        connection: "usb" as const,
        ...(await transport.listUsb())[0],
    };
    await expect(transport.write(target, btoa("test"))).rejects.toThrow(
        "timed out",
    );
    expect(f.closed()).toBeGreaterThanOrEqual(1);
});

test("short successful USB transfers resume from the acknowledged byte", async () => {
    const f = fixture();
    const sent: number[] = [];
    f.device.transferOut = async (_endpoint, data) => {
        const count = Math.min(2, data.length);
        sent.push(...data.slice(0, count));
        return { status: "ok", bytesWritten: count };
    };
    const target = {
        connection: "usb" as const,
        ...(await f.transport.listUsb())[0],
    };
    expect(await f.transport.write(target, btoa("ABCDE"))).toEqual({
        bytesWritten: 5,
    });
    expect(String.fromCharCode(...sent)).toBe("ABCDE");
});

test("cancelled chooser gives a clear result without touching a device", async () => {
    const f = fixture();
    const transport = createWebUsbTransport(() => ({
        getDevices: async () => [],
        requestDevice: async () => {
            const error = new Error("No selection");
            error.name = "NotFoundError";
            throw error;
        },
    }));
    await expect(transport.requestUsb()).rejects.toThrow(
        "No USB printer selected",
    );
    expect(f.closed()).toBe(0);
});
