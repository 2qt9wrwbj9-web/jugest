# JUGEST VPS Canonical Ingest + Automatic Analysis Design

## Status

Approved architecture for moving JUGEST analytical source data and analytical execution from browser IndexedDB to the KAGOYA VPS while keeping the iPhone as the ana-slo acquisition client.

- Production deployment branch at design start: `deploy/vps` at `ca201bc756bfdea4fa8d92f27800c0e3394ed145`
- Feature branch: `sol/vps-canonical-ingest-analysis`
- VPS target: KAGOYA Ubuntu 24.04, 2 vCPU, 2 GiB RAM
- Public origin: `https://jugest.net`
- Current acquisition client: iPhone Shortcut using Collector V2 (`iosCollectorNextV2` / `iosCollectorPushV2`)
- Current Relay storage: `/var/lib/jugest/relay.sqlite`
- Production authorization: **none**. This spec authorizes feature-branch design/implementation/testing only.

This design supersedes the older Phase 2A polling-import topology in `2026-09-09-vps-phase2a-collector-import-design.md` for the new steady-state path. The Relay itself now runs on the VPS, so a second Vercel-to-VPS polling importer is unnecessary.

## Goal

Make the VPS the single canonical home for acquired store/day data and JUGEST analytical outputs.

The steady-state path is:

```text
iPhone Shortcut
  -> ana-slo fetch on iPhone
  -> POST jugest.net/api/relay (iosCollectorPushV2)
  -> existing Relay validation + existing Collector parser
  -> raw HTML gzip archive on VPS
  -> canonical SQLite store/day persistence on VPS
  -> return ok:true to iPhone only after canonical persistence succeeds
  -> enqueue/coalesce VPS analysis work
  -> memory-aware analysis worker
  -> analysis_state / analysis_receipts / client_snapshots
  -> JUGEST browser reads VPS API results
```

The browser is no longer the canonical analytical database and does not run heavy store analysis. IndexedDB may remain only for genuinely device-local concerns such as UI state, drafts, and live unsaved inputs.

## Non-goals and protected boundaries

This work must not:

- change Juggler/HANA probability tables;
- change `externalJudge` semantics;
- change single-evidence math or evidence catalog semantics;
- change strict Champion eligibility or math;
- change Calibration;
- change store-share constraint behavior;
- change HANA hard constraints;
- change ranking or prediction semantics;
- reactivate direct VPS -> ana-slo collection;
- add anti-bot evasion, CAPTCHA bypass, proxy rotation, or residential proxy behavior;
- change `main`;
- deploy to Production without explicit user approval immediately before deployment.

The migration changes execution location, persistence, orchestration, and APIs. It does not redesign the analytical mathematics.

## Why the iPhone remains the source fetcher

Direct ana-slo acquisition from the KAGOYA VPS has already been tested and receives Cloudflare HTTP 403, including browser-like request/TLS experiments. Therefore the compliant architecture keeps source retrieval on the iPhone and sends the fetched page to the VPS.

The VPS performs all work after acquisition: validation, durable archival, canonical persistence, analysis scheduling, analysis execution, and result serving.

## Canonical data ownership

### Analytical source of truth

The VPS SQLite database is the sole canonical analytical source.

Canonical tables remain:

- `stores`
- `store_days`
- `machine_day_data`
- `analysis_state`
- `analysis_receipts`
- `client_snapshots`

`relay.sqlite` remains transport/protocol state. It is not the long-term analytical database.

The canonical database defaults to:

```text
/var/lib/jugest/jugest.sqlite
```

and is configured through `JUGEST_DB_PATH`.

### Browser IndexedDB

Acquired store/day history and store-analysis result history must no longer depend on browser IndexedDB in the new VPS-backed path.

Browser storage may continue to hold:

- UI preferences;
- active screen/store selection;
- unsaved or device-local live-play state;
- drafts and other state that is intentionally device-specific.

A browser storage deletion must not delete canonical acquired store history or server analysis history.

## Existing Relay parser remains authoritative

`iosCollectorPushV2` already performs:

