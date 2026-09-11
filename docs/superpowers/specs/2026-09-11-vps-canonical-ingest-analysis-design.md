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

This design supersedes the older Phase 2A Vercel-to-VPS polling-import topology for the steady-state path. Relay now runs on the VPS, so a second importer hop is unnecessary.

## Goal

Make the VPS the single canonical home for acquired store/day data and JUGEST analytical outputs.

```text
iPhone Shortcut
  -> ana-slo fetch on iPhone
  -> POST jugest.net/api/relay (iosCollectorPushV2)
  -> existing Relay validation + existing Collector parser
  -> immutable raw HTML gzip archive on VPS
  -> canonical SQLite store/day persistence on VPS
  -> durable store-analysis dirty/request state
  -> only then return ok:true to iPhone
  -> memory-aware VPS analysis worker
  -> analysis_state / analysis_receipts / client_snapshots
  -> JUGEST browser reads VPS API results
```

The browser is no longer the canonical analytical database and does not run heavy store analysis. IndexedDB may remain only for intentionally device-local state such as UI preferences, drafts, and unsaved live-play inputs.

## Protected boundaries

This migration changes execution location, persistence, orchestration, and APIs. It must not change analytical semantics.

It must not change:

- Juggler/HANA probability tables;
- `externalJudge` semantics;
- single-evidence math or evidence catalog semantics;
- strict Champion eligibility/math;
- Calibration;
- store-share constraint behavior;
- HANA hard constraints;
- ranking/prediction semantics.

It also must not reactivate direct VPS -> ana-slo acquisition or introduce anti-bot evasion, CAPTCHA bypass, proxy rotation, or residential proxy behavior.

`main`, `deploy/vps`, and live systemd services remain untouched until explicit Production approval.

## Acquisition boundary

Direct ana-slo acquisition from the KAGOYA VPS has already been tested and receives Cloudflare HTTP 403. Therefore source retrieval stays on the iPhone.

Everything after retrieval moves to the VPS: validation, raw archival, normalized persistence, analysis scheduling, analysis execution, history, and result serving.

## Canonical data ownership

### Analytical source of truth

The canonical analytical database defaults to:

```text
/var/lib/jugest/jugest.sqlite
```

configured by `JUGEST_DB_PATH`.

Canonical tables remain:

- `stores`
- `store_days`
- `machine_day_data`
- `analysis_state`
- `analysis_receipts`
- `client_snapshots`
- durable queue/run/resource tables.

`/var/lib/jugest/relay.sqlite` remains Collector/Relay protocol state only. It is not the long-term analytical database.

### Browser storage

Acquired store history, normalized machine/day history, and store-analysis history/results must not depend on browser IndexedDB in the VPS-backed path.

Browser storage may continue to hold intentionally device-local state. Clearing browser storage must not delete canonical acquired history or server analysis history.

## Existing Relay parser remains authoritative

`iosCollectorPushV2` already performs Collector-key authentication, job/lease validation, upstream/error-page diagnostics, page identity checks, existing HTML parsing, quality checks, machine-count sanity checks, and normalized day creation.

Canonical VPS ingest consumes the **same normalized `day` object produced by the existing Relay parser**. It must not independently reinterpret the HTML with a second competing parser for first-pass canonical semantics.

Raw HTML is retained for audit/reprocessing, but the normalized payload accepted by the current Relay parser is the canonical initial normalized payload.

## Push acknowledgement contract

The user selected fail-closed acknowledgement mode A:

> `iosCollectorPushV2` may return `ok:true` only after the raw source and canonical VPS store/day are durably saved and the required analysis refresh is durably requested.

Success therefore requires:

1. existing Relay authentication/job validation passes;
2. existing Collector parser/quality checks pass;
3. immutable raw HTML artifact is durably written;
4. canonical `stores`, `store_days`, `machine_day_data` transaction commits;
5. analysis dirty/request state is durably updated;
6. only then may the Relay transaction commit and HTTP success return.

Heavy analysis itself is asynchronous and does not block the iPhone HTTP request.

