import { traceLog } from "./trace-log";
import {
    AppPressable as Pressable,
    radii,
    useAppTheme,
    type ThemeColors,
} from "@indyzai/pos-ui-native";
import { router } from "expo-router";
import {
    getActiveAuthSession,
    useAuthSession,
} from "@indyzai/pos-auth/session";
import { authApi } from "./auth/authApi";
import { useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { PrinterConfig } from "./printer-config";
import {
    deliveryKey,
    loadWorkspace,
    receiptLines,
    requestPos,
    savePosPrinter,
    type PosPrinter,
    type PrintJob,
    type Session,
} from "./pos-client";
import { deliveryState, recordDelivery } from "./delivery-store";
import { printerTransport } from "./printer-transport";
import {
    encodePrintBase64,
    renderNativeDocument,
} from "../../../vendor/pos-ui-shared/packages/printing/src/nativeCommands";

export function PosWorkspace({
    config,
    printerBusy,
    onBusyChange,
}: {
    config?: PrinterConfig;
    printerBusy: boolean;
    onBusyChange: (busy: boolean) => void;
}) {
    const { themeColors } = useAppTheme();
    const styles = useMemo(() => createStyles(themeColors), [themeColors]);
    const {
        session: sharedSession,
        user,
        refreshSession,
        error: authError,
    } = useAuthSession();
    const session: Session | null = sharedSession
        ? {
              token: sharedSession.token,
              userId: String(sharedSession.user.id),
              tenants: sharedSession.user.tenants ?? [],
              tenant: sharedSession.tenant,
          }
        : null;
    const [counterId, setCounterId] = useState("");
    const [jobs, setJobs] = useState<PrintJob[]>([]);
    const [printers, setPrinters] = useState<PosPrinter[]>([]);
    const [busy, setBusy] = useState(false);
    const lock = useRef(false);
    const [message, setMessage] = useState(
        "Local testing is available without an account.",
    );
    const [reviewJob, setReviewJob] = useState<string | null>(null);
    async function run(action: () => Promise<void>) {
        if (lock.current || printerBusy) return;
        lock.current = true;
        setBusy(true);
        onBusyChange(true);
        try {
            await action();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
        } finally {
            lock.current = false;
            setBusy(false);
            onBusyChange(false);
        }
    }
    async function refresh(current: Session) {
        const data = await loadWorkspace(current);
        setJobs(data.printerJobs);
        setPrinters(data.counterPrinters);
    }
    function assertCurrentSession(current: Session) {
        const active = getActiveAuthSession();
        if (
            !active ||
            active.token !== current.token ||
            String(active.tenant.id) !== String(current.tenant.id)
        )
            throw new Error(
                "Account or business changed. Refresh before printing.",
            );
    }
    async function printJob(job: PrintJob) {
        traceLog.write("info", "Print job", "Manual print requested", {
            jobId: job.id,
            printerId: job.printerId,
            copies: job.copies,
            documentType: job.documentType,
        });
        if (!session || !config)
            throw new Error("Select a saved local printer first.");
        const data = await loadWorkspace(session);
        const current = data.printerJobs.find((entry) => entry.id === job.id);
        if (!current || current.status !== "QUEUED")
            throw new Error("This job is no longer queued. Refresh the list.");
        const printer = data.counterPrinters.find(
            (entry) =>
                entry.id === job.printerId &&
                entry.config?.clientPrinterId === config.id,
        );
        if (!printer)
            throw new Error(
                "Select the local configuration saved to this job's POS printer.",
            );
        if (config.commandLanguage !== "ESC/POS")
            throw new Error("Receipt jobs require an ESC/POS configuration.");
        const key = deliveryKey(session, job.id);
        if (await deliveryState(key)) {
            setReviewJob(job.id);
            throw new Error(
                "This job was previously attempted on this device. Check the paper, then confirm completion below. It will not be printed again automatically.",
            );
        }
        const lines = await receiptLines(session, current);
        const width = Number(config.paperWidth.replace(/mm$/i, "").trim());
        const payload = encodePrintBase64(
            renderNativeDocument(
                { kind: "receipt", title: "POS", lines },
                {
                    language: "ESC_POS",
                    widthMm: width,
                    heightMm: 150,
                    gapMm: 2,
                    dpi: 203,
                    copies: 1,
                    autoCut: true,
                },
            ),
        );
        if (
            !Number.isInteger(current.copies) ||
            current.copies < 1 ||
            current.copies > 20
        )
            throw new Error("Invalid job copy count.");
        assertCurrentSession(session);
        const target = await printerTransport.connect(config.target);
        assertCurrentSession(session);
        await recordDelivery(key, "SENDING");
        try {
            for (let copy = 0; copy < current.copies; copy++) {
                assertCurrentSession(session);
                await printerTransport.write(target, payload);
            }
            await recordDelivery(key, "SENT");
        } catch (error) {
            setReviewJob(job.id);
            throw new Error(
                `Print outcome uncertain. Check the printer before confirming completion. ${String(error)}`,
            );
        }
        traceLog.write(
            "info",
            "Print job",
            "Bytes sent; awaiting paper confirmation",
            { jobId: job.id },
        );
        setReviewJob(job.id);
        setMessage(
            "Job sent. Check all copies on paper, then confirm completion below.",
        );
    }
    const disabled = busy || printerBusy;
    function button(
        label: string,
        action: () => Promise<void>,
        unavailable = false,
    ) {
        return (
            <Pressable
                accessibilityRole="button"
                disabled={disabled || unavailable}
                onPress={() => void run(action)}
                style={[
                    styles.button,
                    (disabled || unavailable) && { opacity: 0.5 },
                ]}
            >
                <Text style={styles.buttonText}>{label}</Text>
            </Pressable>
        );
    }
    return (
        <View style={styles.card}>
            <Text style={styles.title}>POS workspace</Text>
            {!session ? (
                <>
                    <Text style={styles.copy}>
                        Save this printer to your business and print queued
                        receipts with your POS account.
                    </Text>
                    <Pressable
                        accessibilityRole="button"
                        disabled={disabled}
                        onPress={() => router.push("/login")}
                        style={styles.button}
                    >
                        <Text style={styles.buttonText}>Sign in with POS</Text>
                    </Pressable>
                    {!!authError && (
                        <Text accessibilityRole="alert" style={styles.copy}>
                            {authError}
                        </Text>
                    )}
                </>
            ) : (
                <>
                    <Text style={styles.copy}>Business</Text>
                    <View style={styles.options}>
                        {(user?.tenants ?? []).map((tenant) => (
                            <Pressable
                                key={tenant.id}
                                accessibilityRole="button"
                                accessibilityState={{
                                    selected: tenant.id === session.tenant.id,
                                }}
                                disabled={disabled}
                                style={[
                                    styles.button,
                                    tenant.id === session.tenant.id &&
                                        styles.selected,
                                ]}
                                onPress={() => {
                                    void run(async () => {
                                        await authApi.selectTenant(tenant.id);
                                        await refreshSession();
                                    });
                                    setJobs([]);
                                    setPrinters([]);
                                    setCounterId("");
                                    setReviewJob(null);
                                    setMessage(
                                        "Business selected. Refresh to load its jobs.",
                                    );
                                }}
                            >
                                <Text style={styles.buttonText}>
                                    {tenant.name || tenant.id}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                    {button("Sign out · continue as guest", async () => {
                        await authApi.logout();
                        await refreshSession();
                        setJobs([]);
                        setPrinters([]);
                        setCounterId("");
                        setReviewJob(null);
                        setMessage(
                            "Signed out. Local configurations and printer testing remain available.",
                        );
                    })}
                    <Text style={styles.copy}>
                        Selected local configuration:{" "}
                        {config?.name ||
                            "Save and select a configuration below first"}
                    </Text>
                    <TextInput
                        accessibilityLabel="POS counter ID"
                        placeholder="POS counter ID"
                        value={counterId}
                        onChangeText={setCounterId}
                        style={styles.input}
                        editable={!disabled}
                        autoCapitalize="none"
                    />
                    {button(
                        "Save selected printer to POS",
                        async () => {
                            if (!config) return;
                            await savePosPrinter(session, config, counterId);
                            setMessage("Printer saved to POS.");
                            await refresh(session);
                        },
                        !config || !counterId.trim(),
                    )}
                    {button("Refresh print jobs", async () => {
                        await refresh(session);
                        setMessage("Print jobs refreshed.");
                    })}
                    <Text style={styles.copy}>
                        Print manually while other print agents are paused. Only
                        queued receipt and invoice jobs assigned to the selected
                        printer can be sent.
                    </Text>
                    {jobs.length === 0 && (
                        <Text style={styles.copy}>
                            No jobs loaded. Refresh to check this business.
                        </Text>
                    )}
                    {jobs.map((job) => (
                        <View key={job.id} style={styles.job}>
                            <Text style={styles.copy}>
                                {job.invoiceNumber || job.documentRef || job.id}{" "}
                                · {job.printerName} · {job.status} ·{" "}
                                {job.copies} copies
                            </Text>
                            {job.status === "QUEUED" &&
                                button(
                                    "Print job",
                                    () => printJob(job),
                                    !config ||
                                        !["receipt", "invoice"].includes(
                                            job.documentType,
                                        ) ||
                                        !printers.some(
                                            (p) =>
                                                p.id === job.printerId &&
                                                p.config?.clientPrinterId ===
                                                    config.id,
                                        ),
                                )}
                            {reviewJob === job.id &&
                                button(
                                    "Paper checked · confirm completed",
                                    async () => {
                                        const latest = (
                                            await loadWorkspace(session)
                                        ).printerJobs.find(
                                            (entry) => entry.id === job.id,
                                        );
                                        if (
                                            !latest ||
                                            !["QUEUED", "COMPLETED"].includes(
                                                latest.status,
                                            )
                                        )
                                            throw new Error(
                                                "Job state changed. Refresh before confirming completion.",
                                            );
                                        if (latest.status !== "COMPLETED")
                                            await requestPos(
                                                session,
                                                `mutation CompleteLabJob($id: ID!) { completePrinterJob(id: $id) { id status } }`,
                                                { id: job.id },
                                            );
                                        await recordDelivery(
                                            deliveryKey(session, job.id),
                                            "COMPLETED",
                                        );
                                        setReviewJob(null);
                                        setMessage("Print job completed.");
                                        await refresh(session);
                                    },
                                )}
                        </View>
                    ))}
                </>
            )}
            <Text accessibilityRole="alert" style={styles.copy}>
                {message}
            </Text>
        </View>
    );
}
const createStyles = (c: ThemeColors) =>
    StyleSheet.create({
        card: {
            backgroundColor: c.surface,
            borderRadius: radii.large,
            padding: 20,
            gap: 12,
            borderWidth: 1,
            borderColor: c.outlineMuted,
        },
        title: { color: c.text, fontSize: 20, fontWeight: "700" },
        copy: { color: c.textSecondary, fontSize: 14, lineHeight: 21 },
        input: {
            borderWidth: 1,
            borderColor: c.outline,
            borderRadius: radii.medium,
            paddingHorizontal: 14,
            minHeight: 46,
            color: c.text,
            fontSize: 15,
        },
        button: {
            minHeight: 44,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: c.primarySoft,
            padding: 12,
            borderRadius: radii.small,
        },
        buttonText: { color: c.primary, fontWeight: "700" },
        options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
        selected: { borderWidth: 2, borderColor: c.primary },
        job: {
            gap: 8,
            borderTopWidth: 1,
            borderTopColor: c.outlineMuted,
            paddingTop: 12,
        },
    });
