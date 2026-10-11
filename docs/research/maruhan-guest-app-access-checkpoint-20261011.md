# Maruhan Android guest data access — research checkpoint (2026-10-11)

Scope: read-only experimental investigation of Maruhan's free machine-data experience, specifically Kawasaki Sakuramoto machines 0829–0833. No production changes to JUGEST, no access-control bypass, no persisted guest credentials.

## What worked
- Ubuntu GitHub Actions disposable runner with KVM: Android 11 and Android 15 emulators booted.
- APK variant of `jp.co.maruhan.android` 2.0.1 (versionCode 68008) installed and launched. The distributed APK reported valid APK signing format.
- Google Play and GMS were present on Play Store-enabled emulator images.
- Android guest reported Internet access validated and reasonable wall-clock UTC time.
- The app's device-anonymous registration endpoint can issue a guest ID/token on the existing VPS (earlier read-only lab).
- On a disposable guest, launching the legitimate Google Play `market://details?id=jp.co.maruhan.android` route showed a Google-account sign-in requirement; no Google account was added.

## Blocking symptom
- After the app launches and notification prompt is handled, guest app shows: `取得エラー / 情報が取得できませんでした。時間を空けてからご確認ください。`
- On retry/dismissal, no interactive machine-data UI becomes available.
- This occurred on Play Store-enabled Android 11 and 15; both with properly installed matching APK splits.
- Machine data for 0829–0833 **was not obtained**.

## Static Android app findings (informative, not an access bypass)
- `MainActivity` *actively* calls `StandardIntegrityManager` to prepare and request Google Play Integrity tokens.
- The resulting token is passed to app code that invokes `AuthenticationAPI.checkAppIntegrity` on the service.
- Thus integrity verification is not a dormant library dependency: it is part of startup logic.
- Sideloaded APK installation showed `installerPackageName=null`, unlike a normal installation via Google Play.
- It remains **unproven** whether this specific integrity check, IP allowlisting, app build/version, a network error, or another backend condition triggers the visible `取得エラー`. Never infer a definitive cause without source-backed response evidence.
- An APK with recognized signing format does **not** independently prove provenance or equivalence to an official Google Play-managed installation.

## Verified experiments
- Android 11 basic boot + app launch: run 38039036661.
- Android 11 first-screen extraction: run 38039274590.
- Android 11 ARM split re-test: run 38039464171.
- Android 11 error dismissal: run 38039692774.
- Android 15 with Google Play: run 38046285623.
- Android 15 network clock + installer metadata: run 38138670394.
- Official Play Store route on disposable emulator: run 38138932401 (shows Google sign-in requirement).

## Allowed next steps
1. Compare behavior with a legitimately Play-installed copy on an authorized Android test device (with genuine sign-in, no authentication spoofing).
2. Otherwise evaluate legitimate public end-of-day Maruhan data sources and data-provider permissions for unattended collection.
3. Never spoof installer provenance, forge Play Integrity tokens, bypass backend validation, disclose API credentials, or merge/deploy these experiments without explicit approval.
4. Keep production JUGEST and data store unchanged.

## Additional October 11 findings
- Static invocation evidence: `MainActivity.onCreate()` proceeds into `StandardIntegrityManager.prepareIntegrityToken()` and `StandardIntegrityTokenProvider.request()`. A resulting token is sent by `AuthenticationAPI.checkAppIntegrity`. `onFailure` calls `printStackTrace()`. This establishes a genuine app integrity verification flow, but does **not** prove which backend response produced the visible initialization error.
- A legitimate Google Play Store app-details URI on the disposable Android 15 emulator displayed a **Google account sign-in** prompt. No credentials were provided and no account was added; test run 38138932401.
- **Separate public website feasibility test:** on 2026-10-11, one ordinary, unauthenticated read of `https://pekasen.com/store/maruhan-kawasaki-sakuramoto` displayed the **2026-10-10** business day. Parsed 90 machine groups, exactly 510 unique numbered machines, no malformed rows. The five Mr. Juggler rows included 829=8643G/34BB/32RB/+800, 830=8867G/35BB/29RB/+1100, 831=9297G/37BB/37RB/+1600, 832=7909G/35BB/23RB/+1600, 833=7828G/25BB/24RB/-900. These are site-provided end-of-day estimates; not official app output.
- **Use restriction:** `https://pekasen.com/terms` prohibits automated large-scale collection by bots/crawlers and resale/competitive services. No recurring collection, copying into JUGEST, or bulk ingestion was implemented. Obtain source-provider permission before considering ongoing high-volume collection. Its `robots.txt` also disallows historical `/store/*/2026` paths and machine detail paths.
- **Decision:** Android sideload can launch but is blocked from usable app data. Do not impersonate the Play installer, forge Play Integrity responses, or bypass backend verification. Source-provided explicit permission or legitimate Play-installed device investigation is required for automated official-app data.