## Relay integration hook

The Relay runtime gains an optional VPS-only post-parse ingest hook. Default behavior remains absent/no-op so legacy/Vercel behavior is unchanged unless the VPS wires it.

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

The hook runs after the existing parser has created/saved the normalized Relay day inside the Collector transaction, but before that Relay transaction is allowed to commit and before `ok:true` is returned.

The hook must obtain the normalized day from the same Relay transaction state/saved record rather than re-running a separate parser when practical.

## Cross-database ordering and idempotency

Relay state and canonical analytical data are separate SQLite databases. No fake cross-database atomicity is claimed.

Ordering is:

```text
1. Relay transaction prepares normalized day
2. canonical hook writes immutable raw artifact
3. canonical DB transaction writes/updates day + dirty analysis request
4. Relay transaction commits
5. HTTP success returns
```

If canonical ingest fails, Relay rolls back and the iPhone receives failure/no success.

If canonical ingest succeeds but Relay commit later fails, canonical data may exist before the iPhone receives success. A retry is safe because canonical ingest is content-idempotent. The required invariant is one-way: **success implies canonical durability**; canonical durability does not require that a prior HTTP success was observed.

This ordering avoids the more dangerous case where Relay commits a duplicate receipt before canonical storage exists, which could otherwise cause retries to skip canonical ingest.

## Raw artifact archive

Every canonically accepted source page is retained as gzip.

Default root:

```text
/var/lib/jugest/raw
```

Artifacts are immutable and content-addressed enough to prevent a failed DB update from changing the bytes referenced by an older DB row:

```text
/var/lib/jugest/raw/<safe-store-id>/<YYYY>/<MM>/<YYYY-MM-DD>.<sha256-prefix>.html.gz
```

Requirements:

- SHA-256 is computed from uncompressed UTF-8 source bytes;
- write uses a temp file plus atomic rename;
- path segments are traversal-safe;
- final artifact is never overwritten with different bytes;
- identical source bytes may reuse the existing same-hash file;
- `store_days.raw_artifact_path` points to the immutable final artifact;
- `store_days.source_hash` stores full raw SHA-256;
- an orphaned immutable artifact after a later DB/Relay failure is acceptable and may be garbage-collected later;
- a DB row must never point to a nonexistent or subsequently mutated artifact.

This fixes the date-file overwrite hazard: a failed corrected-day DB transaction cannot silently replace the raw bytes referenced by the old canonical row.

## Canonical identity and normalized storage

For the current single JUGEST Collector domain:

```text
store_id      = sourceStoreId
business_date = day.date
store name    = shop
```

`stores.source_metadata_json` stores non-secret provenance such as source `ana-slo-ios-relay`, parser build, and latest source revision. Collector keys/tokens are never persisted there.

If the system later supports multiple independent users/channels with potentially colliding `sourceStoreId` values, canonical identity must be namespaced before multi-tenant use. This implementation does not pretend the current personal deployment is already a multi-tenant service.

`store_days` records parser build/version, raw SHA-256, normalized payload SHA-256, quality status, raw artifact path, and timestamps.

`machine_day_data` stores the complete normalized machine array. Corrected-day ingest atomically replaces the entire machine set for that store/date.

Until a stronger stable row identity is proven by the existing parser contract, `machine_key` is an ordinal transport key (`000000`, `000001`, ...) preserving exact array order without inventing analytical identity semantics.

## Canonical JSON and same-day replay

Canonical JSON sorts object keys lexicographically and preserves array order. Unsupported/non-finite values fail closed.

```text
normalized_payload_hash = SHA256(canonicalJson(day))
```

Behavior:

- first store/day: persist full day and mark store analysis dirty;
- same store/day + same hash: semantic no-op, verify/request analysis state as needed, then succeed;
- same store/day + changed hash: replace machine rows atomically, update hashes/raw pointer, mark analysis dirty;
- repeated iPhone retries do not create duplicate semantic jobs/receipts.

## Analysis request coalescing

