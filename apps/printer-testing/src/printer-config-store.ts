import * as SQLite from "expo-sqlite";
import type { PrinterConfig } from "./printer-config";

const database = SQLite.openDatabaseAsync("printer-lab.db").then(async (db) => {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS printer_configs (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        target_json TEXT NOT NULL,
        command_language TEXT NOT NULL,
        paper_width TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    )`);
    return db;
});

type ConfigRow = { id: string; name: string; target_json: string; command_language: PrinterConfig["commandLanguage"]; paper_width: string; updated_at: number };

export async function listPrinterConfigs(): Promise<PrinterConfig[]> {
    const db = await database;
    const rows = await db.getAllAsync<ConfigRow>("SELECT * FROM printer_configs ORDER BY updated_at DESC");
    return rows.map((row) => ({ id: row.id, name: row.name, target: JSON.parse(row.target_json), commandLanguage: row.command_language, paperWidth: row.paper_width, updatedAt: row.updated_at }));
}

export async function savePrinterConfig(config: PrinterConfig): Promise<void> {
    const db = await database;
    await db.runAsync(`INSERT INTO printer_configs (id, name, target_json, command_language, paper_width, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, target_json = excluded.target_json,
        command_language = excluded.command_language, paper_width = excluded.paper_width, updated_at = excluded.updated_at`,
        config.id, config.name, JSON.stringify(config.target), config.commandLanguage, config.paperWidth, config.updatedAt);
}

export async function deletePrinterConfig(id: string): Promise<void> {
    const db = await database;
    await db.runAsync("DELETE FROM printer_configs WHERE id = ?", id);
}
