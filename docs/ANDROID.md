# Orvia for Android

The Android app lets a business owner connect their own mobile number to Orvia
and follow every call from their phone. Code lives in `mobile/`.

## How a call reaches Orvia

Android does not let an app answer a phone call for another app. Orvia uses
the carrier instead: the app asks the carrier to **forward** calls to the
business's Orvia number (`businesses.ai_number`), and the Orvia assistant
answers there. Nothing about the call passes through the phone itself.

| Mode in the app | Codes sent | What happens |
| --- | --- | --- |
| Backup (default) | `**61*<number>**<seconds>#`, plus optional `**67*` (busy) and `**62*` (off or no signal) | The phone rings first; Orvia picks up calls the owner misses |
| Every call | `**21*<number>#` | Orvia answers everything; the phone does not ring |
| Pause | `##61#`, `##67#`, `##62#`, `##21#` (or `##002#` through the Phone app) | Forwarding erased at the carrier |
| Check now | `*#61#`, `*#67#`, `*#62#`, `*#21#` | Asks the carrier what is on (read only) |

There are two routes to the carrier, and the app picks one per phone:

1. **Direct.** `TelephonyManager.sendUssdRequest` (API 26+, needs
   `CALL_PHONE`), so the carrier's reply shows inside the app. Works on
   networks that still carry these codes over 2G/3G signalling.
2. **Phone app.** On 4G/5G voice networks (VoLTE/VoNR, for example Jio), the
   network does not accept forwarding codes sent from an app at all;
   `sendUssdRequest` fails at once with no carrier text. Only the Phone app
   can send them. The app hands each code to the Phone app (`ACTION_CALL`
   with a `tel:` URI, on the chosen SIM where Android allows it). The Phone
   app shows the carrier's reply, and the owner taps "Yes, it worked" or
   "No". Pausing this way uses one code, `##002#` (erase all forwarding).

The app tries direct first. If the very first code fails without any carrier
text, it stops there and switches to the Phone app route. It also remembers
that route for this phone (`ForwardingState.route`), so later changes go
straight there. A carrier that answers with an error message is a refusal,
not a route problem, and does not switch routes. The codes also stay
available under "Set it up by hand".

"Turned on" is not trusted on its own. The app shows forwarding as
**verified** only after a real forwarded call appears in `calls` (web test
calls and seeded demo calls are ignored).

### Carrier notes

- The codes are the 3GPP standard and work on most GSM/LTE carriers. On
  4G/5G voice networks they only work through the Phone app (see above).
  Settings > Calls > Call forwarding also works there.
- Some carriers reject the `+` in the number. The setup screen has a "Write
  the number without +" switch for that.
- The no-answer delay (`**<seconds>`) must be 5 to 30 in steps of 5. Some
  carriers ignore it and use their own.
- **Forwarding to a number in another country is international forwarding.**
  Many Indian carriers block it or bill it per minute. An Indian business needs
  an Indian number on the Orvia side, not the US Vapi number.
- CDMA networks use different codes and are not supported.

Carrier-specific code sets go behind `UssdCodeBook`
(`lib/telephony/forwarding.dart`). `Gsm3gppCodeBook` is the only one today.

## Structure

```
lib/
  core/        env, phone numbers (E.164 only), formatting, log redaction
  data/        models, OrviaApi (interface) and its Supabase implementation, auth
  telephony/   forwarding plans and codes, the forwarding state machine, the
               method-channel gateway to Kotlin
  platform/    permissions, notifications, app lock, live sync, device registry
  state/       one ChangeNotifier controller per screen
  screens/     UI
  widgets/     shared UI pieces
android/app/src/main/kotlin/   TelephonyChannel (USSD, SIM list), MmiCode validator
```

Everything external sits behind an interface (`OrviaApi`, `AuthRepository`,
`TelephonyGateway`, `PermissionGateway`, `Notifier`, `DeviceAuth`) and is
handed in through `AppDependencies`. Tests swap in fakes; nothing reaches for a
global. Signed-in controllers live in `SignedInScope`, above the Navigator, and
are thrown away on sign-out so nothing from one account survives into the next.