The current iPhone automation can acquire roughly one day every 30–90 seconds. A historical backfill may therefore ingest hundreds of days. Running a full store analysis once per acquired historical day would waste CPU and keep the 2 GiB VPS unnecessarily busy.

Add a small canonical `analysis_requests` (or equivalently named) table keyed by `store_id + analysis_profile/version` containing at least:

```text
desired_generation / dirty_generation
latest_business_date
latest_input_hash or store-data revision marker
queued_or_running state metadata
updated_at
```

Every changed canonical day increments/advances the desired generation in the same canonical DB transaction as the day save.

At most one heavy default store-analysis worker runs per store/profile at a time. If more days arrive while it is queued/running:

- do not start one worker per day;
- let the current worker finish against its captured input frontier;
- compare completed generation with desired generation;
- if newer data arrived, run one follow-up refresh against the latest canonical state;
- obsolete unstarted refresh jobs may be cancelled/superseded transactionally.

This guarantees eventual latest-state analysis while naturally collapsing high-rate backfill input.

The job queue remains durable. A job idempotency key includes store/profile/generation or equivalent content version so a crash/retry cannot duplicate semantic publication.

## 2 GiB execution policy

Reuse the existing memory-aware scheduler and its current safety bands:

```text
hardReserveMiB: 320
emergencyReserveMiB: 220
cautionUsedRatio: 0.70
pauseUsedRatio: 0.82
emergencyUsedRatio: 0.88
```

Although the generic scheduler can admit up to three children, this migration initially limits **heavy JUGEST analysis to one concurrent child**.

The worker is a disposable child process with bounded V8 heap derived from its lease. Peak RSS updates the existing EWMA model. Later concurrency increases require real KAGOYA soak evidence.

Collector/API responsiveness always outranks analysis throughput.

## Analysis runtime: execute existing semantics rather than porting formulas

The first VPS analysis adapter runs the current production JUGEST analytical runtime headlessly in Node instead of rewriting protected formulas.

The repository already has a Node `vm` test harness that loads the same current analytical assets (`hanahana-judge.js`, `missing-inference.js`, `core-v510.js`, and inline runtime code from `index.html`). The production VPS adapter will use the same principle with deterministic browser stubs.

Canonical SQLite store/day rows are reconstructed into the exact existing normalized `externalDays` analytical contract and injected into an **ephemeral in-process runtime**. The worker then calls the existing JUGEST bridge/runtime functions.

Important distinction:

- durable source data lives only in VPS SQLite/raw storage;
- an ephemeral RAM/browser-storage shim may exist inside the disposable worker only to satisfy the unchanged current runtime interface;
- the shim is discarded when the child exits;
- it is not browser persistence and is never the canonical source.

If a narrow VPS-only injection seam is required, it may only load/assign normalized input or expose existing result functions. It must not modify judgement/evidence/ranking/calibration/prediction/store-analysis formulas.

Analysis jobs pin/log an `analysis_version` tied to the JUGEST runtime/release so receipts and snapshots are reproducible and an old snapshot is never silently relabeled as output of newer code.

## Automatic default analysis profile

Changed canonical data automatically requests the existing default store analysis:

```text
period  = 180 days
minG    = 2000
maxDims = 1
minDays = 4
```

The worker uses the unchanged current judgement path to enrich rows needed by downstream store analysis, then calls the unchanged store-analysis pipeline.

Heavy variants such as maxDims 2/3, long walk-forward relearning, research, or historical experiments are separate lower-priority/manual jobs and are not silently added to every acquisition.

## Incremental migration rule

Canonical ingestion and request coalescing are incremental immediately.

For protected analysis itself, correctness outranks premature optimization:

- components may initially perform a bounded store-history replay inside the disposable worker when required for exact semantic parity;
- future conversions to persistent rolling `analysis_state` are allowed only after deterministic parity tests prove identical results;
- no approximate shortcut is adopted merely to save RAM/CPU.

This follows the existing 2 GiB backend design: incremental where exact, bounded replay where semantics are not yet safely incremental.

## Analysis publication

