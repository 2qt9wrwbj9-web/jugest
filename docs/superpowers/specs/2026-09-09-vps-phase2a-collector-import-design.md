# JUGEST VPS Phase 2A Collector Import Design

## Status

Approved architecture for the next VPS development step after the Phase 1 2 GiB resource scheduler.

- Production/main baseline: `273ed61ed2019365ae1b38d76288f20e9625c9e1`
- Phase 1 code freeze: `7b743e4d92adfe137a8393b250443fbe74aaf30b`
- Phase 1 branch-final state before this spec: `940bf056a4dc72c92e76549454c34c0f0419e34f`
- Feature branch: `sol/vps-2gb-memory-scheduler`
- Current collection path: iPhone Shortcut -> existing Vercel Collector V3
- Phase 2A destination: Vercel Collector V3 -> VPS canonical store/day database
- Production authorization: **none**

Phase 2A deliberately does not wire protected JUGEST judgement math into VPS workers. That is deferred to Phase 2B so the data path can be verified independently before semantic parity work begins.

## Goal

Create a durable, idempotent bridge from the existing Collector V3 dataset into the VPS SQLite backend.

The steady-state path is:

```text
iPhone Shortcut
  -> existing Vercel Collector V3 + existing parser
  -> collectorPull delta pages
  -> VPS importer
  -> SQLite stores/store_days/machine_day_data
  -> durable DAILY_ANALYSIS placeholder job
  -> lightweight collector-import-status client snapshot
```

This phase proves that a store/day accepted by the existing Production-equivalent Collector parser can be copied to the VPS exactly once semantically, safely replayed, updated when its normalized payload changes, and recovered after interruption without changing current Collector behavior.

## Why this path

The current Collector already performs URL scheduling, Shortcut acquisition, parser validation, identity checks, retry handling, revisions, and receiver-side `collectorPull`. Phase 2A reuses that proven boundary rather than creating a second parser or changing the Shortcut.

This has three important properties:

1. existing Shortcut behavior does not change;
2. existing Vercel Collector V3/parser behavior does not change;
3. future VPS-native collection can replace only the upstream source adapter while leaving the VPS canonical store/day, queue, analysis, and snapshot layers intact.

## Verified Collector V3 pull contract

The current relay implementation authenticates `collectorPull` with `channelId + receiverToken` and accepts `sinceRevision`.

Current tests/source establish that a successful pull contains:

```js
{
  ok: true,
  items: [
    {
      revision,
      updatedAt,
      shop,
      sourceStoreId,
      day
    }
  ],
  nextRevision,
  serverRevision,
  hasMore,
  pending,
  updatedAt
}
```

The current pull limit is 45 records per page. `day` is the existing normalized parser output and contains the machine array consumed by current JUGEST imports.

Phase 2A must not reinterpret HTML or rerun parser logic. The Collector `day` object is the canonical imported payload.

## Scope split

### Phase 2A — implement now

- Collector pull HTTP client;
- receiver credential loading from VPS environment only;
- durable import cursor and revision-generation handling;
- store/day canonical hashing;
- idempotent store/day persistence;
- machine-row persistence without inventing new judgement semantics;
- atomic downstream job creation;
- lightweight import-status snapshot;
- read-only local/API snapshot surface;
- retry/reset/replay behavior;
- importer single-writer lease;
- separate run-attempt and semantic-failure accounting for queue jobs;
- TDD and root Production-preservation verification.

### Phase 2B — explicitly not part of this implementation

- run existing JUGEST judgement math on the VPS;
- convert existing judgement/store-analysis components to incremental state;
- generate production-equivalent ranking/prediction snapshots;
- change any protected probability table or semantic rule;
- promote VPS data to current user-visible Production behavior.

## Source credentials and network boundary

Secrets are read only from `/etc/jugest/jugest.env` or process environment:

```text
JUGEST_COLLECTOR_RELAY_URL
JUGEST_COLLECTOR_CHANNEL_ID
JUGEST_COLLECTOR_RECEIVER_TOKEN
JUGEST_DB_PATH
```

The receiver token is never stored in SQLite, logs, snapshots, job payloads, browser bundles, or repository files.

The importer sends a POST to the configured relay URL with:

```js
{
  action: 'collectorPull',
  channelId,
  receiverToken,
  sinceRevision
}
```

Tests inject a fake transport. No test depends on live Vercel network access.

## Canonical identity

`sourceStoreId` is used directly as VPS `stores.id` in Phase 2A.

