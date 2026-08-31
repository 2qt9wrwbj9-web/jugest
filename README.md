# jugest

Juggler / HANA HANA setting-analysis tool.

Current app release: **v4.8.3**.

## Current production

For the foreseeable future, **Netlify is the sole active production target**.

- App: `https://jugglerest.netlify.app`
- Static publish directory: `public/`
- Relay/API: Netlify Function `netlify/functions/relay.mjs` exposed as `https://jugglerest.netlify.app/api/relay`
- Safari Relay bridge: `https://jugglerest.netlify.app/relay-bridge.html`
- Launcher: `https://jugglerest.netlify.app/ana-launcher.js`
- Current bookmarklet loader: `BOOKMARKLET_v4500.txt` -> Netlify Launcher
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

Project-wide v4.8.4 keeps the existing setting-judgment math unchanged and upgrades the Ana-Slo collector: normal rolling guard is 30 accesses / 15 minutes; night collection uses serial 25–35 second pacing without the local rolling guard; registered-shop latest-delta collection, shop registration, chained night maintenance, and all-shop unsent Relay delivery are included. Active production remains https://jugglerest.netlify.app.
