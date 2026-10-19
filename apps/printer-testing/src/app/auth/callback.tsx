import { AppAuthCallbackRoute } from "@indyzai/pos-auth/routes";
import { authApi } from "../../auth/authApi";
export default function AuthCallbackRoute() {
    return (
        <AppAuthCallbackRoute
            authApi={authApi}
            homePath="/"
            appName="printer"
        />
    );
}
