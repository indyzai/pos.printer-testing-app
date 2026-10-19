export type TraceLevel = "info" | "warn" | "error";
export type TraceEntry = {
    id: number;
    timestamp: string;
    level: TraceLevel;
    scope: string;
    message: string;
    details?: unknown;
};
const secretKey =
    /password|token|authorization|cookie|secret|credential|payload|base64|content|invoice|customer/i;
function safeText(text: string): string {
    return text
        .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
        .replace(
            /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
            "[redacted token]",
        )
        .replace(
            /((?:password|accessToken|refreshToken|token|secret)\s*[=:]\s*)[^\s,;]+/gi,
            "$1[redacted]",
        )
        .slice(0, 3000);
}
function sanitize(value: unknown, depth = 0): unknown {
    if (depth > 10) return "[truncated]";
    if (value instanceof Error)
        return { name: value.name, message: safeText(value.message) };
    if (typeof value === "string") return safeText(value);
    if (Array.isArray(value))
        return value.slice(0, 60).map((item) => sanitize(item, depth + 1));
    if (value && typeof value === "object")
        return Object.fromEntries(
            Object.entries(value)
                .slice(0, 50)
                .map(([key, item]) => [
                    key,
                    secretKey.test(key)
                        ? "[redacted]"
                        : sanitize(item, depth + 1),
                ]),
        );
    return value;
}
export function createTraceLog(limit = 500) {
    let entries: TraceEntry[] = [];
    let nextId = 1;
    const listeners = new Set<() => void>();
    const notify = () => listeners.forEach((listener) => listener());
    return {
        getSnapshot: () => entries,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        clear: () => {
            entries = [];
            notify();
        },
        write(
            level: TraceLevel,
            scope: string,
            message: string,
            details?: unknown,
        ) {
            entries = [
                ...entries.slice(
                    Math.max(0, entries.length - Math.max(1, limit) + 1),
                ),
                {
                    id: nextId++,
                    timestamp: new Date().toISOString(),
                    level,
                    scope: safeText(scope),
                    message: safeText(message),
                    ...(details === undefined
                        ? {}
                        : { details: sanitize(details) }),
                },
            ];
            notify();
        },
    };
}
export const traceLog = createTraceLog();
export function formatTraceLogs(entries: TraceEntry[]): string {
    return entries
        .map(
            (entry) =>
                `${entry.timestamp} ${entry.level.toUpperCase()} [${entry.scope}] ${entry.message}${entry.details === undefined ? "" : `\n${JSON.stringify(entry.details, null, 2)}`}`,
        )
        .join("\n\n");
}
export async function traceOperation<T>(
    scope: string,
    operation: string,
    action: () => Promise<T>,
    details?: unknown,
    summarize?: (result: T) => unknown,
): Promise<T> {
    const started = Date.now();
    traceLog.write("info", scope, `${operation} started`, details);
    try {
        const result = await action();
        traceLog.write("info", scope, `${operation} succeeded`, {
            durationMs: Date.now() - started,
            ...(summarize ? { result: summarize(result) } : {}),
        });
        return result;
    } catch (error) {
        traceLog.write("error", scope, `${operation} failed`, {
            durationMs: Date.now() - started,
            error,
        });
        throw error;
    }
}
