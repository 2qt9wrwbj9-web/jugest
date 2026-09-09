# JUGEST VPS 2GB Memory-Aware Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 VPS execution substrate that lets a 2 GiB KAGOYA VPS keep JUGEST API/collector capacity reserved while dynamically filling otherwise-idle memory with disposable analysis jobs.

**Architecture:** Keep the existing Vercel JUGEST runtime untouched. Add an isolated `vps/` Node.js package using built-in `node:sqlite`, one lightweight coordinator, a durable priority queue, Linux/cgroup memory telemetry, and short-lived `child_process` workers with persisted memory leases and peak-RSS learning. Phase 1 uses deterministic synthetic jobs only; current judgement math is not wired yet.

**Tech Stack:** Node.js 22.13+ ESM, built-in `node:sqlite`, `node:test`, `child_process`, SQLite WAL, systemd unit templates, GitHub Actions for branch-only verification.

**Spec:** `docs/superpowers/specs/2026-09-09-vps-2gb-memory-aware-backend-design.md`

## Global Constraints

- Baseline remains `main@273ed61ed2019365ae1b38d76288f20e9625c9e1`.
- Work only on `sol/vps-2gb-memory-scheduler`.
- No Production deployment, DNS change, Vercel Production change, or merge to `main`.
- Root `package.json`, current Vercel API behavior, Collector V3 semantics, Device Sync, visible ranking, protected judgement math, Juggler/HANA tables, strict Champion, Calibration, store-share constraint, single-evidence semantics, HANA hard constraints, and parser semantics remain unchanged.
- VPS runtime requires Node.js `>=22.13.0` and uses built-in `node:sqlite`; no PostgreSQL, Redis, Docker, PM2, or message broker.
- 2 GiB defaults: `hardReserveMiB:320`, `emergencyReserveMiB:220`, `cautionUsedRatio:0.70`, `pauseUsedRatio:0.82`, `emergencyUsedRatio:0.88`, `maxAnalysisChildren:3`, `sampleIntervalMs:2000`.
- Scheduler never counts swap as analysis memory.
- TDD: each task begins with a failing test, verified RED in branch CI, then minimal implementation, then GREEN.

---

### Task 1: VPS package boundary, configuration, and memory telemetry

**Files:**
- Create: `vps/package.json`
- Create: `vps/src/config.mjs`
- Create: `vps/src/memory.mjs`
- Create: `vps/tests/memory.test.mjs`
- Create temporarily: `.github/workflows/vps-2gb-tdd.yml`

**Interfaces:**
- Produces: `DEFAULT_RESOURCE_POLICY`, `loadResourcePolicy(overrides)`, `parseMemInfo(text)`, `parseCgroupLimit(text)`, `readMemorySnapshot({readFile})`, and `classifyPressure(snapshot, policy)`.
- `readMemorySnapshot` returns `{hostTotalMiB, hostAvailableMiB, cgroupLimitMiB, cgroupCurrentMiB, effectiveLimitMiB, effectiveAvailableMiB, usedRatio, swapUsedMiB}`.

- [ ] **Step 1: Write failing tests**

Tests must cover finite cgroup limits, `max` cgroup fallback, `effectiveAvailable = min(cgroupRemaining, MemAvailable)`, swap exclusion, and pressure bands.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_RESOURCE_POLICY} from '../src/config.mjs';
import {parseMemInfo,parseCgroupLimit,readMemorySnapshot,classifyPressure} from '../src/memory.mjs';

test('effective memory honors the tighter cgroup remainder',async()=>{
  const files=new Map([
    ['/sys/fs/cgroup/memory.current','629145600\n'],
    ['/sys/fs/cgroup/memory.max','2147483648\n'],
    ['/proc/meminfo','MemTotal: 4096000 kB\nMemAvailable: 3072000 kB\nSwapTotal: 1048576 kB\nSwapFree: 1048576 kB\n']
  ]);
  const snapshot=await readMemorySnapshot({readFile:async path=>files.get(path)});
  assert.equal(snapshot.effectiveLimitMiB,2048);
  assert.equal(snapshot.effectiveAvailableMiB,1448);
  assert.equal(snapshot.swapUsedMiB,0);
});

