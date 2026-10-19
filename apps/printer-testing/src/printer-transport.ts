import { printerTransport as nativeTransport } from "@indyzai/pos-printing-native/transport";
import { createTracedPrinterTransport } from "./traced-printer-transport";
export const printerTransport = createTracedPrinterTransport(nativeTransport);
