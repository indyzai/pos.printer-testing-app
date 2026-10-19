# Printer testing app

Run `bun install` from the repository root, then `bun run start` from `apps/printer-testing`. Use an Android or iOS development build containing the native printer module for physical printing. The web build supports direct USB printing through WebUSB in compatible Chrome/Edge desktop browsers over HTTPS or localhost, as well as configuration and POS account management. It cannot open raw TCP or native Bluetooth connections.

Guest mode opens by default. Discover a USB/Bluetooth printer or enter a network address, select a command language and paper width, and save the configuration locally. Android/iOS use SQLite; web uses browser local storage. Test printing never requires an account.

To use POS:

1. Open **Sign in with POS** to use the same shared login, signup, Google/Microsoft authorization, and registered-device login as the POS apps, then select a business. The login page also offers **Continue testing as guest**.
2. Save and select a local printer configuration, enter its POS counter ID, and press **Save selected printer to POS**. Existing configurations update the same printer in that business. Saving requires the API's printer administration permission. ESC/POS and ZPL profiles can be registered; EPL and CPCL remain available for local tests.
3. Press **Refresh print jobs**. Select the local configuration registered to the job's printer, then press **Print job** on a queued receipt or invoice. The app loads real invoice content, sends the requested copies, and waits for you to check the paper and confirm completion.

Pause other print agents while using this manual testing tool: the existing POS API does not offer an exclusive job claim. Jobs with an attempted delivery on this device are never automatically resent, including after a restart or a failed completion request. Press **Print job** again to recover the paper-check confirmation for a previously attempted queued job. An uncertain/partial print needs manual inspection and, if necessary, a new job in POS. Unsupported document types and missing invoices cannot fall back to a test receipt.

Authentication is provided by `@indyzai/pos-auth`, including its shared screens, routes, device setup, session restoration, and renewal. Tokens use Expo SecureStore on native and the shared browser session store on web, under a separate `indyzai.printer` namespace. Sign-out clears the account session and retains guest printer configurations. Passwords and tokens are never written to the local printer configuration database. Delivery records contain only API/business/job identifiers and delivery state. Rebuild the native development client after installing the authentication modules.

API endpoints default to production. Override these variables for other environments:

```dotenv
EXPO_PUBLIC_AUTH_API_URL=https://api.indyzai.com/auth/api/v1
EXPO_PUBLIC_POS_API_URL=https://api.indyzai.com/pos/api/graphql
EXPO_PUBLIC_AUTH_APP_ID=pos-app
```

Validation from the repository root:

```bash
bun test ./apps/printer-testing/src/pos-client.test.ts
cd apps/printer-testing
bunx tsc --noEmit
bunx eslint . --no-cache
```

## USB OTG troubleshooting

On Android, use **Check USB / OTG only** to inspect USB independently of Bluetooth and its permissions. The USB group shows all devices Android enumerates, including devices that do not have a supported raw printing interface. It also shows vendor/product IDs and whether USB access has been granted. Discovery itself does not require granting permission; tap a supported printer to request access before printing.

- **Android cannot see a USB device**: reconnect the externally powered printer with an OTG host adapter and data cable. Try a USB mouse on the same adapter to check the tablet connection.
- **Android sees a USB device, but no supported bulk-output connection**: record the displayed USB ID and printer model. The device may require a vendor/serial driver; it must not be treated as a raw printer automatically.
- **Install a newly built APK**: the installed native module predates the device diagnostics. Rebuild and reinstall the APK; a Metro reload or JavaScript update cannot add the new Android method.

The USB inventory does not prove physical output. Check the paper before retrying an interrupted print.

## Trace logs

Open **Logs** after reproducing a scan, connection, test-print, or POS print-job issue. The tab shows timestamped events, durations, USB inventory/endpoints and access status, transmitted byte counts, and API operation outcomes. Use **Copy all logs** to copy the trace, **Copy** on a row for a single event, or **Clear** to start a fresh trace. Logs stay in memory across tabs and retain the latest 500 events until the app restarts. Credentials and print contents are excluded or redacted. Rebuild the native APK to include Expo Clipboard for copying on Android/iOS; the selectable log text remains available if clipboard access fails.

## Platform connections

| Platform | USB / OTG | Other supported paths |
| --- | --- | --- |
| Android native | USB host enumeration, permission, and bulk-output printing | Paired Bluetooth, raw TCP network |
| iPhone / iPad native | No generic USB host printer API; requires a manufacturer-approved accessory SDK/protocol | BLE with service/characteristic UUIDs, raw TCP network |
| Windows / macOS / Linux / ChromeOS web | WebUSB in compatible Chrome/Edge browsers | POS configuration and job management |
| Safari / Firefox / iOS web browsers | WebUSB unavailable | Configuration and POS account management |

For desktop web USB, press **Choose USB printer** directly and approve the browser chooser. Scanning lists only devices already authorized for this origin. Select a discovered bulk-output connection, save it locally, then print a test. Saved settings do not bypass browser permissions: choose the device again after access is revoked. The OS driver can prevent claiming an interface; this app does not detach OS drivers or bypass browser restrictions. Identical printers without serial numbers must be connected one at a time to avoid sending output to the wrong device. USB writes are chunked, time-limited, traced, and never automatically retried after uncertain output.

The CD410-UB has no supplied iOS SDK/protocol in this project. Generic wired printing on iOS is not implemented; use the existing BLE/network connection if supported by the actual printer, or obtain the manufacturer's integration SDK. Plugging in an adapter alone cannot enable a raw USB transport on iOS.
