import { useMemo, type ReactNode } from "react";
import {
    AuthSessionProvider,
    type AuthOrganizationDetails,
} from "@indyzai/pos-auth/session";
import { setUnauthorizedHandler, createPosApiClient } from "@indyzai/pos-api";
import { configureAuthUi } from "@indyzai/pos-auth/ui";
import { PosLogo, showSnackbar, useAppTheme } from "@indyzai/pos-ui-native";
import { authApi, getRuntimeApiUrls } from "./authApi";

configureAuthUi({
    useTheme: useAppTheme,
    showSnackbar,
    Logo: PosLogo,
    loginTitle: "Welcome to IndyzAI POS",
    loginSubtitle:
        "Sign in to manage printers and print your business documents.",
    signupTitle: "Join IndyzAI POS",
    signupSubtitle: "Set up your business and connect your printers.",
});
const client = createPosApiClient({
    getRuntimeApiUrls,
    loggerScope: "Printer API",
});
async function loadOrganizationDetails(
    token: string,
    tenantId: string,
    signal?: AbortSignal,
): Promise<AuthOrganizationDetails> {
    const data = await client.requestPos<{
        organization: {
            id: string;
            name: string;
            branches: AuthOrganizationDetails["branches"];
        };
    }>(
        token,
        tenantId,
        `query PrinterOrganization($id: String!) { organization(id: $id) { id name branches { id name counters { id name } } } }`,
        { id: tenantId },
        signal,
    );
    return { ...data.organization, settings: {}, activeSession: null };
}
// Printer administration and billing permissions remain enforced by the POS API.
const canAccessApp = () => true;
export function PrinterAuthProvider({ children }: { children: ReactNode }) {
    const { themeColors } = useAppTheme();
    const configuration = useMemo(
        () => ({
            authApi,
            setUnauthorizedHandler,
            loadOrganizationDetails,
            canAccessApp,
            accessDeniedMessage: "This account cannot access printer tools.",
            loaderColors: {
                background: themeColors.background,
                primary: themeColors.primary,
                textSecondary: themeColors.textSecondary,
            },
        }),
        [themeColors],
    );
    return (
        <AuthSessionProvider configuration={configuration}>
            {children}
        </AuthSessionProvider>
    );
}
