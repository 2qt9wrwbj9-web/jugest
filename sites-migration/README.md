# JUGEST Sites migration development components

Frozen source: deploy/vps@1f8c29fc458f34e11e546fb57944d0fc31db98a5.
This directory does not deploy or change production. It contains no production database, credentials, or user data. Test credentials and observations are synthetic and exist only in tests.

## Reproduce

Use Node 24 (at least 22.13 for the upstream node:sqlite API). From the repository root:

```sh
npm ci --prefix vps
npm install --prefix sites-migration
npm test --prefix sites-migration
```

Miniflare is pinned to 4.20260515.0. Sites uses the Wrangler-installed copy of the same version; this public folder imports Miniflare directly. Generated API/auth/policy modules reuse the frozen source with asynchronous D1 calls and injected storage/configuration only. Regenerate with `npm run generate:read --prefix sites-migration` and inspect the diff. Original math and original production source files are unchanged.

## Implemented and limits

- D1 references plus immutable R2 bodies, original relay revision/CAS behavior; checksums added for new writes.
- Authenticated read handlers: `/api/vps/stores`, `/stores/{id}/days`, `/stores/{id}/days/{date}`, `/stores/{id}/analysis/default`, `/analysis/history`, `/status` (latter paths below the same `/api/vps/stores/{id}`). Exact JSON/status compared with the original SQLite API.
- Original receiver and assistant-read key checks, original scope/revocation and explicit PIA owner policy. Passkeys/invitations and Site identity-to-channel mapping remain unimplemented. No credentials are preloaded in a Site.
- Stored analysis is displayed unchanged; this does not execute or port the analysis engine.
- Day-at-a-time history iterator preserves the original requested date range and fields. It is not yet connected to the analysis engine, and does not establish a transaction snapshot across calls.
- Internal audit and recovery functions: restoration requires exact D1 checksum and revision; existing R2 objects are never overwritten. Unreferenced-object scans are nondestructive, not a safe garbage collector or atomic inventory snapshot. No maintenance HTTP endpoint exists.
- D1 migrations here are schema-only for eight tables. They do not create hosted storage or import data. Large canonical snapshot payloads above D1 limits need a separate R2 strategy.
- Hosted execution, real data migration, sync, ingest, scheduling, queue, predictions, pachinko and all MCP tools remain incomplete. No public deployment is authorized.

Full private Site source, Git history, test logs and migration status are delivered separately in the versioned evidence ZIP; they are not published in this branch.
