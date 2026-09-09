# JUGEST VPS 2GB Memory-Aware Backend Design

## Status

Proposed production architecture for a KAGOYA VPS + iPhone 17 (base model) deployment target.

This design is intentionally **not** a Production promotion. It defines a new VPS backend layer on a feature branch while preserving the existing Vercel-hosted JUGEST UI and current protected judgement/runtime semantics until separate verification and explicit approval.

- Baseline: `main` at `273ed61ed2019365ae1b38d76288f20e9625c9e1`
- Feature branch: `sol/vps-2gb-memory-scheduler`
- Primary deployment target: KAGOYA VPS with 2 GiB RAM
- Client target: iPhone 17 base model
- Geographic operating scope: Tokyo + Kanagawa stores
- Daily operating model: append latest store-day data, then incrementally refresh analysis state and precomputed client snapshots

## Goal

Make a 2 GiB VPS a realistic long-term JUGEST backend by keeping always-on services small and dynamically filling otherwise-unused memory with disposable analysis jobs.

The backend must prefer reliable overnight completion over minimum wall-clock latency. It must not reread or recompute all historical data every day when a deterministic incremental update can produce the same semantic result.

## Non-goals

This phase does **not**:

- move the current Vercel UI to the VPS;
- change visible ranking or judgement semantics;
- modify Juggler/HANA probability tables, strict Champion math, Calibration, store-share constraint, single-evidence semantics, HANA hard constraints, Device Sync crypto/merge semantics, Collector V3 behavior, or protected parser logic;
- deploy or promote anything to Production;
- require PostgreSQL, Redis, Docker, Kubernetes, PM2, or a message broker;
- make Phase 2 Axis/OOS research results part of Production;
- require all Tokyo/Kanagawa historical data to be resident in RAM at once.

## Chosen architecture

Use one lightweight coordinator process, SQLite in WAL mode, a priority job queue, and short-lived `child_process` workers with explicit per-job memory leases.

```text
iPhone 17
   ↓
Vercel JUGEST UI
   ↓ HTTPS
VPS read API
   ↓
SQLite WAL
   ├── store/day metadata
   ├── normalized daily data
   ├── incremental analysis state
   ├── precomputed client snapshots
   ├── prediction/analysis receipts
   ├── job queue + run history
   └── resource telemetry

Collector / importer
   ↓
latest store-day append
   ↓
priority queue
   ↓
memory-aware coordinator
   ↓
short-lived child worker(s)
   ↓
incremental store analysis
   ↓
snapshot commit
```

Raw source artifacts that are materially larger than normalized rows should be stored as compressed files on disk and indexed by SQLite instead of being repeatedly copied into large in-memory JSON objects.

## Why SQLite

Tokyo + Kanagawa daily ingestion is primarily append/update workload with a single trusted backend writer and read-heavy client access. SQLite avoids the resident-memory overhead of a separate PostgreSQL service while still providing transactions, WAL readers, indexes, crash recovery, and deterministic local backups.

The VPS runtime gets its own package boundary under `vps/` so VPS-only dependencies do not change the current Vercel application's dependency surface.

## Runtime process model

### Coordinator

One long-lived Node.js process owns:

- queue admission;
- job priority;
- memory and CPU telemetry;
- lease calculation;
- child lifecycle;
- retry/backoff state;
- heartbeat/recovery;
- incremental-state commit coordination.

The coordinator never performs the heavy store analysis itself.

### Analysis workers

Heavy analysis runs in disposable `child_process` workers, not long-lived `worker_threads`.

Reasons:

- each child can receive its own V8 heap cap;
- RSS is independently observable;
- a finished child returns its heap and native allocations to the OS;
- a leaking or oversized job can be killed without destabilizing the API/coordinator;
- one large store can run alone while small stores can run concurrently.

A worker receives a single bounded job descriptor, loads only the history/state needed for that job, writes its result through an atomic/transactional commit path, then exits.

## 2 GiB resource policy

The scheduler must make decisions from actual Linux/cgroup memory pressure rather than a hard-coded worker count.

### Effective memory availability

Prefer cgroup v2 data when present:

- `/sys/fs/cgroup/memory.current`
- `/sys/fs/cgroup/memory.max`

Also read `/proc/meminfo` and use `MemAvailable`.

Define:

```text
cgroupRemaining = memory.max - memory.current
effectiveAvailable = min(cgroupRemaining, MemAvailable)
```

If no finite cgroup limit is exposed, use `MemAvailable` plus configured VPS memory as the limit model.

### Reserve and pressure bands

Defaults for a 2 GiB host:

```js
{
  hardReserveMiB: 320,
  emergencyReserveMiB: 220,
  cautionUsedRatio: 0.70,
  pauseUsedRatio: 0.82,
  emergencyUsedRatio: 0.88,
  maxAnalysisChildren: 3,
  sampleIntervalMs: 2000
}
```

Interpretation:

- below 70% used: aggressively admit another job if its lease still leaves the hard reserve;
- 70–82% used: admit only when the estimated lease clearly fits;
- 82–88% used: do not start new analysis jobs;
- 88%+ used or effective available below the emergency reserve: cancel/stop lowest-priority research/backfill children first and admit nothing new until pressure clears.

