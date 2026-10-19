import { AppDeviceSetupRoute } from "@indyzai/pos-auth/routes";
import { authApi } from "../auth/authApi";
export default function DeviceSetupRoute() {
    return (
        <AppDeviceSetupRoute authApi={authApi} homePath="/" appName="printer" />
    );
}
