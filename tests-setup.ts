import { mock } from "bun:test";

// @ts-expect-error test env global
globalThis.__DEV__ = false;

mock.module("react-native", () => ({
    Platform: {
        OS: "web",
        select: (obj: Record<string, unknown>) => obj?.web ?? obj?.default,
    },
    StyleSheet: {
        create: (styles: unknown) => styles,
        hairlineWidth: 1,
    },
    Dimensions: {
        get: () => ({ width: 1024, height: 768 }),
    },
    TurboModuleRegistry: {
        get: () => null,
        getEnforcing: () => ({}),
    },
    NativeModules: {},
    NativeEventEmitter: class {
        addListener() {
            return { remove: () => {} };
        }
        removeListeners() {}
    },
}));

mock.module("expo-crypto", () => ({
    randomUUID: () =>
        globalThis.crypto?.randomUUID
            ? globalThis.crypto.randomUUID()
            : "test-uuid",
}));