Collector/API/coordinator availability has priority over analysis throughput.

The hard reserve is deliberately not zero. The design aims to use most of 2 GiB, not to make the kernel/OOM killer the scheduler.

## Memory leases

Each queued job has an estimated RSS lease.

Admission rule:

```text
start job only if:
  effectiveAvailable - estimatedLease >= hardReserve
  and runningChildren < maxAnalysisChildren
  and pressure band permits admission
```

The coordinator records actual peak RSS per completed job and updates an EWMA estimate grouped by job type and size class. Future leases use:

```text
estimatedLease = max(configuredFloor, EWMA_peakRSS * 1.25)
```

The 25% margin is configurable but may not be reduced automatically below a safe floor.

The coordinator may increase concurrency only when the leases fit. It may therefore run two or three small daily jobs concurrently while running a single large backfill job alone.

## V8 heap limits

Each child is launched with a bounded `--max-old-space-size` derived from its memory lease. The heap limit must leave room for Buffer/native/native-addon allocations and must therefore be lower than the RSS lease.

Default:

```text
heapMiB = clamp(floor(leaseMiB * 0.65), 96, 768)
```

The child RSS limit remains the authoritative runtime signal; V8 heap size alone is not treated as total process memory.

## Queue priorities

Highest to lowest:

1. `COLLECTOR_RECOVERY` — repair missing/failed latest-day acquisition needed by current data;
2. `DAILY_ANALYSIS` — latest-day incremental analysis and next-session snapshot;
3. `SNAPSHOT_REFRESH` — client-facing materialized/precomputed result refresh;
4. `BACKFILL` — historical first-load or missing-range replay;
5. `RESEARCH` — long walk-forward / experimental analysis.

A lower-priority job may not delay a pending higher-priority job once its current child completes. In emergency pressure, `RESEARCH` and `BACKFILL` are the first cancellable jobs.

## Queue persistence and crash recovery

SQLite owns durable job state.

Required states:

```text
queued → leased → running → succeeded
                         ↘ retry_wait → queued
                         ↘ failed
                         ↘ cancelled
```

Every running job has a heartbeat and lease owner. At startup, stale `leased`/`running` jobs whose heartbeat exceeded the configured timeout are returned to `queued` or `retry_wait` according to attempt count.

Retries use bounded exponential backoff with jitter. Idempotency keys prevent duplicate store/day work from creating duplicate semantic commits.

## SQLite schema boundaries

Exact machine fields remain aligned with the current JUGEST data contract; this design does not invent or alter judgement inputs.

The VPS database should contain at least these logical tables:

### `stores`

Canonical store identity and source metadata.

### `store_days`

One canonical record per `store_id × business_date`, including acquisition/parser version, source hash, normalized payload hash, quality status, and raw-artifact pointer.

### `machine_day_data`

Normalized machine/day rows required by the current JUGEST runtime. Store and date indexes are mandatory. Large arbitrary source documents are not stored redundantly here.

### `analysis_state`

Versioned incremental state keyed by store + analysis component/version. State updates are transactional and may never incorporate a business date earlier than or equal to the state's already-applied frontier twice.

### `analysis_receipts`

Point-in-time record of analysis version, source hashes, dates consumed, output hash, and completion time. This is used to verify that an incremental result can be reproduced and to prevent future-data leakage.

### `client_snapshots`

Precomputed result blobs/summaries that the iPhone/Vercel UI can read without causing a heavy historical analysis.

### `jobs`

Durable priority queue, idempotency key, size class, estimated memory lease, attempt count, state, heartbeat, timestamps, error class.

### `job_runs`

Per-attempt timing, exit code, peak RSS, CPU time when available, input hash, output hash, and worker version.

### `resource_samples`

Bounded/retained telemetry for host memory pressure, child RSS, queue depth, and scheduler decisions. Retention is finite; this must not grow without limit.

## SQLite pragmas