This avoids a second store-identity mapping layer and preserves the existing Collector store identity exactly. `shop` becomes `stores.name`.

For each item:

```text
store_id       = item.sourceStoreId
business_date  = item.day.date
shop           = item.shop
```

`stores.source_metadata_json` contains only non-secret source metadata:

```js
{
  source: 'vercel-collector-v3',
  sourceStoreId,
  collectorChannelId,
  latestGeneration,
  latestRevision,
  sourceUpdatedAt
}
```

The importer fails closed if `sourceStoreId`, `shop`, `day.date`, or `day.machines` is absent/invalid. An explicit empty `day.machines: []` is valid and is not treated as a missing field.

## Canonical JSON and hashes

Phase 2A extracts the existing deterministic object-key sorting logic from `queue.mjs` into one shared VPS-only canonical JSON utility so queue payloads and store/day hashes cannot diverge.

Rules:

- object keys sort lexicographically;
- array order is preserved;
- JSON primitives are preserved;
- non-finite numbers / unsupported values are rejected rather than silently rewritten;
- UTF-8 SHA-256 of canonical `day` JSON is `normalized_payload_hash`.

Because `collectorPull` does not expose the original raw HTML or a parser build identifier, Phase 2A does not fabricate them:

```text
store_days.source_hash       = NULL
store_days.raw_artifact_path = NULL
store_days.parser_version    = NULL
quality_status               = 'valid'
```

Collector revision/source metadata is retained in import receipts and store metadata instead.

## Machine row storage

Phase 2A must not infer a semantic machine identity that the current parser contract does not explicitly guarantee.

For every imported `day.machines` array, the importer replaces the complete machine set for that `store_id × business_date` transactionally and stores rows in source array order.

`machine_key` is an ordinal transport key, not a machine-identity claim:

```text
000000
000001
000002
...
```

Each `payload_json` is the canonical JSON of the corresponding existing machine object.

Phase 2B reconstructs the exact original machine array order before calling any existing judgement adapter.

## Schema additions

Add migrations for:

```sql
CREATE TABLE collector_import_cursors (
  channel_id TEXT PRIMARY KEY,
  generation INTEGER NOT NULL DEFAULT 1,
  next_revision INTEGER NOT NULL DEFAULT 0,
  server_revision INTEGER NOT NULL DEFAULT 0,
  last_success_at TEXT,
  last_error_class TEXT,
  last_error_message TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE collector_import_receipts (
  channel_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  store_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  normalized_payload_hash TEXT NOT NULL,
  source_updated_at INTEGER,
  imported_at TEXT NOT NULL,
  PRIMARY KEY(channel_id, generation, revision)
);

CREATE TABLE collector_import_locks (
  channel_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Also add `failure_count INTEGER NOT NULL DEFAULT 0` to `jobs`.

`collector_import_receipts` records what remote revision was committed inside one revision generation. Generation prevents a remote revision reset from colliding with historical receipts that used the same revision numbers.

Existing Phase 1 tables remain the canonical data destination.

## Queue run sequence versus failure budget

Phase 1 currently increments `jobs.attempts` when a job is claimed. That is useful as a run sequence, but benign memory preemption must not consume the semantic failure budget once non-synthetic work begins.

Phase 2A freezes these meanings:

```text
attempts      = number of times the job has been claimed/run
failure_count = number of failure-budget-consuming failures
max_attempts  = maximum failure_count before terminal failed state
```

Rules:

- `claimNextJob` increments `attempts` only;
- `deferJob` for memory/resource preemption does not increment `failure_count`;
- `failJob` increments `failure_count` and uses the incremented value against `max_attempts`;
- stale leased/running recovery increments `failure_count`, because an abandoned run is an operational failure rather than an intentional resource defer;
- completion changes neither counter beyond the earlier claim increment.

Phase 1 tests are updated to assert the new explicit failure-budget contract without weakening queue durability or stale recovery.

## Page transaction and cursor invariant

A remote page is validated before any cursor advance.

For one successful page, one SQLite transaction must perform all semantic writes:

1. validate every returned item;
2. resolve the current cursor generation;
3. upsert `stores`;
4. compare each existing `store_days.normalized_payload_hash`;
5. insert/replace changed `store_days` and its complete `machine_day_data` set;
6. write generation-qualified `collector_import_receipts`;
7. create required downstream jobs for changed days using the same transaction;
8. update the import-status snapshots for changed stores;
9. advance `collector_import_cursors.next_revision` to the response `nextRevision` and persist the observed `serverRevision`;
10. commit.

If any step fails, the transaction rolls back and the cursor does not move.

To support this without nested `BEGIN` calls, Phase 2A adds a queue insertion primitive that can participate in an already-open transaction. The existing public `enqueueJob()` behavior remains unchanged and uses the same validation/idempotency contract.

## Idempotency and changed-day semantics

### First import

A previously unseen store/day is inserted and queues:

```text
DAILY_ANALYSIS
priority: 20
idempotency key: daily:<storeId>:<businessDate>:<normalizedHash>
```

The Phase 2A worker for this job is a **placeholder/data-ready worker only**. It must not run protected judgement math. It verifies the canonical day can be reconstructed from SQLite and emits a deterministic hash/receipt for Phase 2A plumbing tests.

### Exact replay

If the same store/day arrives with the same `normalized_payload_hash`:

- do not rewrite machine rows;
- do not create another semantic job;
- record/accept the generation-qualified newer Collector revision receipt if applicable;
- advance the cursor only after the page transaction commits.

### Corrected/replaced day

If the same store/day arrives with a different normalized hash:

- replace that day's complete machine row set atomically;
- update `store_days.normalized_payload_hash`;
- enqueue a new hash-qualified `DAILY_ANALYSIS` job;
- update the import-status snapshot.

No old partial machine rows may survive a replacement.

## Remote revision reset

A Collector revision-space reset is detected when either:

```text
response.serverRevision < stored.server_revision
OR
stored.next_revision > response.serverRevision
```

On detection the importer must, before committing the returned reset page:

1. increment `collector_import_cursors.generation` by exactly one;
2. set the effective scan cursor for the new generation to revision 0;
3. preserve all existing VPS store/day data and prior-generation receipts;
4. import/rescan the new generation using content hashes for semantic idempotency;
5. never delete VPS history merely because the remote revision decreased.

The current Collector may internally treat an over-large `sinceRevision` as zero; the importer therefore uses the returned `serverRevision` plus its stored cursor state to detect the reset explicitly.

A rescan that returns identical payload hashes creates new audit receipts for the new generation but no duplicate semantic analysis jobs.

## Pagination safety

The importer loops while `hasMore === true`, but must fail closed on non-progress:

- `nextRevision` and `serverRevision` must be non-negative integers;
- when items are returned, revisions must be positive integers and must not duplicate within the page;
- within one generation a returned revision already recorded for a different store/day/hash is corruption and fails closed;
- a `hasMore:true` response may not repeat the same `nextRevision` indefinitely;
- malformed page data aborts before cursor advance;
- HTTP/auth/5xx failures leave the cursor unchanged.

The importer has a configurable per-run page cap to prevent accidental infinite loops; default Phase 2A cap: **100 pages**. A later invocation resumes from the durable cursor.

## Importer single-writer lease

Collection itself remains the existing iPhone Shortcut in Phase 2A.

The VPS importer is lightweight network/SQLite work and is not an analysis child. It runs as a separate systemd oneshot + timer under the same unprivileged `jugest` user.

Default timer cadence: **every 15 minutes**.

A manual CLI runs the same one-shot importer immediately when desired.

Concurrent executions are controlled by `collector_import_locks`:

- acquire/update the channel row in a short `BEGIN IMMEDIATE` transaction;
- acquisition succeeds only when no unexpired lease exists, or when the existing lease belongs to the same owner;
- default lease duration is 5 minutes;
- refresh the lease between pull pages;
- release it on clean exit;
- an expired lease is recoverable by a later importer after crash/process loss.

The importer never holds a SQLite write transaction open across a network request.

This polling interval and lock lease are operational parameters, not semantic data rules.

## Client import-status snapshot

Phase 2A creates a lightweight snapshot only to prove the VPS can serve precomputed state without triggering heavy analysis.

Snapshot key:

```text
snapshot_type = 'collector-import-status'
version       = 'phase2a-v1'
```

Payload contains only non-secret operational data:

```js
{
  storeId,
  shop,
  latestBusinessDate,
  normalizedPayloadHash,
  machineCount,
  collectorGeneration,
  collectorRevision,
  importedAt
}
```

This is not a setting prediction and must never be presented as judgement output.

## Read API

Phase 2A adds a minimal VPS read API that exposes only precomputed import-status snapshots and a health endpoint.

Requirements:

- no endpoint triggers historical analysis;
- no Collector credentials are returned;
- bearer/admin secret comes from environment;
- DB writes are not exposed through the read API;
- CORS is deny-by-default and configured explicitly;
- tests run against the handler directly without binding a public port.

Production DNS/TLS/reverse-proxy activation is outside Phase 2A.

## Phase 1 scheduler compatibility

Phase 2A must preserve the frozen 2 GiB scheduler defaults and cross-tick lease invariant.

The new placeholder `DAILY_ANALYSIS` job uses the existing priority 20 and starts with a conservative configured lease floor. Its real RSS is learned by the existing EWMA mechanism.

Phase 2A closes the Phase 1 failure-budget/preemption limitation using the explicit `failure_count` contract above. The Phase 1 graceful-shutdown and conservative-lease limitations remain documented and are not expanded into unrelated scheduler redesign in this phase.

## Error behavior

- Unauthorized Collector response: importer fails, records sanitized error class, cursor unchanged.
- Network/timeout: importer fails without DB semantic changes for the uncommitted page.
- Malformed Collector item: fail closed, cursor unchanged.
- Conflicting duplicate remote revision inside one generation: fail closed.
- SQLite transaction failure: rollback all page writes and cursor movement.
- Explicit `day.machines: []`: store faithfully as a valid empty machine set.
- Snapshot failure inside the page transaction: page does not commit.
- Downstream placeholder job failure: imported store/day remains durable; queue retry semantics handle the job independently.

Logs must never contain `receiverToken` or the raw request body containing that token.

## TDD requirements

Every implementation task starts RED and reaches GREEN before the next task.

Tests must cover at least:

1. exact Collector pull request shape with injected fake HTTP transport;
2. first-page import and durable cursor advance;
3. multi-page import up to `hasMore:false`;
4. crash/throw before transaction commit leaves cursor and data unchanged;
5. same-hash replay is a semantic no-op;
6. changed hash atomically replaces machine rows and creates a new hash-qualified job;
7. corrected day never leaves stale machine rows;
8. remote revision reset increments generation and safely rescans from zero without receipt collision;
9. malformed/non-progress pagination fails closed;
10. credentials never enter SQLite/snapshots/log-safe returned objects;
11. placeholder daily job reconstructs exact machine-array order and hashes deterministically;
12. import-status snapshot is deterministic and contains no judgement claims;
13. concurrent importer lease excludes a second live importer and expires safely after crash;
14. schema migration is restart-safe/idempotent;
15. memory defer does not consume `failure_count`, while real/stale failures do;
16. Phase 1 scheduler/queue tests remain green;
17. root `npm test` and mandatory Production-preservation tests remain green;
18. branch diff contains no modification to existing protected root runtime/Collector/parser/judgement files.

## Proposed Phase 2A file boundary

```text
vps/src/
  canonical-json.mjs
  collector-client.mjs
  collector-import.mjs
  collector-store.mjs
  snapshots.mjs
  api.mjs
  jobs/
    data-ready.mjs