- Collector-key authentication;
- job/lease validation;
- upstream/error-page diagnostics;
- page identity validation;
- existing Collector HTML parsing;
- quality checks;
- machine-count sanity checks;
- normalized day creation;
- Relay revision/receipt persistence.

The canonical VPS ingest path must consume the **same normalized `day` object produced by the existing Relay parser**. It must not independently reinterpret the HTML with a second competing parser for canonical semantics.

The raw HTML is archived separately for audit/reprocessing, but the first canonical normalized payload is the existing Relay parser result.

## Push acknowledgement contract

The user explicitly selected fail-closed acknowledgement mode A:

> `ok:true` from `iosCollectorPushV2` means the raw source artifact and canonical VPS store/day data are durably saved.

A successful HTTP response therefore requires all of the following:

1. existing Relay authentication/job validation passes;
2. existing Collector parser/quality checks pass;
3. raw HTML archive is durably written;
4. canonical `stores`, `store_days`, and `machine_day_data` transaction commits;
5. the required analysis job is durably queued or coalesced;
6. only then may the Relay transaction complete and success be returned.

Heavy store analysis does **not** block the iPhone HTTP request. Analysis starts asynchronously after durable ingest.

## Relay integration hook and ordering

The Relay runtime gains an optional post-parse ingest hook. The default remains absent/no-op so Vercel/legacy behavior is unchanged unless the VPS explicitly wires the hook.

Conceptual interface:

```js
onCollectorSaved({
  channelId,
  sourceStoreId,
  shop,
  date,
  parserBuild,
  day,
  rawText,
  jobToken,
  revision
}) -> Promise<CanonicalIngestResult>
```

The hook runs after the existing parser has produced and saved the normalized Relay day, but before the surrounding Collector transaction is allowed to commit and before `ok:true` is returned.

### Cross-database atomicity rule

Relay state and canonical analytical data live in separate SQLite databases, so a true single SQLite transaction across both files is not assumed.

Ordering is deliberately:

```text
1. Relay transaction prepares/updates normalized day
2. canonical ingest hook archives raw + commits canonical DB + durable analysis job
3. Relay transaction commits
4. HTTP success returns
```

If step 2 fails, the Relay transaction is rolled back and the iPhone does not receive success.

If step 2 succeeds but step 3 later fails, a retry may repeat canonical ingest. Therefore canonical ingest is content-idempotent and safe to replay. This is preferable to committing Relay first, because a committed Relay duplicate receipt must never suppress a canonical save that did not happen.

## Raw artifact archive

Every successful canonical ingest retains the fetched raw page as gzip.

Default root:

```text
/var/lib/jugest/raw
```

Path shape:

```text
/var/lib/jugest/raw/<safe-store-id>/<YYYY>/<MM>/<YYYY-MM-DD>.html.gz
```

Requirements:

- SHA-256 is computed from the uncompressed UTF-8 source bytes;
- file write is temp-file + atomic rename;
- directories are restrictive and owned by the unprivileged JUGEST service account;
- path segments are validated against traversal;
- `store_days.raw_artifact_path` stores the final path;
- `store_days.source_hash` stores raw SHA-256;
- re-ingesting the same store/date replaces the date artifact atomically only after the new artifact is fully written;
- a failed canonical DB transaction must not leave a database row claiming a nonexistent raw artifact.

The raw archive is an audit/reprocessing asset, not a second analytical source of truth.

## Canonical identity and normalized storage

For a successful Collector day:

```text
store_id      = sourceStoreId
business_date = day.date
store name    = shop
```

`stores.source_metadata_json` contains non-secret provenance, including source `ana-slo-ios-relay`, Collector channel identifier/hash-safe metadata as needed, parser build, and last source revision. Tokens/Collector keys are never stored.

`store_days` records:

- parser build/version from the Relay saved record;
- raw SHA-256;
- canonical normalized payload SHA-256;
- quality status;
- raw artifact path;
- timestamps.

`machine_day_data` stores the complete normalized machine array for the day. Machine rows are replaced transactionally as one semantic unit on corrected-day ingest.