At initialization:

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
```

Writes are short transactions. Heavy analysis is performed outside the write transaction; only final state/snapshot commit is transactional.

## Incremental analysis contract

Daily operation must be O(latest-day + bounded state update) where the underlying analysis admits an incremental representation.

For store D on business date T:

```text
acquire T
→ validate + normalize T
→ persist store-day T
→ load analysis_state frontier T-1
→ apply only T (and explicitly-expiring rolling-window contributions)
→ compute new precomputed snapshot
→ transactionally commit state frontier T + receipt + snapshot
```

Rolling windows should use add-new / remove-expired state instead of rereading every historical day when semantic parity can be proven.

If an analysis component cannot yet be made incremental without changing semantics, it must stay as a bounded replay job and be scheduled conservatively. No approximate shortcut is allowed merely to fit 2 GiB.

## Historical backfill contract

Initial Tokyo/Kanagawa history may take hours or days. That is acceptable.

Backfill runs store-by-store or bounded date chunks, checkpoints after each successful semantic unit, and returns memory to the OS between units. A restart resumes from the last committed frontier rather than restarting the entire region.

Daily work always outranks backfill.

## API and iPhone contract

The iPhone 17 should not trigger regional historical analysis.

Client reads should primarily return `client_snapshots` and compact current-state data. Any endpoint capable of queueing expensive work is an authenticated admin/internal endpoint and is not exposed to normal client traffic.

The current Vercel UI remains the public frontend during migration. VPS endpoints are added behind HTTPS with explicit authentication and CORS allowlisting. Secrets never ship in the browser bundle.

## Failure behavior

### Worker OOM / memory overrun

- terminate only that child;
- record peak RSS and failure class;
- increase that job class's next lease estimate;
- retry at lower concurrency after backoff;
- never retry in a tight loop.

### VPS memory emergency

- stop new admissions immediately;
- terminate lowest-priority `RESEARCH`, then `BACKFILL` children if required;
- preserve coordinator/API/collector availability;
- resume automatically after memory stays below the pause threshold for a cooldown period.

### Collector failure

Persist failure separately from analysis. Missing acquisition must not silently produce a normal analysis snapshot.

### Corrupt/invalid analysis input

Fail closed, mark the affected store-day/job as invalid, and do not advance the analysis frontier.

## Swap

A small 1–2 GiB swapfile may be configured as emergency insurance, but the scheduler must not count swap as available analysis memory. Sustained swap activity is treated as memory pressure and should reduce concurrency.

Swap is for surviving short spikes, not for making a too-large job appear to fit.

## Security and service layout

Recommended VPS service units:

- `jugest-coordinator.service`
- `jugest-api.service`
- optional collector/import timer/service

The SQLite database and raw artifacts live under a dedicated unprivileged JUGEST user with restrictive permissions. The public API binds behind a reverse proxy/TLS endpoint; coordinator/admin controls bind to localhost or a private authenticated path.

No root-running application process is required.

## Package boundary

Add a dedicated `vps/` package rather than changing the root Vercel runtime package.

Proposed structure:

```text
vps/
  package.json
  src/
    config.mjs
    db.mjs
    schema.mjs
    memory.mjs
    scheduler.mjs
    queue.mjs
    coordinator.mjs
    api.mjs
    child-runner.mjs
    jobs/
      daily-analysis.mjs
      snapshot-refresh.mjs
      backfill.mjs
      research.mjs
  scripts/
    migrate.mjs
    enqueue.mjs
    status.mjs
  systemd/
    jugest-coordinator.service
    jugest-api.service
  tests/
```

A VPS-only SQLite driver may live in `vps/package.json`; root `package.json` remains unchanged unless a later reviewed integration requires otherwise.

## Implementation phases

### Phase 1 — Resource-aware execution substrate

Implement and test:

- VPS package boundary;
- SQLite initialization/migrations;
- durable queue;
- cgroup + `/proc` memory telemetry;
- priority admission;
- memory leases + peak-RSS learning;
- disposable child lifecycle;
- heartbeat/crash recovery;
- synthetic deterministic jobs proving 2 GiB pressure behavior.

No existing JUGEST judgement math is wired yet.

### Phase 2 — Daily data + snapshot plumbing

Add store/day persistence adapters, normalized input contracts, snapshot read API, and one production-equivalent daily-analysis adapter while preserving current semantics.

### Phase 3 — Incremental parity conversion

Convert eligible store-analysis components one by one from historical replay to persistent rolling state. Every conversion requires sequential historical parity tests against the existing implementation before adoption.

### Phase 4 — KAGOYA soak test

Run on an actual 2 GiB KAGOYA VPS with Tokyo/Kanagawa-like queue volume. Record:

- peak host memory;
- minimum effective available memory;
- worker peak RSS distribution;
- queue completion by morning deadline;
- retry/OOM counts;
- API latency under concurrent analysis;
- swap use;
- snapshot parity.

Only after this evidence may the project decide whether 2 GiB is sufficient in real operation or whether 4 GiB is justified.

## Acceptance criteria

Phase 1 is acceptable only if all are true:

1. Root Vercel app and existing regression suite remain unchanged/passing.
2. Scheduler never admits a child whose lease would consume the hard reserve.
3. Priority jobs preempt future admissions ahead of lower-priority queued jobs.
4. Memory pressure pauses admissions and emergency pressure can cancel low-priority children without killing the coordinator.
5. Child exit releases its lease and the next queued job can start automatically.
6. Stale running jobs recover after coordinator restart.
7. Duplicate idempotency keys do not create duplicate semantic jobs.
8. Peak RSS measurements update future estimates deterministically from persisted run history.
9. SQLite crash/restart tests preserve committed queue/state data.
10. Production/main/Vercel deployment is not changed.

The eventual 2 GiB VPS deployment is acceptable only if a KAGOYA soak test demonstrates overnight queue completion with no kernel OOM, no sustained swap dependence, and enough reserved memory to keep API/collector/coordinator responsive.

## Production safety rule

This branch may create implementation and test artifacts, but it does not authorize merge to `main`, Vercel Production changes, DNS changes, or KAGOYA Production deployment. Explicit approval is required immediately before any Production action.