test('pressure bands pause and emergency correctly',()=>{
  assert.equal(classifyPressure({usedRatio:.81,effectiveAvailableMiB:500},DEFAULT_RESOURCE_POLICY),'CAUTION');
  assert.equal(classifyPressure({usedRatio:.83,effectiveAvailableMiB:500},DEFAULT_RESOURCE_POLICY),'PAUSE');
  assert.equal(classifyPressure({usedRatio:.89,effectiveAvailableMiB:500},DEFAULT_RESOURCE_POLICY),'EMERGENCY');
});
```

- [ ] **Step 2: Push tests + branch workflow and verify RED**

Workflow runs `node --test vps/tests/*.test.mjs` on Node 22. Expected RED because source modules are absent.

- [ ] **Step 3: Implement config and telemetry minimally**

`parseMemInfo` converts kB to MiB. `parseCgroupLimit('max')` returns `null`. `readMemorySnapshot` uses cgroup v2 files when readable and otherwise host memory. `classifyPressure` returns `NORMAL|CAUTION|PAUSE|EMERGENCY`; emergency also triggers when `effectiveAvailableMiB < emergencyReserveMiB`.

- [ ] **Step 4: Verify GREEN and commit**

Run branch workflow and require all Task 1 tests pass.

---

### Task 2: SQLite schema, durable queue, idempotency, and stale-run recovery

**Files:**
- Create: `vps/src/db.mjs`
- Create: `vps/src/schema.mjs`
- Create: `vps/src/queue.mjs`
- Create: `vps/tests/queue.test.mjs`

**Interfaces:**
- `openDatabase(path)` returns a configured `DatabaseSync` with WAL, `synchronous=NORMAL`, foreign keys, and busy timeout.
- `migrate(db)` creates `jobs`, `job_runs`, `resource_samples`, plus Phase-2-ready tables `stores`, `store_days`, `machine_day_data`, `analysis_state`, `analysis_receipts`, `client_snapshots` without wiring judgement logic.
- `enqueueJob(db,{type,priority,idempotencyKey,payload,sizeClass,estimatedLeaseMiB,maxAttempts})` returns the canonical job row and does not duplicate an existing idempotency key.
- `claimNextJob(db,{owner,nowIso})`, `heartbeatJob`, `completeJob`, `failJob`, `cancelJob`, `recoverStaleJobs` implement the state machine.

- [ ] **Step 1: Write failing queue tests**

Cover schema pragmas, priority ordering, FIFO within priority, duplicate idempotency, atomic claim, success, bounded retry, and stale `running` recovery.

```js
const first=enqueueJob(db,{type:'RESEARCH',priority:50,idempotencyKey:'r1',payload:{},sizeClass:'small',estimatedLeaseMiB:128,maxAttempts:3});
const daily=enqueueJob(db,{type:'DAILY_ANALYSIS',priority:20,idempotencyKey:'d1',payload:{},sizeClass:'small',estimatedLeaseMiB:128,maxAttempts:3});
assert.equal(claimNextJob(db,{owner:'c1',nowIso:'2026-09-09T00:00:00.000Z'}).id,daily.id);
assert.equal(enqueueJob(db,{type:'RESEARCH',priority:50,idempotencyKey:'r1',payload:{x:1},sizeClass:'small',estimatedLeaseMiB:128,maxAttempts:3}).id,first.id);
```

- [ ] **Step 2: Verify RED**

Run focused queue test in CI; expected module-not-found/failing interface.

- [ ] **Step 3: Implement schema + queue**

Use short `BEGIN IMMEDIATE` transactions for claim and final state transitions. Store payload as canonical JSON text. `jobs.idempotency_key` is unique. Stale recovery changes `leased/running` to `retry_wait` when attempts remain, otherwise `failed`.

- [ ] **Step 4: Verify GREEN and commit**

Require memory + queue tests pass.

---

### Task 3: Pure memory-aware admission policy and lease learning

**Files:**
- Create: `vps/src/scheduler-policy.mjs`
- Create: `vps/tests/scheduler-policy.test.mjs`

**Interfaces:**
- `estimateLeaseMiB({persistedEwmaMiB,configuredFloorMiB,margin=1.25})`.
- `deriveHeapLimitMiB(leaseMiB)` implements `clamp(floor(lease*0.65),96,768)`.
- `canAdmit({snapshot,policy,runningCount,leaseMiB,priority})` returns `{admit,reason,pressure}`.
- `updateEwmaPeakMiB(previous,peak,alpha=0.30)` returns deterministic EWMA.
- `selectEmergencyVictims(children)` orders running `RESEARCH` before `BACKFILL`, and never chooses daily/API/collector-class work.

- [ ] **Step 1: Write failing policy tests**

Cover hard-reserve protection, pause band, emergency reserve, max child count, CAUTION fit, heap clamp, EWMA, and emergency victim ordering.

```js
assert.deepEqual(canAdmit({snapshot:{usedRatio:.60,effectiveAvailableMiB:700},policy:DEFAULT_RESOURCE_POLICY,runningCount:1,leaseMiB:400,priority:20}),{admit:false,reason:'hard_reserve',pressure:'NORMAL'});
assert.equal(deriveHeapLimitMiB(400),260);
assert.deepEqual(selectEmergencyVictims([{id:1,type:'BACKFILL'},{id:2,type:'DAILY_ANALYSIS'},{id:3,type:'RESEARCH'}]).map(x=>x.id),[3,1]);
```

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement pure policy**

No filesystem, DB, random, or clock dependencies in this module.

- [ ] **Step 4: Verify GREEN and commit**

---

### Task 4: Disposable child runner and coordinator

**Files:**
- Create: `vps/src/child-runner.mjs`
- Create: `vps/src/coordinator.mjs`
- Create: `vps/src/jobs/synthetic.mjs`
- Create: `vps/tests/coordinator.test.mjs`

**Interfaces:**
- `spawnJobChild({job,heapMiB,workerPath,onMessage,onExit})` launches `process.execPath` with `--max-old-space-size=<heapMiB>` and one bounded job descriptor.
- `Coordinator` accepts injected DB, `memoryReader`, `spawnChild`, and clock for deterministic tests.
- `Coordinator.tick()` samples memory, records telemetry, cancels emergency victims, claims/adopts jobs only if memory leases fit, and starts the next eligible job.
- Child messages: `{type:'heartbeat',rssMiB}`, `{type:'complete',peakRssMiB,resultHash}`, `{type:'error',peakRssMiB,errorClass,message}`.

- [ ] **Step 1: Write failing coordinator tests**

Cover: starts two small jobs when leases fit; refuses next job when hard reserve would be consumed; daily job outranks queued research after a child exits; emergency cancels research first; child completion releases lease and next tick starts next job; observed peak RSS updates persisted estimate; failed child retries at lower effective concurrency via raised lease.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement child protocol and coordinator**

Coordinator itself performs no heavy analysis. Synthetic child supports deterministic `sleepMs`, `allocateMiB`, and `resultSeed` solely for Phase 1 verification.

- [ ] **Step 4: Verify GREEN and commit**

---

### Task 5: Operational scripts, systemd templates, restart/persistence integration test

**Files:**
- Create: `vps/src/main.mjs`
- Create: `vps/scripts/migrate.mjs`
- Create: `vps/scripts/enqueue.mjs`
- Create: `vps/scripts/status.mjs`
- Create: `vps/systemd/jugest-coordinator.service`
- Create: `vps/tests/restart-integration.test.mjs`
- Modify: `vps/package.json`

**Interfaces:**
- `npm --prefix vps test` runs all VPS tests.
- `npm --prefix vps run migrate -- --db /path/jugest.sqlite` initializes schema.
- `npm --prefix vps run enqueue -- --db ... --type RESEARCH --key ... --payload '{...}'` queues an admin job.
- `npm --prefix vps run status -- --db ...` prints JSON queue/resource summary.
- Coordinator service uses an unprivileged user, restart-on-failure, and environment file path; no Production secrets are committed.

- [ ] **Step 1: Write failing restart integration test**

Create a temp DB, enqueue jobs, mark one running with an old heartbeat, close DB, reopen, call recovery, and assert committed rows remain plus stale job becomes retryable.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement CLI/service entrypoints**

- [ ] **Step 4: Verify GREEN**

Run all VPS tests on Node 22.

- [ ] **Step 5: Run root Production-preservation regression**

Run `npm test` from repo root plus mandatory current preservation tests. Root runtime files must remain byte/semantic unchanged except documentation/workflow/VPS additions.

- [ ] **Step 6: Commit Task 5**

---

### Task 6: Phase 1 verification report and temporary workflow cleanup

**Files:**
- Create: `docs/vps/PHASE1-2GB-RESOURCE-SCHEDULER-REPORT.md`
- Delete: `.github/workflows/vps-2gb-tdd.yml` after final branch verification evidence is recorded.

**Interfaces:**
- Report records exact branch SHA, Node version, test commands, scheduler defaults, synthetic pressure evidence, root preservation result, and status `research/preview only; not deployed`.

- [ ] **Step 1: Run fresh final CI on the completed implementation**

Require VPS suite and root regression suite both green.

- [ ] **Step 2: Record evidence in report**

No claim that 2 GiB is sufficient for real KAGOYA operation until the later soak test.

- [ ] **Step 3: Remove temporary workflow and verify branch diff**

Confirm `main` remains unchanged and no Production deployment occurred.

- [ ] **Step 4: Final commit**

Phase 1 ends with a reviewable feature branch only.