A successful analysis publication transaction writes:

- versioned `analysis_state` where applicable;
- `analysis_receipts` recording store, target/frontier date, analysis version, input hash, output hash, completion time;
- `client_snapshots` used by the browser.

Initial snapshot types include at least:

```text
store-analysis-default
store-data-summary
store-latest-status
```

The default analysis snapshot mirrors the compact result already exposed by the current v5.1.2 bridge: input range, day/row counts, overall summaries, machine summaries, positive/negative evidence summaries, and supported complex-pattern summaries.

If analysis fails, the last known-good snapshot remains published and status records that newer canonical data is pending/failed analysis.

Any prediction/next-session snapshot must use the unchanged prediction path and preserve existing future-data leakage protections.

## Read API and authentication

Analytical reads must not make canonical store history publicly enumerable merely because `jugest.net` is public.

The browser already has Collector linkage credentials locally. The VPS-backed analytical API should reuse the existing authenticated JUGEST/Collector session boundary or derive a dedicated read credential from it; secrets are never embedded in static source or URLs.

Read route shapes may be REST-like, for example:

```text
/api/vps/stores
/api/vps/stores/:storeId/days
/api/vps/stores/:storeId/days/:date
/api/vps/stores/:storeId/analysis/default
/api/vps/stores/:storeId/analysis/history
/api/vps/stores/:storeId/status
```

Exact GET/POST/header shape is an implementation detail, but requirements are fixed:

- authenticated/authorized read of analytical data;
- no secrets in query strings;
- ordinary read never triggers full historical analysis;
- raw HTML is not publicly exposed by default;
- compact/paginated day payloads where needed;
- same-origin/explicit CORS policy;
- API remains responsive while analysis is running or paused.

Manual/admin reanalysis is a separate authenticated action, not an ordinary page GET.

## Browser migration

The JUGEST browser becomes a presentation/interaction client for analytical store data.

VPS-backed analytical features must read VPS APIs/snapshots for:

- store/day lists;
- daily machine data;
- default store-analysis results;
- analysis history/status;
- future VPS-backed prediction snapshots.

Ordinary navigation must not launch historical analysis locally, and acquired analytical store history must not be persisted back to browser IndexedDB.

Old analytical IndexedDB helpers may remain temporarily for rollback/backward-compatibility code paths during the migration, but the VPS-backed path must work with an empty analytical IndexedDB. Physical deletion of old browser data/helpers is a later cleanup after the rollback window.

## Failure behavior

### Source/parse/quality failure

Existing Collector failure behavior remains authoritative. No canonical day is published and no success is returned.

### Raw archive failure

Fail the Push. Do not commit canonical metadata referencing an absent artifact.

### Canonical SQLite failure

Rollback canonical semantic writes/dirty state, fail the Push, allow safe retry. An immutable orphan raw artifact is harmless and may be cleaned later.

### Relay commit failure after canonical success

Retry may repeat canonical ingest. Hash/idempotency rules prevent duplicate semantic jobs/publications.

### Analysis failure

Canonical store/day remains durable. Queue failure/retry is independent of acquisition durability. Last known-good snapshot remains available with stale/pending/error status.

### Memory pressure

At pause/emergency pressure, start no heavy worker. Emergency policy may terminate lower-priority disposable work. Web/Relay/API stay prioritized.

### Worker crash/OOM

Record failure/peak RSS where observable, update lease estimates, retry with backoff, and never lose canonical store/day data.

## Filesystem and service layout

Persistent state:

```text
/var/lib/jugest/relay.sqlite          # Relay protocol state
/var/lib/jugest/jugest.sqlite         # canonical analytical DB
/var/lib/jugest/raw/...               # immutable gzip raw artifacts
```

Services run as unprivileged `jugest`; raw/SQLite files are not served statically.

Initial runtime services:

```text
jugest-web.service          # web + Relay + synchronous canonical ingest + read API
jugest-coordinator.service  # durable queue + disposable analysis children
```