Until a stronger stable semantic row key is proven by the existing parser contract, `machine_key` remains an ordinal transport key (`000000`, `000001`, ...) so the exact normalized array can be reconstructed without inventing identity semantics.

## Canonical JSON and idempotency

Canonical JSON uses deterministic lexicographically sorted object keys and preserves array order. Unsupported/non-finite values fail closed.

For each normalized day:

```text
normalized_payload_hash = SHA256(canonicalJson(day))
```

Behavior:

- first store/day: persist full day + queue analysis;
- same store/day + same hash: semantic no-op; ensure required job/snapshot state exists, then succeed;
- same store/day + changed hash: atomically replace all machine rows, update hashes/raw pointer, and queue fresh analysis keyed by new hash;
- duplicate iPhone retries must not create duplicate analysis jobs or duplicate semantic receipts.

## Analysis scheduling

After a changed canonical store/day commits, a durable `DAILY_ANALYSIS` job is queued.

Initial policy:

```text
priority: 20
idempotency key: daily:<storeId>:<businessDate>:<normalizedPayloadHash>:<analysisVersion>
```

Multiple newly acquired days for the same store may arrive faster than analysis completes. The scheduler may coalesce obsolete queued store-analysis refreshes so the newest job analyzes the current canonical history, but it must preserve receipts proving which input frontier/hash produced each published result.

Acquisition and API responsiveness outrank analysis throughput.

## 2 GiB execution policy

Reuse the existing VPS memory-aware scheduler:

```text
hardReserveMiB: 320
emergencyReserveMiB: 220
cautionUsedRatio: 0.70
pauseUsedRatio: 0.82
emergencyUsedRatio: 0.88
```

Although the existing scheduler can admit up to three children, this migration initially limits **heavy JUGEST analysis to one concurrent child**. This avoids turning the first migration into a memory-concurrency experiment.

The worker remains a disposable child process with a bounded V8 heap derived from the memory lease. Peak RSS updates the existing EWMA model. Later concurrency increases require KAGOYA soak evidence, not guesswork.

## Analysis runtime: execute existing semantics, do not rewrite them

The first VPS analysis adapter runs the current production JUGEST analytical runtime headlessly in Node rather than manually porting protected formulas.

The repository already has a Node `vm` test harness that loads:

- `hanahana-judge.js`
- `missing-inference.js`
- `core-v510.js`
- inline runtime scripts from `index.html`

The production VPS worker will use the same principle in a VPS-only adapter with deterministic browser stubs. It will load canonical store/day data from SQLite into an ephemeral in-process analytical dataset and call the existing JUGEST bridge/runtime functions.

Important distinction:

- canonical persistence is SQLite on VPS;
- the worker may use an ephemeral RAM/browser-storage shim solely to satisfy the unchanged runtime interface;
- that shim is discarded when the child exits and is **not** a browser IndexedDB source of truth.

If a narrow VPS-only data-injection seam is required, it may be added only as plumbing. It may assign/load the existing normalized `externalDays` representation, but it must not alter judgement, evidence, ranking, calibration, prediction, or store-analysis formulas.

## Automatic analysis profile

Every changed day triggers the default store-analysis refresh using the current UI defaults:

```text
period  = 180 days
minG    = 2000
maxDims = 1
minDays = 4
```

The worker first ensures the store/day rows have the existing setting-judgement fields required by downstream analysis, using the unchanged current judgement functions. It then runs the unchanged store-analysis pipeline for the store.

Heavy variants (for example maxDims 2/3, long walk-forward relearning, research, or backfill) are separate lower-priority jobs and are not silently added to every acquisition.

## Incremental migration rule

Long-term operation should be incremental where exact semantic parity can be proven, as defined by the existing 2 GiB backend design.

For this implementation, correctness outranks premature incremental rewriting:

- canonical day ingestion is incremental immediately;
- analysis job scheduling is incremental/coalesced immediately;
- analytical components may initially perform a bounded store-history replay inside the disposable worker if that is necessary to preserve exact current semantics;
- each future conversion from replay to persistent rolling `analysis_state` requires parity tests before adoption.

No approximate shortcut is allowed solely to reduce memory or CPU.

## Analysis outputs and snapshots

