# Paused VPS migration archive

**Netlify is the active production platform. Nothing in this directory is part of the current deployment path.**

Current production endpoints are:

- App: `https://jugglerest.netlify.app`
- Relay/API: `https://jugglerest.netlify.app/api/relay`
- Safari bridge: `https://jugglerest.netlify.app/relay-bridge.html`
- Launcher: `https://jugglerest.netlify.app/ana-launcher.js`

The files in `vps/` are retained only so the previously prepared migration work is not lost. Do not run the bootstrap/configure/update scripts and do not switch Relay origins while Netlify remains the approved production target.

The active `npm test` / `npm run check` path intentionally excludes VPS-only tests and server syntax checks. Netlify production is validated by `tests/netlify-deploy-preflight.mjs` together with the normal application regression suite.

If VPS migration is explicitly resumed in the future, restore/review the migration plan from Git history before using these scripts. At that point the app, Launcher, bookmarklet loader, Relay bridge and Relay/API must be migrated as one guarded cutover; browser storage remains origin-specific.

This parked infrastructure code does not alter setting judgment math, ranking, strict Champion, Calibration, probability tables, acquisition pacing/rate rules, or store-analysis evidence.
