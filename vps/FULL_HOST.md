# Paused full-VPS hosting plan

This document is archived. **The current and approved production platform is Netlify at `https://jugglerest.netlify.app`.**

The former full-VPS plan is intentionally not an active deployment path, and the repository's active CI/build no longer validates or deploys it. Do not point DNS, run the VPS bootstrap scripts, or change the Relay/bookmarklet origin based on this file while Netlify remains production.

Current production topology:

- `https://jugglerest.netlify.app` -> app from `public/`
- `https://jugglerest.netlify.app/api/relay` -> Netlify Function Relay
- `https://jugglerest.netlify.app/relay-bridge.html` -> same-origin Safari Relay bridge
- `https://jugglerest.netlify.app/ana-launcher.js` -> acquisition Launcher
- GitHub `main` -> source branch; Netlify deploys the production build
- GitHub Actions -> CI only

The old VPS implementation remains in this directory solely as recoverable migration work. If a VPS move is explicitly approved again later, review the historical migration commits and rebuild a fresh migration checklist against the then-current app before using it.

No hosting-policy change should alter setting judgment math, probability tables, single-evidence selection, ranking, strict Champion, Calibration, store-share constraints, or acquisition pacing rules.
