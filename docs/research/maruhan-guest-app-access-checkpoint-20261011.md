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
