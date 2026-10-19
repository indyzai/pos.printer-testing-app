import { createAuthApi } from "@indyzai/pos-auth/api";

export async function getRuntimeApiUrls() {
    const posApiUrl =
        process.env.EXPO_PUBLIC_POS_API_URL ||
        "https://api.indyzai.com/pos/api/graphql";
    return {
        authApiUrl: (
            process.env.EXPO_PUBLIC_AUTH_API_URL ||
            "https://api.indyzai.com/auth/api/v1"
        ).replace(/\/$/, ""),
        posApiUrl,
        posBaseUrl: posApiUrl.replace(/\/graphql\/?$/, ""),
    };
}
export const authApi = createAuthApi({
    application: "printer",
    appId: process.env.EXPO_PUBLIC_AUTH_APP_ID || "pos-app",
    callbackScheme: "indyzai-pos-printer-testing",
    getRuntimeApiUrls,
});
