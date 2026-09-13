# Collector synchronous research preemption design

Date: 2026-09-14
Branch: sol/vps-research-pipeline-phase1-impl
Status: proposed for implementation after review

## Problem

The first Collector-priority hotfix is not sufficient. Push requests write a short-lived Collector activity marker, while the Coordinator notices that marker only on its periodic scheduler tick (`sampleIntervalMs=2000`). A Push can therefore reach canonical SQLite before a running research worker has been preempted. That leaves a race window where `HISTORICAL_COMPARE`, `SHADOW_PREDICT`, `BACKTEST`, `MODEL_SEARCH`, `FEATURE_BUILD`, or other research work can still compete with Collector canonical ingest.

The fix must remove that timing race without weakening the current safety contract: a successful Push acknowledgement must still mean the raw artifact and canonical database write are durable. Protected judgment math, historical walk-forward semantics, scoring, and Collector payload/state semantics must remain unchanged.

## Decision

Use a synchronous parent-process handshake between the VPS web process and its supervised Coordinator process.

Before a Collector Push starts canonical persistence, the web process asks the Coordinator to enter a Collector-priority barrier. The Coordinator immediately preempts every running research child, moves those durable jobs back to retryable/deferred state without consuming failure budget, waits until the selected research child processes have exited, and acknowledges the barrier. Only after that acknowledgement may canonical ingest begin.

The existing activity marker remains as a secondary guard that prevents research from restarting while the Push is still active, but it is no longer relied on to close the initial race window.

## Scope

### In scope

- Web parent process to Coordinator child IPC request/ack protocol.
- Immediate research-job preemption for Collector Push.
- Waiting for preempted research workers to exit before canonical ingest.
- Durable defer/resume semantics for preempted research jobs.
- Timeout/fail-closed behavior if the Coordinator cannot establish the barrier.
- Regression tests proving ordering and preserved Push durability.

### Out of scope

- Changes to Juggler/HANA judgment math.
- Changes to PRE scoring or model selection semantics.
- Changes to historical walk-forward chronology or outcome scoring.
- Changes to Collector authentication, payload format, revision semantics, or raw/canonical durability contract.
- Global SQLite write locking across all processes.
- Increasing `busy_timeout` as the primary fix.

## Architecture

### 1. Coordinator supervisor becomes bidirectional

`coordinator-supervisor.mjs` already owns the child process handle. Extend the spawned Coordinator process with an IPC channel (`stdio` includes `ipc`) and expose a method such as `enterCollectorBarrier()` to the web process.

Each request gets a unique request ID. The supervisor sends a control message to the Coordinator child and waits for a matching acknowledgement. Multiple simultaneous Push requests coalesce behind the same in-flight barrier rather than issuing duplicate preemptions.

A bounded timeout prevents the web request from hanging indefinitely. If the barrier cannot be established, the Push fails closed before canonical ingest begins.

### 2. Coordinator control message

`main.mjs` listens for a parent IPC message such as:

`{ type: 'collector_barrier_enter', requestId }`

It calls a new explicit Coordinator method rather than waiting for the normal two-second scheduler tick.

The Coordinator method:

1. Marks Collector activity immediately so no new research work is admitted.
2. Finds currently running research entries only.
3. For each running research entry, marks it cancelled for Collector preemption, persists a cancelled/deferred task metric if applicable, and moves the durable job back to `retry_wait` or equivalent immediately-retryable state without consuming failure budget.
4. Sends `SIGTERM` to the research child.
5. Waits until every selected research child has actually exited or a short bounded stop timeout expires.
6. Returns success only when no selected research worker remains active.

`DAILY_ANALYSIS` is not forcibly preempted by this barrier because it is primary production work rather than research. If evidence later shows Daily Analysis itself is the source of contention, that is a separate design change.

### 3. Push request ordering

For Collector Push actions only (`iosCollectorPushV2`, `iosCollectorPushBatchV3`):

1. Read/parse request body.
2. Enter Collector barrier through the supervisor and await ACK.
3. Refresh the existing Collector activity TTL.
4. Run the existing Relay/Collector transaction.
5. Run the existing canonical ingest hook.
6. Return the existing response.

No successful response is returned before the current raw + canonical durability path completes.

The barrier is only required before a Push path that can write canonical data. Non-Push Relay operations keep their current path.

### 4. Research resume

A Collector-preempted job is not marked failed and does not consume failure attempts. The durable queue retains it for later execution. The existing activity marker keeps research admission blocked for its TTL while the Push is active. After activity expires, the normal Coordinator scheduler may start the deferred research job again from its existing restartable boundary.

Historical walk-forward remains restartable at one store × one target day. Existing idempotency and cursor checks remain the authority if a worker was terminated mid-step.

## Failure handling

- If the Coordinator child is missing or restarting, `enterCollectorBarrier()` waits only within the configured barrier timeout and then fails closed.
- If a research child ignores `SIGTERM`, the Coordinator may escalate to `SIGKILL` after a short grace period. The durable job must already be returned to retryable state before escalation.
- If the barrier times out, canonical ingest must not begin.
- If canonical ingest later fails, current Push failure/rollback behavior remains unchanged.
- Duplicate or concurrent Collector Push requests share/coalesce the active barrier and must not corrupt queue state.

## Tests

Add RED tests first, then implement until GREEN.

Required regressions:

1. **Ordering test**: with a running historical research child, a Push cannot enter canonical persistence until the research child exit ACK is observed.
2. **No polling gap test**: the Push barrier works immediately even when the next scheduler tick is artificially delayed beyond two seconds.
3. **Durable resume test**: Collector-preempted research returns to retryable/deferred state without increasing failure budget and can be resumed later.
4. **Push durability test**: existing `PushV2 success means raw artifact and canonical DB are durable before acknowledgement` remains unchanged and passing.
5. **Canonical failure test**: existing `canonical persistence failure fails PushV2 and rolls Relay day publication back` remains unchanged and passing.
6. **Daily-analysis preservation test**: Collector barrier does not preempt `DAILY_ANALYSIS`.
7. **Concurrent Push test**: two Pushes arriving together coalesce safely around one active barrier.
8. Full VPS, root regression, Collector, and production-preservation suites remain green.

## Deployment boundary

Implementation occurs only on the research branch. Production deployment still requires a fresh explicit approval after tests and diff review. `main` is not touched. Production `deploy/vps` must only move by non-force fast-forward.

## Acceptance criteria

The change is ready for production review only when:

- canonical ingest cannot start while a research worker selected for Collector preemption is still running;
- no two-second scheduler polling gap exists in that ordering;
- Push success durability semantics are unchanged;
- research jobs remain restartable and do not burn failure budget when Collector-preempted;
- protected analysis/judgment semantics remain byte-exact or otherwise proven untouched by preservation tests;
- all required automated suites pass on the exact candidate SHA.
