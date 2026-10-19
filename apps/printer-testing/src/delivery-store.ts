import * as SQLite from "expo-sqlite";
const database = SQLite.openDatabaseAsync("printer-lab-delivery.db").then(
    async (db) => {
        await db.execAsync(
            "CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY NOT NULL, state TEXT NOT NULL)",
        );
        return db;
    },
);
export async function deliveryState(id: string): Promise<string | null> {
    return (
        (
            await (
                await database
            ).getFirstAsync<{ state: string }>(
                "SELECT state FROM deliveries WHERE id = ?",
                id,
            )
        )?.state ?? null
    );
}
export async function recordDelivery(id: string, state: string) {
    await (
        await database
    ).runAsync(
        "INSERT INTO deliveries (id, state) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state",
        id,
        state,
    );
}