A successful analysis writes, in one canonical DB transaction:

- versioned `analysis_state` where applicable;
- one `analysis_receipts` row containing store/date frontier, analysis version, input hash, output hash, completion time;
- `client_snapshots` for browser consumption.

Initial snapshot types include at least:

```text
store-analysis-default
store-data-summary
store-latest-status
```

The default store-analysis snapshot contains the same compact result currently exposed by the v5.1.2 bridge: source range, row/day counts, mean setting summary, positive/negative evidence summaries, machine summaries, and supported complex-pattern summaries. Any next-session/plan snapshot is generated only by the unchanged prediction path and must retain its current future-data protections.

Snapshots are immutable-by-version semantically: changing an analytical implementation increments its version rather than silently reinterpreting an old receipt.

## VPS read API

The web service exposes read-only analytical endpoints backed by canonical SQLite/snapshots. Example route family:

```text
GET /api/vps/stores
GET /api/vps/stores/:storeId/days?from=&to=
GET /api/vps/stores/:storeId/days/:date
GET /api/vps/stores/:storeId/analysis/default
GET /api/vps/stores/:storeId/analysis/history
GET /api/vps/stores/:storeId/status
```

Requirements:

- normal read endpoints never trigger a full historical analysis;
- secrets are never returned;
- payloads are compact/paginated where needed;
- store/day raw HTML is not publicly exposed by default;
- CORS remains same-origin/explicit allowlist;
- health remains lightweight;
- API continues serving while heavy analysis is paused or running.

Administrative/manual reanalysis is a separate authenticated internal/admin action and is not part of ordinary GET traffic.

## Browser migration

The JUGEST browser becomes a presentation/interaction client for analytical store data.

For VPS-backed store features:

- store/day lists read the VPS API;
- daily machine data read the VPS API;
- default store-analysis results read snapshots from the VPS API;
- analysis history reads VPS analysis receipts/snapshots;
- ordinary UI navigation does not re-run historical analysis locally;
- imported analytical store history is not persisted back to browser IndexedDB.

During implementation, existing browser code may retain old IndexedDB helpers for backward compatibility or rollback, but the new production VPS-backed route must not depend on them for analytical correctness.

A later cleanup may physically remove obsolete browser analytical storage only after parity and rollback windows are complete.

## Failure behavior

### Source/parse/quality failure

Existing Collector failure behavior remains authoritative. No canonical data is written and no success is returned.

### Raw archive failure

Fail the Push. Do not publish a canonical store/day that claims a missing artifact.

### Canonical SQLite failure

Rollback canonical semantic writes, fail the Push, and allow safe retry.

### Relay commit failure after canonical success

Retry may repeat canonical ingest. Hash/idempotency rules make this safe and prevent duplicate analysis jobs.

### Analysis failure

The already-ingested canonical store/day remains durable. The HTTP Push has already succeeded because heavy analysis is asynchronous. The queue records the failure and retries according to bounded queue policy. The last known-good client snapshot remains available and status exposes that newer data is awaiting/failed analysis.

### Memory pressure

Do not start a new heavy worker at pause/emergency pressure. Existing low-priority work may be terminated under emergency policy. Collector/API availability remains prioritized.

### Worker crash/OOM

Record the run failure and peak RSS when observable, update future memory estimates, retry with backoff/lower concurrency, and never lose canonical store/day data.

## Security and filesystem layout

Recommended persistent paths:

```text
/var/lib/jugest/relay.sqlite          # Relay protocol state
/var/lib/jugest/jugest.sqlite         # canonical analytical DB
/var/lib/jugest/raw/...               # gzip raw HTML archive
```

Services run as the unprivileged `jugest` account. `StateDirectory=jugest` or equivalent owns writable state. Tokens remain environment-only. Raw HTML and SQLite files are not served as static files.

## Service layout

The existing `jugest-web.service` continues to serve the site/API/Relay.

The existing coordinator implementation is activated only when this feature is explicitly deployed and verified. It runs separately from the web process so analysis memory pressure or worker failure cannot kill Relay/API service.

Initial services:

```text
jugest-web.service          # web + API + Relay + synchronous canonical ingest
jugest-coordinator.service  # durable queue + analysis child orchestration
```

No Production service is enabled by merely merging feature-branch code. Installation/enablement is a separate deployment step requiring explicit approval.

## Backfill and existing browser data

This design addresses new iPhone acquisitions first. Existing historical browser/backup data can be bulk-imported into the same canonical store/day schema using the same normalized-day persistence primitive.

Backfill/import must be idempotent and lower priority than current daily work. It must not be required for the first end-to-end new-day canary.

No historical data is deleted from browser storage during the first migration/canary phase.

## Testing strategy

Implementation uses TDD and must include all of the following.

### Ingest tests

1. successful Push does not return success until raw archive + canonical DB + durable job exist;
2. raw archive SHA/path and gzip contents match submitted source;
3. parser result persisted to canonical DB matches the existing Relay normalized `day` exactly;
4. same-hash retry is idempotent;
5. changed-day retry atomically replaces all machine rows;
6. canonical DB failure prevents Relay success;
7. simulated Relay commit failure after canonical success can retry without duplicate semantic jobs;
8. Collector secrets never enter canonical DB/raw metadata/log-safe results.

### Analysis parity tests

9. canonical SQLite days reconstructed for a store match the existing browser `externalDays` analytical input contract;
10. headless VPS judgement output matches the current production runtime for fixed fixtures;
11. default store-analysis output matches the current production runtime for identical input and parameters;
12. future-data leakage guards remain identical;
13. protected formula/probability source hashes or semantic preservation tests remain unchanged.

### Scheduler tests

14. one-heavy-worker migration cap is enforced even when the generic scheduler permits more;
15. 70/82/88% pressure bands and 320/220 MiB reserves remain unchanged;
16. analysis failure/retry does not affect canonical ingest durability;
17. newer queued store refresh can supersede obsolete unstarted refresh work without losing receipts.

### API/browser tests

18. snapshot GET endpoints are read-only and do not trigger heavy analysis;
19. JUGEST VPS-backed store views can render without analytical IndexedDB contents;
20. deleting browser analytical IndexedDB does not remove VPS-backed store history/results;
21. UI/draft/local state remains functional;
22. root regression suite and existing Relay/VPS tests remain green.

## Rollout sequence

1. implement and test entirely on `sol/vps-canonical-ingest-analysis`;
2. verify diff does not alter protected analytical semantics;
3. create/verify canonical DB and raw paths in a non-production/test environment or disposable paths;
4. run end-to-end simulated Push -> raw -> canonical DB -> queued analysis -> snapshot tests;
5. verify 2 GiB memory behavior with representative fixtures;
6. prepare deployment instructions/checkpoint;
7. stop and request explicit user approval before updating `deploy/vps` or enabling `jugest-coordinator.service` in Production;
8. after approved deployment, canary with a small number of real iPhone acquisitions and verify raw/canonical/snapshot parity before relying on it as the sole analytical path.

## Acceptance criteria

The implementation is ready for Production approval only if all are true:

1. `iosCollectorPushV2 ok:true` implies raw gzip and canonical store/day are durable on VPS.
2. Repeated/retried Push is idempotent.
3. Existing Relay parser remains the canonical normalization semantics.
4. New analytical store data no longer requires browser IndexedDB persistence.
5. Heavy store analysis runs on VPS, not iPhone/browser.
6. The VPS analysis adapter produces parity with the current protected runtime on deterministic fixtures.
7. Automatic post-ingest analysis is durable, retryable, and memory-aware.
8. Initial heavy-analysis concurrency is one.
9. API/Relay remains responsive under analysis load in representative 2 GiB tests.
10. No protected judgement/ranking/calibration/store-share/HANA semantics changed.
11. `main` remains unchanged.
12. `deploy/vps` and live systemd services remain unchanged until explicit deployment approval.

## Production safety rule

Feature-branch implementation, tests, specs, plans, and review artifacts are authorized by the user. Production promotion is not. Immediately before any update to `deploy/vps` or any live KAGOYA service enable/restart that activates this new pipeline, obtain explicit user approval.
