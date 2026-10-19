import { traceLog } from "./trace-log";
import { requestGraphQL } from "@indyzai/pos-api";
import type { PrinterConfig } from "./printer-config";

const posUrl =
    process.env.EXPO_PUBLIC_POS_API_URL ||
    "https://api.indyzai.com/pos/api/graphql";
export type Tenant = { id: string; name?: string };
export type Session = {
    token: string;
    userId: string;
    tenants: Tenant[];
    tenant: Tenant;
};
export type PosPrinter = {
    id: string;
    name: string;
    counterId?: string;
    config?: { clientPrinterId?: string };
};
export type PrintJob = {
    id: string;
    printerId: string;
    printerName: string;
    counterId?: string;
    branchId?: string;
    documentType: string;
    invoiceNumber?: string;
    documentRef?: string;
    status: string;
    copies: number;
};

export function deliveryKey(session: Session, jobId: string) {
    return `${posUrl}:${session.tenant.id}:${jobId}`;
}
export async function requestPos<T>(
    session: Session,
    query: string,
    variables: object = {},
): Promise<T> {
    const operation =
        query.match(/\b(?:query|mutation)\s+(\w+)/)?.[1] || "POS request";
    const started = Date.now();
    traceLog.write("info", "POS API", `${operation} started`);
    try {
        const result = await requestGraphQL<T>(
            posUrl,
            query,
            variables as Record<string, unknown>,
            { token: session.token, tenantId: session.tenant.id },
        );
        traceLog.write("info", "POS API", `${operation} succeeded`, {
            durationMs: Date.now() - started,
        });
        return result;
    } catch (error) {
        traceLog.write("error", "POS API", `${operation} failed`, {
            durationMs: Date.now() - started,
            errorType: error instanceof Error ? error.name : "Error",
            status:
                error && typeof error === "object" && "status" in error
                    ? error.status
                    : undefined,
        });
        throw error;
    }
}
export function loadWorkspace(session: Session) {
    return requestPos<{
        counterPrinters: PosPrinter[];
        printerJobs: PrintJob[];
    }>(
        session,
        `query PrinterLabWorkspace { counterPrinters { id name counterId config } printerJobs { id printerId printerName counterId branchId documentType invoiceNumber documentRef status copies } }`,
    );
}
export function printerInput(config: PrinterConfig, counterId: string) {
    if (!/^[1-9]\d*$/.test(counterId.trim()))
        throw new Error("Enter a valid POS counter ID.");
    if (!["ESC/POS", "ZPL"].includes(config.commandLanguage))
        throw new Error(
            "POS native printers support ESC/POS and ZPL. EPL and CPCL configurations can be saved locally.",
        );
    const widthMm = Number(config.paperWidth.replace(/mm$/i, "").trim());
    if (!Number.isFinite(widthMm) || widthMm < 20 || widthMm > 110)
        throw new Error("Use a paper width between 20mm and 110mm.");
    const target = config.target;
    if (target.connection === "system")
        throw new Error("Select a USB, Bluetooth or network printer for POS.");
    return {
        name: config.name,
        counterId: counterId.trim(),
        connectionType: target.connection,
        address: target.address,
        port: target.port == null ? undefined : String(target.port),
        type: config.commandLanguage === "ESC/POS" ? "thermal" : "barcode",
        paperSize: config.paperWidth,
        isActive: true,
        config: {
            clientPrinterId: config.id,
            native: {
                language:
                    config.commandLanguage === "ESC/POS" ? "ESC_POS" : "ZPL",
                widthMm,
                heightMm: 150,
                gapMm: 2,
                dpi: 203,
                copies: 1,
                autoCut: config.commandLanguage === "ESC/POS",
                usbVendorId: target.vendorId,
                usbProductId: target.productId,
                usbInterfaceId: target.interfaceId,
                usbEndpointAddress: target.endpointAddress,
                usbDeviceName: target.deviceName,
                bluetoothServiceUuid: target.serviceUuid,
                bluetoothCharacteristicUuid: target.characteristicUuid,
            },
        },
    };
}
export async function savePosPrinter(
    session: Session,
    config: PrinterConfig,
    counterId: string,
) {
    const input = printerInput(config, counterId);
    const { counterPrinters } = await requestPos<{
        counterPrinters: PosPrinter[];
    }>(
        session,
        `query LabPrinters { counterPrinters { id name counterId config } }`,
    );
    const existing = counterPrinters.find(
        (printer) => printer.config?.clientPrinterId === config.id,
    );
    if (existing) {
        await requestPos(
            session,
            `mutation UpdateLabPrinter($id: ID!, $input: UpdateCounterPrinterInput!) { updateCounterPrinter(id: $id, input: $input) { id } }`,
            { id: existing.id, input },
        );
    } else {
        await requestPos(
            session,
            `mutation SaveLabPrinter($input: CreateCounterPrinterInput!) { createCounterPrinter(input: $input) { id } }`,
            { input },
        );
    }
}
type Bill = {
    billId: string;
    saleDate: string;
    customerName?: string;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
    items: {
        name: string;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
    }[];
};
export async function receiptLines(
    session: Session,
    job: PrintJob,
): Promise<string[]> {
    if (job.documentType !== "receipt" && job.documentType !== "invoice")
        throw new Error(
            "Only receipt and invoice jobs are supported by this app.",
        );
    if (!job.invoiceNumber)
        throw new Error("This job has no invoice reference.");
    const data = await requestPos<{
        sales: { edges: { node: { id: string; invoiceNumber?: string } }[] };
    }>(
        session,
        `query LabSaleReference($filter: SaleFilterInput!) { sales(filter: $filter) { edges { node { id invoiceNumber } } } }`,
        {
            filter: {
                invoiceNumber: job.invoiceNumber,
                ...(job.branchId ? { branchId: job.branchId } : {}),
            },
        },
    );
    const matches = data.sales.edges.filter(
        ({ node }) => node.invoiceNumber === job.invoiceNumber,
    );
    if (matches.length !== 1)
        throw new Error("Could not uniquely resolve the job's invoice.");
    const { sale } = await requestPos<{ sale: Bill | null }>(
        session,
        `query LabReceipt($id: ID!) { sale(id: $id) { billId saleDate customerName subtotal discountAmount taxAmount totalAmount items { name quantity unitPrice lineTotal } } }`,
        { id: matches[0].node.id },
    );
    if (!sale || sale.billId !== job.invoiceNumber || !sale.items.length)
        throw new Error("Invoice content is unavailable.");
    const money = (amount: number) => amount.toFixed(2);
    return [
        job.documentType.toUpperCase(),
        sale.billId,
        sale.saleDate,
        ...(sale.customerName ? [`Customer: ${sale.customerName}`] : []),
        ...sale.items.flatMap((item) => [
            item.name,
            `${item.quantity} x ${money(item.unitPrice)} = ${money(item.lineTotal)}`,
        ]),
        `Subtotal: ${money(sale.subtotal)}`,
        `Discount: ${money(sale.discountAmount)}`,
        `Tax: ${money(sale.taxAmount)}`,
        `TOTAL: ${money(sale.totalAmount)}`,
    ];
}
