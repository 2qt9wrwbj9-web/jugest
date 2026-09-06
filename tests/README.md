# Regression checks

Run `npm test` (builds public first), or `npm run build`.
The runner preserves the reference v5.1.2 artifact's 52 configured checks and adds the actual runtime flow tests.
Historical Netlify files live only under `tests/fixtures/legacy-netlify`; they are never deployment inputs and no Netlify dependency was added.

The new harness executes actual app/index/sync code and the current decoded Vercel Relay/Sync handlers with a minimal DOM, fake IndexedDB and in-memory Blob client. It does not access real user data or cloud storage. It is not a substitute for real iPhone Safari / Vercel Preview integration checks.

`node tests/helpers/preview-server.mjs` serves the built app on port 4173 with isolated, in-memory APIs. `/__sender` can claim a local pair and send synthetic data; `/__mobile` provides a 390px iframe. The cloud browser in this session refused localhost, so no visual verification is claimed.

`node probes/sync-concurrency.mjs` is separate from passing regressions: exit 0 means the documented, UNFIXED concurrent-push risk was reproduced. See docs/audit/REPORT.md before any deployment. Do not deploy to Production.