The coordinator already exists in source but is **not currently installed/running in Production**. This feature may modify/prepare it on the feature branch, but live enablement is a separate Production action requiring explicit approval.

## Existing historical data/backfill

New iPhone acquisitions are the first required end-to-end path.

Existing historical browser/backup data can later be bulk-imported through the same canonical normalized-day persistence primitive. Backfill is idempotent and lower priority than current daily work.

No browser historical data is deleted during the first migration/canary phase.

## TDD and parity requirements

### Ingest

1. Push cannot return success until immutable raw + canonical day + durable dirty/request state exist.
2. gzip decompresses to the exact submitted source and SHA matches.
3. normalized canonical day matches the existing Relay parser result exactly.
4. same-hash retry is a semantic no-op.
5. changed-day retry atomically replaces complete machine rows.
6. canonical DB failure prevents Relay success.
7. Relay commit failure after canonical success retries safely without duplicate semantic jobs.
8. corrected-day DB failure cannot mutate raw bytes referenced by the previous canonical row.
9. Collector secrets never enter canonical DB, raw metadata, snapshots, or log-safe return values.

### Coalescing/scheduler

10. hundreds of rapid same-store ingests do not create hundreds of heavy simultaneous/redundant analyses.
11. data arriving during an analysis causes at most the necessary follow-up refresh to reach the latest generation.
12. initial heavy-analysis concurrency is one even though the generic scheduler can admit more.
13. existing 70/82/88% pressure bands and 320/220 MiB reserves remain unchanged.
14. analysis failure/retry cannot roll back or corrupt canonical acquired data.

### Analytical parity

15. SQLite days reconstruct the exact existing `externalDays` analytical input contract.
16. headless VPS judgement output equals the current production runtime for deterministic fixtures.
17. default store-analysis output equals the current production runtime for identical input/parameters.
18. future-data leakage guards remain identical.
19. protected-source preservation/semantic regression tests remain green.

### API/browser

20. analytical reads require authorization and do not leak credentials.
21. snapshot/day reads never trigger heavy historical analysis.
22. VPS-backed store views work with empty analytical IndexedDB.
23. deleting browser analytical IndexedDB does not remove VPS-backed history/results.
24. device-local UI/draft/live state remains functional.
25. root regression suite and existing Relay/VPS tests remain green.

## Rollout sequence

1. implement/test only on `sol/vps-canonical-ingest-analysis`;
2. verify diff does not alter protected analytical semantics;
3. run end-to-end simulated Push -> raw -> canonical DB -> coalesced analysis -> snapshot tests on disposable paths;
4. run deterministic browser-vs-VPS parity tests;
5. run representative 2 GiB memory/load tests with one heavy child;
6. prepare deployment/checkpoint instructions;
7. stop and request explicit user approval before touching `deploy/vps` or live services;
8. after approved deployment, canary with a small set of real iPhone acquisitions and verify raw/canonical/snapshot parity before relying on VPS as the sole analytical path.

## Acceptance criteria

Ready for Production approval only when all are true:

1. `iosCollectorPushV2 ok:true` guarantees raw gzip + canonical store/day + durable analysis request on VPS.
2. retries and corrected-day writes are idempotent/safe.
3. existing Relay parser remains canonical normalization semantics.
4. analytical store history/results no longer require browser IndexedDB.
5. heavy judgement/store analysis runs on VPS, not browser/iPhone.
6. VPS headless adapter matches current protected runtime on deterministic fixtures.
7. automatic analysis is durable, coalesced, retryable, memory-aware.
8. heavy-analysis concurrency starts at one.
9. API/Relay remains responsive under representative 2 GiB load.
10. no protected judgement/ranking/calibration/store-share/HANA semantics changed.
11. `main` remains unchanged.
12. `deploy/vps` and live services remain unchanged until explicit Production approval.

## Production safety rule

Feature-branch implementation, tests, specs, plans, and review artifacts are authorized. Production promotion is not. Immediately before any update to `deploy/vps` or any live KAGOYA service enable/restart that activates this pipeline, obtain explicit user approval.
