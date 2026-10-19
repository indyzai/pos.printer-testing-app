import { afterEach, expect, test } from "bun:test";
import {
    loadWorkspace,
    printerInput,
    receiptLines,
    savePosPrinter,
    type Session,
} from "./pos-client";
import type { PrinterConfig } from "./printer-config";
const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
});
const session: Session = {
    token: "access",
    userId: "user",
    tenants: [{ id: "tenant" }],
    tenant: { id: "tenant" },
};
const config: PrinterConfig = {
    id: "local-printer",
    name: "Front desk",
    target: { connection: "network", address: "192.168.1.2", port: 9100 },
    commandLanguage: "ESC/POS",
    paperWidth: "80mm",
    updatedAt: 1,
};
function mock(responses: unknown[]) {
    const requests: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (async (
        url: string | URL | Request,
        init?: RequestInit,
    ) => {
        requests.push({ url: String(url), init });
        return new Response(JSON.stringify(responses.shift()), { status: 200 });
    }) as typeof fetch;
    return requests;
}
test("POS requests include business and authorization and expose GraphQL errors", async () => {
    const calls = mock([{ errors: [{ message: "Forbidden" }] }]);
    await expect(loadWorkspace(session)).rejects.toThrow("Forbidden");
    expect(calls[0].init?.headers).toMatchObject({
        Authorization: "Bearer access",
        "x-tenant-id": "tenant",
    });
});
test("native mapping retains connection fields and rejects unsupported profiles", () => {
    const input = printerInput(config, "4");
    expect(input.config.native.language).toBe("ESC_POS");
    expect(input.port).toBe("9100");
    expect(input.config.clientPrinterId).toBe(config.id);
    expect(() =>
        printerInput({ ...config, commandLanguage: "EPL" }, "4"),
    ).toThrow("saved locally");
    expect(() => printerInput({ ...config, paperWidth: "bad" }, "4")).toThrow(
        "paper width",
    );
});
test("saving an existing local configuration updates its POS printer", async () => {
    const calls = mock([
        {
            data: {
                counterPrinters: [
                    {
                        id: "pos-printer",
                        config: { clientPrinterId: config.id },
                    },
                ],
                printerJobs: [],
            },
        },
        { data: { updateCounterPrinter: { id: "pos-printer" } } },
    ]);
    await savePosPrinter(session, config, "4");
    const body = JSON.parse(String(calls[1].init?.body));
    expect(body.query).toContain("updateCounterPrinter");
    expect(body.variables.id).toBe("pos-printer");
});
test("job receipt uses real invoice items and totals", async () => {
    mock([
        {
            data: {
                sales: {
                    edges: [{ node: { id: "sale", invoiceNumber: "INV-1" } }],
                },
            },
        },
        {
            data: {
                sale: {
                    billId: "INV-1",
                    saleDate: "2026-10-19",
                    subtotal: 10,
                    discountAmount: 0,
                    taxAmount: 1,
                    totalAmount: 11,
                    items: [
                        {
                            name: "Coffee",
                            quantity: 2,
                            unitPrice: 5,
                            lineTotal: 10,
                        },
                    ],
                },
            },
        },
    ]);
    const lines = await receiptLines(session, {
        id: "job",
        printerId: "printer",
        printerName: "Printer",
        documentType: "receipt",
        invoiceNumber: "INV-1",
        status: "QUEUED",
        copies: 1,
    });
    expect(lines).toContain("Coffee");
    expect(lines).toContain("TOTAL: 11.00");
});
test("missing invoice content cannot fall back to a test print", async () => {
    mock([{ data: { sales: { edges: [] } } }]);
    await expect(
        receiptLines(session, {
            id: "job",
            printerId: "printer",
            printerName: "Printer",
            documentType: "receipt",
            invoiceNumber: "missing",
            status: "QUEUED",
            copies: 1,
        }),
    ).rejects.toThrow("resolve");
});