vps/scripts/
  collector-import.mjs

vps/systemd/
  jugest-collector-import.service
  jugest-collector-import.timer

vps/tests/
  collector-client.test.mjs
  collector-import.test.mjs
  collector-revision-reset.test.mjs
  collector-lock.test.mjs
  snapshot-api.test.mjs
  data-ready-job.test.mjs
```

Modify only VPS files plus Phase 2A docs/tests/workflow artifacts. Existing root/Vercel files remain untouched.

## Acceptance criteria

Phase 2A is acceptable only if all of the following hold:

1. Existing Shortcut and Vercel Collector V3 require no code change.
2. A Collector-normalized day can be imported to VPS and reconstructed semantically exactly from canonical JSON/machine order.
3. Cursor never advances beyond uncommitted data.
4. Same content can replay indefinitely without duplicate semantic jobs.
5. Corrected content replaces one store/day atomically and triggers exactly one new hash-qualified job.
6. Remote revision reset is non-destructive and cannot collide with old revision receipts.
7. No Collector secret is persisted or exposed.
8. Concurrent importers cannot both own the same live channel lease.
9. Memory/resource deferral does not spend the semantic job failure budget.
10. Client snapshot reads perform no heavy analysis.
11. Phase 1 2 GiB scheduler safety contracts remain green.
12. Current root JUGEST/Collector/parser/protected judgement behavior remains preserved.
13. No `main` merge, Vercel Production deployment, DNS change, or KAGOYA Production deployment occurs.

## Phase 2B gate

Phase 2B may begin only after Phase 2A has a frozen verification report showing canonical import/replay/correction behavior and Production preservation.

Phase 2B then wires the first production-equivalent judgement adapter behind historical parity tests. Any difference in protected judgement results must fail closed and be reviewed rather than normalized away.
