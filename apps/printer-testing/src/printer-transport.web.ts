import { createTracedPrinterTransport } from "./traced-printer-transport";
import { createWebUsbTransport } from "./web-usb-transport";
export const printerTransport = createTracedPrinterTransport(
    createWebUsbTransport(),
);