## Security

- **Only the publishable key ships in the app.** `Env` refuses a service-role
  or secret key, and refuses plain `http` except to loopback in debug builds.
- **The database decides.** Row-level security plus column-level grants
  (migration 017) limit an owner to their own business and to the columns the
  apps need to change. Settings go through `patch_business_settings`, which
  only accepts `greeting`, `transfer_number` and `notification_phone`.
  `supabase/tests/rls_test.mjs` tries the attacks.
- **Codes are validated twice.** Dart builds them from an E.164 number only;
  Kotlin (`MmiCode.kt`) rejects anything that is not `[*#][*#0-9+]*#`, at most
  64 characters, before it reaches the carrier.
- **Session tokens** are stored with `flutter_secure_storage` (Android
  Keystore). No deep link can hand the app a session.
- **On the device:** optional fingerprint/PIN lock, notifications hidden on
  the lock screen, screenshots and the recents preview blocked in release,
  no cloud backup of app data, touches ignored while another app draws on top,
  cleartext traffic disabled.
- **Logs** never include phone numbers or tokens (`core/log.dart`).
- Notification taps carry only the call id, checked to be a UUID. The call is
  fetched again under the signed-in owner's permissions.

## Backend the app needs

Migrations `017_client_hardening.sql` and `018_mobile_app.sql`, and an
`ai_number` (E.164) on each business that uses the app. Without `ai_number`
the phone screen explains that the number is not set up yet.

Apply 017 with care: it revokes direct writes the web dashboard does not use.
Check the web app against the column list in the migration first.

## Build and run

Toolchain: Flutter 3.47, JDK 17, Android SDK with platform 37.

```bash
cd mobile
cp env.example.json env.json   # fill in the project URL and publishable key
flutter pub get
flutter run --flavor dev --dart-define-from-file=env.json
```

Flavors: `prod` (`com.scalyft.orvia`, "Orvia") and `dev`
(`com.scalyft.orvia.dev`, "Orvia Dev", yellow icon), so a test build installs
beside the real one.

Release:

```bash
flutter build apk --flavor prod --release --obfuscate --split-debug-info=build/symbols --dart-define-from-file=env.json
```

Keep `build/symbols` for each release; it is needed to read crash stack traces.

### Signing

Locally, create `android/key.properties` (git-ignored):

```
storeFile=../orvia-upload.jks
storePassword=...
keyAlias=orvia
keyPassword=...
```

Without it a release build falls back to the debug key, which is fine for
`flutter run --release` but must never be shared. On CI that fallback is an
error.

### CI

- `.github/workflows/mobile.yml` runs on changes to `mobile/` or the
  migrations: RLS tests, `flutter analyze`, `flutter test`, a debug build and
  the Kotlin unit tests.
- `.github/workflows/mobile-release.yml` runs on a `mobile-v1.2.3` tag (must
  match `pubspec.yaml`) and attaches a signed APK and app bundle to a GitHub
  release. Secrets: `ORVIA_KEYSTORE_BASE64`, `ORVIA_KEYSTORE_PASSWORD`,
  `ORVIA_KEY_ALIAS`, `ORVIA_KEY_PASSWORD`, `ORVIA_SUPABASE_URL`,
  `ORVIA_SUPABASE_ANON_KEY`.

## Tests

| What | Command |
| --- | --- |
| Dart unit and widget tests | `cd mobile && flutter test` |
| Database rules | `cd supabase/tests && npm test` |
| Kotlin code validator | `cd mobile/android && ./gradlew :app:testDevDebugUnitTest` |
| Local backend for device testing | see `mobile/e2e/README.md` |

## Not built yet

- Push notifications. Alerts arrive while the app is running or recently used
  (realtime plus a 45 second poll). Firebase Cloud Messaging needs a Firebase
  project; `mobile_devices.push_token` and `AppDependencies.pushToken` are
  ready for it.
- Dual-SIM phones show a SIM picker and send the codes to that SIM. This has
  only been tested with fakes, not on a real dual-SIM phone.
- Carrier-specific code books.
