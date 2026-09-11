# JUGEST VPS Canonical Ingest + Automatic Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the KAGOYA VPS the canonical store-data and analysis backend: iPhone PushV2 succeeds only after raw + canonical persistence, then VPS automatically runs the unchanged JUGEST analysis and serves snapshots/read APIs.

**Architecture:** Extend the existing VPS Relay with an optional post-parse canonical-ingest hook. The hook archives raw HTML immutably by SHA, writes normalized store/day rows to `jugest.sqlite`, and durably queues/coalesces a `DAILY_ANALYSIS` job before Relay success. A memory-aware disposable child runs the existing JUGEST runtime headlessly against VPS-loaded history, writes versioned snapshots/receipts, and the web service exposes read-only APIs. Browser IndexedDB is not an analytical source of truth on the new path.

**Tech Stack:** Node.js 22+, `node:sqlite`, `node:vm`, SQLite WAL, existing JUGEST inline runtime/bridge, existing VPS coordinator/child scheduler, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-11-vps-canonical-ingest-analysis-design.md`

## Global Constraints

- Do not change `main`.
- Do not deploy or promote to Production without explicit user approval immediately before deployment.
- Do not change Juggler/HANA probability tables, `externalJudge`, single-evidence math/catalog, strict Champion, Calibration, store-share constraint, HANA hard constraints, ranking or prediction semantics.
- Do not reactivate direct VPS -> ana-slo collection or add anti-bot evasion.
- `ok:true` for `iosCollectorPushV2` means raw artifact + canonical store/day + durable analysis scheduling all succeeded.
- Heavy JUGEST analysis starts at one concurrent child on the 2 GiB VPS.
- Raw artifacts are immutable SHA-qualified gzip files; DB rows point at a fully-written artifact.
- Acquired analytical history and analytical results use VPS persistence, not browser IndexedDB, on the new path.

---

### Task 1: Canonical JSON, immutable raw archive, and store/day ingest

**Files:**
- Create: `vps/src/canonical-json.mjs`
- Create: `vps/src/ingest/raw-archive.mjs`
- Create: `vps/src/ingest/canonical-ingest.mjs`
- Modify: `vps/src/queue.mjs`
- Test: `vps/tests/canonical-ingest.test.mjs`

**Interfaces:**
- Produces: `canonicalJson(value)`, `hashCanonical(value)`.
- Produces: `archiveRawArtifact({root,storeId,date,rawText}) -> {path,sha256,bytes,compressedBytes,created}`.
- Produces: `ingestCollectorDay(db,{rawRoot,channelId,sourceStoreId,shop,date,parserBuild,day,rawText,revision,nowIso}) -> {changed,storeId,businessDate,normalizedHash,rawSha256,rawArtifactPath,machineCount,jobId}`.
- Produces: `enqueueJobInTransaction(db, input)` so ingest can queue inside its already-open transaction without nested `BEGIN`.

- [ ] **Step 1: Write the failing canonical-ingest test** covering first ingest, raw gzip existence/content, SHA-qualified path, canonical rows, machine order, queued job, same-hash idempotency, and changed-day replacement.

- [ ] **Step 2: Run `cd vps && node --test tests/canonical-ingest.test.mjs` and verify RED because the new modules/functions do not exist.**

- [ ] **Step 3: Implement canonical JSON validation/hash and immutable gzip archive.** Raw path ends in `<date>.<sha256>.html.gz`, uses temp + atomic rename, and never rewrites an existing content-addressed file.

- [ ] **Step 4: Implement canonical ingest transaction.** Upsert `stores`, compare existing `store_days.normalized_payload_hash`, replace the full machine set only when changed, set parser/raw/hash metadata, and queue `DAILY_ANALYSIS` with key `daily:<storeId>:<date>:<normalizedHash>:vps-runtime-v1`.

- [ ] **Step 5: Run the focused test and then `cd vps && npm test`; both must pass.**

- [ ] **Step 6: Commit the green Task 1 checkpoint.**

### Task 2: Relay post-parse hook and fail-closed PushV2 acknowledgement

**Files:**
- Modify: `api/_relay-web.js`
- Modify: `vps/src/relay-handler.mjs`
- Modify: `vps/src/web-main.mjs`
- Modify: `vps/src/web-server.mjs`
- Test: `vps/tests/relay-canonical-ingest.test.mjs`
- Test: existing root/VPS Relay regression tests.

**Interfaces:**
- Extend `createRelayRuntime({createStore,batch,onCollectorSaved})`.
- Hook payload: `{channelId,sourceStoreId,shop,date,parserBuild,day,rawText,jobToken,revision}`.
- Extend `createVpsRelayHandler({dbPath,canonicalDbPath,rawRoot})`.

- [ ] **Step 1: Write a failing integration test that creates a real VPS Relay Collector job and proves PushV2 does not return success unless the injected canonical hook succeeds.**

- [ ] **Step 2: Verify RED.** Existing runtime has no hook and canonical rows are absent.

- [ ] **Step 3: Patch the packed Relay source only at the successful `iosCollectorPushV2` post-parse/save boundary.** Default hook remains no-op/absent so Vercel behavior is unchanged.

- [ ] **Step 4: Wire the VPS Relay handler to `openDatabase(canonicalDbPath)`, `migrate()`, and `ingestCollectorDay()`; pass the original raw input and parser-produced normalized day into the hook.**

- [ ] **Step 5: Extend web config with `JUGEST_DB_PATH` and `JUGEST_RAW_ROOT`; keep defaults `/var/lib/jugest/jugest.sqlite` and `/var/lib/jugest/raw`.**

- [ ] **Step 6: Run focused Relay ingest tests, all VPS tests, and root Collector/Relay regressions.**

- [ ] **Step 7: Commit the green Task 2 checkpoint.**

### Task 3: Explicit queue failure budget and heavy-analysis single-concurrency guard

**Files:**
- Modify: `vps/src/schema.mjs`
- Modify: `vps/src/queue.mjs`
- Modify: `vps/src/coordinator.mjs`
- Test: `vps/tests/queue.test.mjs`
- Test: `vps/tests/coordinator.test.mjs`

**Interfaces:**
- Add `jobs.failure_count INTEGER NOT NULL DEFAULT 0` migration.
- `attempts` remains run/claim sequence; `failureCount` becomes semantic failure budget.
- Add coordinator option/policy `maxHeavyAnalysisChildren=1` for `DAILY_ANALYSIS` jobs without reducing existing synthetic/non-heavy scheduler test coverage.

- [ ] **Step 1: Add failing tests proving repeated `deferJob` does not consume failure budget and a second concurrent `DAILY_ANALYSIS` is not admitted while one is active.**

- [ ] **Step 2: Verify RED.**

- [ ] **Step 3: Migrate queue semantics to explicit `failure_count`; actual failures and stale recovery increment it, resource defer does not.**

- [ ] **Step 4: Add a heavy-job admission cap of one while preserving the host memory policy and other job classes.**

- [ ] **Step 5: Run queue/coordinator tests and full VPS suite.**

- [ ] **Step 6: Commit the green Task 3 checkpoint.**

### Task 4: Headless production JUGEST runtime adapter

**Files:**
- Create: `vps/src/analysis/runtime-adapter.mjs`
- Create: `vps/src/analysis/store-data.mjs`
- Test: `vps/tests/analysis-runtime.test.mjs`

**Interfaces:**
- `loadStoreDays(db,storeId,{limit=180}) -> {store,days}` reconstructs exact machine-array order from ordinal `machine_key`.
- `runExistingStoreAnalysis({rootDir,shop,days,options}) -> compactResult` boots the unchanged JUGEST runtime in a Node `vm`, imports the normalized days into ephemeral in-memory browser storage, and calls bridge `runStoreAnalysis`.

- [ ] **Step 1: Write a failing runtime test using a small deterministic store/day fixture.** Assert the adapter loads the real bridge, imports via `previewExternalJson` + `saveExternalJsonPreview`, and returns `runStoreAnalysis` output without modifying protected source files.

- [ ] **Step 2: Verify RED.**

- [ ] **Step 3: Implement the production VM/browser shim derived from the existing test harness, but located under `vps/src/analysis/` and using only ephemeral memory.**

- [ ] **Step 4: Implement canonical SQLite -> normalized bulk payload reconstruction.** Never persist the ephemeral IndexedDB shim.

- [ ] **Step 5: Run focused adapter tests plus root semantic/static tests that protect analysis orchestration.**

- [ ] **Step 6: Commit the green Task 4 checkpoint.**

### Task 5: DAILY_ANALYSIS worker, receipts, snapshots, and dirty/coalesced store refresh

**Files:**
- Modify: `vps/src/schema.mjs`
- Create: `vps/src/analysis/repository.mjs`
- Create: `vps/src/jobs/daily-analysis.mjs`
- Modify: `vps/src/coordinator.mjs`
- Modify: `vps/src/child-runner.mjs` if required for environment/root/db propagation.
- Test: `vps/tests/daily-analysis.test.mjs`
- Test: `vps/tests/coordinator.test.mjs`

**Interfaces:**
- Add `analysis_dirty_stores(store_id PRIMARY KEY, latest_business_date, latest_normalized_hash, dirty_at, queued_job_id, running_job_id)` or equivalent durable coalescing state.
- `commitAnalysisResult(db,{storeId,targetDate,version,inputHash,result,nowIso})` writes receipt + snapshots atomically.
- Worker version: `vps-runtime-v1`.

- [ ] **Step 1: Write failing tests proving many ingests for one store coalesce to one current refresh, worker publishes `store-analysis-default`, `store-data-summary`, `store-latest-status`, and a receipt, and data arriving during a running job causes one follow-up refresh rather than being lost.**

- [ ] **Step 2: Verify RED.**

- [ ] **Step 3: Implement durable dirty/coalescing state and make ingest mark/update it transactionally.**

- [ ] **Step 4: Implement the worker: open `JUGEST_DB_PATH`, load current store history, run the existing runtime with `{period:'180',minG:'2000',maxDims:'1',minDays:'4'}`, hash input/output, commit snapshots/receipt, then resolve dirty state or queue one follow-up if frontier changed while running.**

- [ ] **Step 5: Route `DAILY_ANALYSIS` jobs to `jobs/daily-analysis.mjs`; keep synthetic worker support for existing tests/operations.**

- [ ] **Step 6: Run focused tests and full VPS/root regression suites.**

- [ ] **Step 7: Commit the green Task 5 checkpoint.**

### Task 6: Read-only VPS analytical API

**Files:**
- Create: `vps/src/analysis/read-api.mjs`
- Modify: `vps/src/web-server.mjs`
- Modify: `vps/src/web-main.mjs`
- Test: `vps/tests/analysis-api.test.mjs`
- Test: `vps/tests/web-server.test.mjs`

**Interfaces:**
- `GET /api/vps/stores`
- `GET /api/vps/stores/:storeId/days?from=&to=&limit=`
- `GET /api/vps/stores/:storeId/days/:date`
- `GET /api/vps/stores/:storeId/analysis/default`
- `GET /api/vps/stores/:storeId/analysis/history`
- `GET /api/vps/stores/:storeId/status`

- [ ] **Step 1: Write failing handler tests for successful reads, missing store/day, pagination bounds, invalid path/date, secret/raw non-exposure, and proof that GETs never enqueue jobs.**

- [ ] **Step 2: Verify RED.**

- [ ] **Step 3: Implement read-only queries and route wiring.** Raw HTML is never returned. API opens/uses the canonical DB only; Relay DB is not used for analytical reads.

- [ ] **Step 4: Run focused API tests and full VPS suite.**

- [ ] **Step 5: Commit the green Task 6 checkpoint.**

### Task 7: Browser VPS-backed analytical read path + final preservation verification

**Files:**
- Modify: `index.html` only at VPS analytical data/analysis bridge plumbing seams required to read server snapshots; do not alter protected formulas.
- Modify: `app-v510.js` only where store-analysis UI invokes local heavy analysis, switching the VPS-backed production path to read precomputed API output.
- Test: add focused root static/browser tests for VPS-backed store analysis and IndexedDB non-dependence.
- Add: `docs/vps/VPS-CANONICAL-INGEST-ANALYSIS-VERIFICATION.md`

**Interfaces:**
- Browser analytical store reads use `/api/vps/...`.
- Ordinary store-analysis viewing reads `store-analysis-default`; it does not run historical brute analysis locally.
- Existing local analytical helpers may remain as rollback/developer fallback but are not the new VPS-backed source of truth.

- [ ] **Step 1: Write failing browser/static tests proving the new VPS-backed path does not require `externalDbGet()`/`externalDbSet()` to display canonical store analysis and that ordinary view navigation does not call local `runStoreAnalysis`.**

- [ ] **Step 2: Verify RED.**

- [ ] **Step 3: Add the narrow VPS API client/bridge path.** Preserve local live-input/UI storage and do not delete old helpers in this migration.

- [ ] **Step 4: Run root full regression suite, VPS full suite, production-preservation tests, and compare protected source/hash expectations.**

- [ ] **Step 5: Write verification report with exact test outputs, changed files, branch SHA, known limitations, and explicit statement that coordinator service is still not installed/started and Production is unchanged.**

- [ ] **Step 6: Commit final feature-branch checkpoint. Do not fast-forward `deploy/vps` or modify `main`.**

## Final Self-Review Checklist

- Every successful PushV2 canonical path has raw gzip + canonical day + durable scheduling before `ok:true`.
- Canonical ingest replay is idempotent across Relay rollback/retry.
- Corrected days replace all machine rows atomically.
- Raw artifact path and raw SHA can never point at partially written content.
- One store backfill does not spawn one heavy job per historical day.
- Analysis runs current protected runtime, not a rewritten approximation.
- Heavy analysis is one-at-a-time initially and remains subordinate to API/Collector memory safety.
- Analysis failure cannot erase ingested data or last known-good snapshot.
- Browser analytical correctness no longer depends on IndexedDB.
- `main`, `deploy/vps`, Production VPS, DNS, and installed systemd coordinator state remain unchanged until explicit approval.
