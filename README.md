# jugest

Juggler / HANA HANA setting-analysis tool.

Current app release: **v4.8.7**.

## Current production

For the foreseeable future, **Netlify is the sole active production target**.

- App: `https://jugglerest.netlify.app`
- Static publish directory: `public/`
- Relay/API: Netlify Function `netlify/functions/relay.mjs` exposed as `https://jugglerest.netlify.app/api/relay`
- Safari Relay bridge: `https://jugglerest.netlify.app/relay-bridge.html`
- Launcher: `https://jugglerest.netlify.app/ana-launcher.js`
- Current bookmarklet loader: `BOOKMARKLET_v4860.txt` -> Netlify Launcher
- Relay transient storage: Netlify Blobs
- Durable shop history and analysis snapshots: browser IndexedDB + complete backup

`main` is the source branch. Netlify should deploy from `main`; `netlify.toml` runs `npm run check` before publish. GitHub Actions is CI-only and does not deploy GitHub Pages.

Production wiring must stay on `jugglerest.netlify.app` unless a future migration is explicitly re-approved. The app, Launcher, Relay bridge, bookmarklet loader and Relay/API must move together if that policy ever changes.

## Paused VPS work

The `vps/`, `tests/vps-*` and `scripts/switch-relay-origin.mjs` files are **parked migration artifacts only**. They are intentionally excluded from the active build/test path while Netlify is production. Do not use them for deployment or origin switching unless VPS migration is explicitly resumed later.

This hosting policy does not change setting judgment math, single-evidence logic, strict Champion, Calibration, hybrid ranking, probability tables, acquisition pacing, or Relay protocol semantics.

## Browser storage migration note

Moving from `jugest.netlify.app` to `jugglerest.netlify.app` creates a new browser origin. IndexedDB/localStorage do not move automatically. Before retiring the old hostname, export a complete backup there, restore it on the new hostname, verify store-day/history counts, then re-pair Launcher Relay because receiver pairing is also origin-scoped.

## v4.8.4

Store-registration hotfix: the prefecture catalog now prefers the dedicated 「ホール一覧」 links instead of schedule/date links, filters date-like labels from fallback candidates, and adds an iPhone Safari-friendly URL paste button plus native-paste hardening. Judgment math, parserVersion, acquisition pacing, storage schema, and Relay semantics are unchanged.

Project-wide v4.8.4 keeps the existing setting-judgment math unchanged and upgrades the Ana-Slo collector: normal rolling guard is 30 accesses / 15 minutes; night collection uses serial 25–35 second pacing without the local rolling guard; registered-shop latest-delta collection, shop registration, chained night maintenance, and all-shop unsent Relay delivery are included. Active production remains https://jugglerest.netlify.app.

## v4.8.6 device sync
- Manual two-device saved-data sync via a shared code.
- Sync payload is gzip-compressed when available and AES-GCM encrypted in the browser before Netlify Blobs storage; the encryption key is not sent to the sync API.
- Sync covers saved play/store/analysis data and learned store profiles; UI state and Launcher/Relay credentials remain device-local.
- Judgement/ranking mathematics and Launcher acquisition semantics are unchanged.


## v4.8.7 evidence policy
- Direct practical history is capped at the previous 7 days; 14-day aggregates and long recency are not direct ranking roots.
- Long-run level is baseline/prior information, not an unconditional machine/table bonus.
- Weekday/date-tail/exact-date × table-tail and × previous-day state are explicit practical roots for allocation and raise/hold behavior.
- Correlated rules are collapsed into one underlying fact before practical aggregation.
- Strict Champion/calibration, judge math, Launcher, Relay, and device sync semantics are unchanged.
