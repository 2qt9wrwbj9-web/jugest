# Collector Synchronous Research Preemption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the Collector Push vs. background-research race by synchronously preempting research workers before canonical ingest begins, while preserving Push durability semantics and all protected analysis behavior.

**Architecture:** The web process writes the existing Collector activity marker first, then calls a new supervisor-owned `enterCollectorBarrier()` method. The supervisor sends an IPC request to the live Coordinator child, the Coordinator immediately blocks new research admission and defers/terminates running research children, and it ACKs only after those children have exited; only then may Relay/canonical persistence proceed. If no Coordinator child is alive, the barrier is a safe no-op because the activity marker is already durable and prevents research admission when the child restarts.

**Tech Stack:** Node.js 22+, `node:child_process` IPC, `node:sqlite`, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-14-collector-synchronous-research-preemption-design.md`

## Global Constraints

- Do not change Juggler/HANA judgment math, PRE scoring/model semantics, historical walk-forward chronology, Collector payload/auth/revision semantics, or raw/canonical durability contract.
- `DAILY_ANALYSIS` must not be forcibly preempted by the Collector barrier.
- A successful Push ACK must still imply the current raw artifact and canonical DB write are durable.
- Collector-preempted research must return to retryable/deferred state without burning failure budget.
- Production deployment is out of scope for this implementation pass; only the research branch may be modified.

---

### Task 1: RED tests for explicit Collector barrier behavior

**Files:**
- Modify: `vps/tests/collector-aware-coordinator.test.mjs`
- Modify/Create as needed: `vps/tests/coordinator-supervisor.test.mjs`
- Modify/Create as needed: `vps/tests/relay-handler.test.mjs`

**Interfaces:**
- Consumes: current `CollectorAwareCoordinator`, `startCoordinatorProcess`, `createVpsRelayHandler`.
- Produces test expectations for `CollectorAwareCoordinator.enterCollectorBarrier()`, supervisor `enterCollectorBarrier()`, and relay `enterCollectorBarrier` callback ordering.

- [ ] **Step 1: Write failing coordinator tests** proving: research children are deferred and signaled immediately; ACK waits for selected child exit; `DAILY_ANALYSIS` is untouched; setting the barrier blocks concurrent research admission even if the periodic tick is delayed.
- [ ] **Step 2: Run the focused coordinator test file** and verify only the new barrier assertions fail.
- [ ] **Step 3: Write failing supervisor tests** proving: IPC request/ACK correlation, bounded timeout, no-child safe no-op, and concurrent calls coalesce behind one in-flight request.
- [ ] **Step 4: Run the focused supervisor tests** and verify RED.
- [ ] **Step 5: Write failing relay ordering tests** proving the activity marker happens before the barrier call and canonical persistence cannot begin until the barrier promise resolves.
- [ ] **Step 6: Run the focused relay tests** and verify RED.

### Task 2: Implement Coordinator-side synchronous barrier

**Files:**
- Modify: `vps/src/collector-aware-coordinator.mjs`
- Modify: `vps/src/main.mjs`

**Interfaces:**
- Produces: `CollectorAwareCoordinator.enterCollectorBarrier({stopTimeoutMs?}={}) -> Promise<{collectorActive:true,cancelled:Array}>`.
- Produces IPC contract: parent message `{type:'collector_barrier_enter',requestId}` and child reply `{type:'collector_barrier_ack',requestId,ok:true}` or `{type:'collector_barrier_ack',requestId,ok:false,error}`.

- [ ] **Step 1: Add an in-process barrier flag** set synchronously before any await and checked by `_tick()` so research cannot be admitted during barrier entry.
- [ ] **Step 2: Refactor Collector research cancellation** so deferred queue state is committed before sending `SIGTERM`, while preserving existing `collector_activity` retry semantics and failure budget.
- [ ] **Step 3: Track selected child exit completion** and make `enterCollectorBarrier()` await all selected exits, escalating to `SIGKILL` only after a bounded grace interval.
- [ ] **Step 4: Add IPC handling in `main.mjs`** that serializes requests through `enterCollectorBarrier()` and sends correlated ACKs.
- [ ] **Step 5: Run focused coordinator tests** and reach GREEN.

### Task 3: Implement supervisor IPC handshake

**Files:**
- Modify: `vps/src/coordinator-supervisor.mjs`

**Interfaces:**
- Produces runtime method: `enterCollectorBarrier() -> Promise<{ok:true,noCoordinator?:boolean}>`.
- Uses child process IPC channel via `stdio:['ignore','inherit','inherit','ipc']`.

- [ ] **Step 1: Spawn Coordinator with IPC enabled** while preserving existing stdout/stderr inheritance and restart behavior.
- [ ] **Step 2: Add request ID generation and pending-ACK tracking** for `collector_barrier_enter` messages.
- [ ] **Step 3: Coalesce concurrent `enterCollectorBarrier()` calls** behind one in-flight promise.
- [ ] **Step 4: Return safe no-op if no child is alive**; if a live child accepts a request but does not ACK before timeout, reject fail-closed.
- [ ] **Step 5: Clear/reject pending state safely on child exit/stop** and keep normal restart supervision unchanged.
- [ ] **Step 6: Run focused supervisor tests** and reach GREEN.

### Task 4: Wire barrier into Push ordering

**Files:**
- Modify: `vps/src/relay-handler.mjs`
- Modify: `vps/src/web-server.mjs`
- Modify: `vps/src/web-main.mjs`

**Interfaces:**
- `createVpsRelayHandler({dbPath,canonicalDbPath,rawRoot,enterCollectorBarrier})` where the callback defaults to an async no-op for existing isolated tests/non-supervised contexts.
- `createWebServer/createWebHandler` receive/pass the same callback.

- [ ] **Step 1: Wire Coordinator runtime before accepting web requests** so `web-main.mjs` can pass `coordinatorRuntime.enterCollectorBarrier` into the web handler.
- [ ] **Step 2: For Push actions only**, order request handling as: read body → durable activity marker → await barrier → refresh marker → existing Relay runtime → existing canonical hook → response.
- [ ] **Step 3: Leave non-Push Relay operations unchanged** and do not alter canonical rollback/durability behavior.
- [ ] **Step 4: Run relay/web focused tests** and reach GREEN.

### Task 5: Preserve durability and full regression behavior

**Files:**
- Existing tests only unless a regression assertion is missing.

**Interfaces:**
- Existing Push durability and canonical failure contracts remain unchanged.

- [ ] **Step 1: Run existing Collector durability tests** including “PushV2 success means raw artifact and canonical DB are durable before acknowledgement”.
- [ ] **Step 2: Run existing canonical failure/rollback tests** and verify Push still fails if canonical persistence fails.
- [ ] **Step 3: Run full VPS suite** with zero failures.
- [ ] **Step 4: Run root regression suite** with zero failures.
- [ ] **Step 5: Run Collector suite** with zero failures.
- [ ] **Step 6: Run production-preservation suite** and verify protected math/research surfaces remain preserved.
- [ ] **Step 7: Review production diff from `deploy/vps` to exact candidate SHA** and confirm only intended synchronization/tests/docs changed.
- [ ] **Step 8: Stop at the production boundary** and ask for fresh explicit deployment approval.
