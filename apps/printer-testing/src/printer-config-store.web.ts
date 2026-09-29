import type { PrinterConfig } from "./printer-config";

const key = "indyzai.printer-lab.configs.v1";

export async function listPrinterConfigs(): Promise<PrinterConfig[]> {
    try {
        return JSON.parse(localStorage.getItem(key) ?? "[]") as PrinterConfig[];
    } catch {
        return [];
    }
}

export async function savePrinterConfig(config: PrinterConfig): Promise<void> {
    const rows = await listPrinterConfigs();
    localStorage.setItem(
        key,
        JSON.stringify([config, ...rows.filter((row) => row.id !== config.id)]),
    );
}

export async function deletePrinterConfig(id: string): Promise<void> {
    localStorage.setItem(
        key,
        JSON.stringify(
            (await listPrinterConfigs()).filter((row) => row.id !== id),
        ),
    );
}
