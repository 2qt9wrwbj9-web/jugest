# jugest

Juggler / HANA HANA setting-analysis tool.

Current app release: **v4.8.3**.

## Current production

For the foreseeable future, **Netlify is the sole active production target**.

- App: `https://jugest.netlify.app`
- Static publish directory: `public/`
- Relay/API: Netlify Function `netlify/functions/relay.mjs` exposed as `https://jugest.netlify.app/api/relay`
- Safari Relay bridge: `https://jugest.netlify.app/relay-bridge.html`
- Launcher: `https://jugest.netlify.app/ana-launcher.js`
- Current bookmarklet loader: `BOOKMARKLET_v4500.txt` -> Netlify Launcher
- Relay transient storage: Netlify Blobs
- Durable shop history and analysis snapshots: browser IndexedDB + complete backup

`main` is the source branch. Netlify should deploy from `main`; `netlify.toml` runs `npm run check` before publish. GitHub Actions is CI-only and does not deploy GitHub Pages.

Production wiring must stay on `jugest.netlify.app` unless a future migration is explicitly re-approved. The app, Launcher, Relay bridge, bookmarklet loader and Relay/API must move together if that policy ever changes.

## Paused VPS work

The `vps/`, `tests/vps-*` and `scripts/switch-relay-origin.mjs` files are **parked migration artifacts only**. They are intentionally excluded from the active build/test path while Netlify is production. Do not use them for deployment or origin switching unless VPS migration is explicitly resumed later.

This hosting policy does not change setting judgment math, single-evidence logic, strict Champion, Calibration, hybrid ranking, probability tables, acquisition pacing, or Relay protocol semantics.
