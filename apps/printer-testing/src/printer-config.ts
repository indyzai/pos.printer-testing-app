import type { PrinterTarget } from "@indyzai/pos-printing-native/types";

export type CommandLanguage = "ESC/POS" | "ZPL" | "EPL" | "CPCL";
export type PrinterConfig = {
    id: string;
    name: string;
    target: PrinterTarget;
    commandLanguage: CommandLanguage;
    paperWidth: string;
    updatedAt: number;
};
