# Collector synchronous research preemption design

Date: 2026-09-14
Branch: sol/vps-research-pipeline-phase1-impl
Status: proposed for implementation after review

## Problem

The first Collector-priority hotfix is not sufficient. Push requests write a short-lived Collector activity marker, while the Coordinator notices that marker only on its periodic scheduler tick (`sampleIntervalMs=2000`). A Push can therefore reach canonical SQLite before a running research worker has been preempted. That leaves a race window where `HISTORICAL_COMPARE`, `SHADOW_PREDICT`, `BACKTEST`, `MODEL_SEARCH`, `FEATURE_BUILD`, or other research work can still compete with Collector canonical ingest.

The fix must remove that timing race without weakening the current safety contract: a successful Push acknowledgement must still mean the raw artifact and canonical database write are durable. Protected judgment math, historical walk-forward semantics, scoring, and Collector payload/state semantics must remain unchanged.

## Decision

Use a synchronous parent-process handshake between the VPS web process and its supervised Coordinator process.

Before a Collector Push starts canonical persistence, the web process first writes the existing Collector activity marker, then asks the currently running Coordinator to enter a Collector-priority barrier. The Coordinator immediately blocks new research admission, preempts every running research child, moves those durable jobs back to retryable/deferred state without consuming failure budget, waits until the selected research child processes have exited, and acknowledges the barrier. Only after that acknowledgement may canonical ingest begin.

The activity marker remains a secondary guard and is also what makes the no-Coordinator/restart case safe: if no Coordinator child is alive, there is no research worker to preempt; when the child restarts it observes the active marker before admitting research.

## Scope

### In scope

- Web parent process to Coordinator child IPC request/ack protocol.
- Immediate research-job preemption for Collector Push.
- Waiting for preempted research workers to exit before canonical ingest.
- Durable defer/resume semantics for preempted research jobs.
- Barrier state that blocks scheduler admission while preemption is in progress.
- Bounded timeout/fail-closed behavior when a live Coordinator receives a barrier request but cannot acknowledge it.
- Safe no-Coordinator/restart behavior using the existing activity marker.
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

Each request gets a unique request ID. The supervisor sends a control message to the live Coordinator child and waits for a matching acknowledgement. Multiple simultaneous Push requests coalesce behind the same in-flight barrier rather than issuing duplicate preemptions.

A bounded timeout prevents a live-but-stuck Coordinator from hanging the web request indefinitely. If a live Coordinator accepted the request but cannot establish the barrier, the Push fails closed before canonical ingest begins.

If no Coordinator child is alive at request time, the barrier call succeeds as a no-op only after the activity marker is already durable. This is safe because there is no live research child to stop, and any restarted Coordinator must honor the marker before admitting research.

### 2. Coordinator control message and local barrier state

`main.mjs` listens for a parent IPC message such as:

`{ type: 'collector_barrier_enter', requestId }`

It calls a new explicit method on `CollectorAwareCoordinator` rather than waiting for the normal two-second scheduler tick.

The Coordinator method:

1. Sets an in-process Collector barrier flag synchronously before any await so concurrent scheduler ticks cannot admit new research.
2. Serializes the preemption with the existing Coordinator tick chain so queue/running-map changes remain ordered.
3. Finds currently running research entries only.
4. For each running research entry, marks it cancelled for Collector preemption, persists/defer state as appropriate, and moves the durable job back to `retry_wait` or equivalent without consuming failure budget.
5. Sends `SIGTERM` to the research child.
6. Waits until every selected research child has actually exited or a short bounded stop timeout expires.
7. Returns success only when no selected research worker remains active.

The barrier flag stays active while the external activity marker is active; ordinary `_tick()` still checks the marker before research admission. The explicit barrier is what closes the initial sub-two-second race.

`DAILY_ANALYSIS` is not forcibly preempted by this barrier because it is primary production work rather than research. If evidence later shows Daily Analysis itself is the source of contention, that is a separate design change.

### 3. Web startup wiring

`web-main.mjs` owns both the web server and the supervised Coordinator. It will pass an `enterCollectorBarrier` callback into the Relay/web handler rather than having the Relay code discover or signal processes globally.

The Coordinator runtime must exist before the web server begins accepting requests so the barrier callback has a stable owner. If the child later exits, the supervisor still owns restart state and can report that no live child currently exists.

This keeps the interface explicit and testable: the Relay handler depends only on a callback, not on process IDs, files, or systemd.

### 4. Push request ordering

For Collector Push actions only (`iosCollectorPushV2`, `iosCollectorPushBatchV3`):

1. Read/parse request body.
2. Write/refresh the Collector activity marker.
3. Enter the synchronous Collector barrier through the supervisor and await completion/no-op safety.
4. Refresh the activity marker again after the barrier.
5. Run the existing Relay/Collector transaction.
6. Run the existing canonical ingest hook.
7. Return the existing response.

No successful response is returned before the current raw + canonical durability path completes.

The barrier is only required before a Push path that can write canonical data. Non-Push Relay operations keep their current path.

### 5. Research resume

A Collector-preempted job is not marked failed and does not consume failure attempts. The durable queue retains it for later execution. The activity marker keeps research admission blocked for its TTL while the Push is active. After activity expires, the normal Coordinator scheduler may start the deferred research job again from its existing restartable boundary.

Historical walk-forward remains restartable at one store × one target day. Existing idempotency and cursor checks remain the authority if a worker was terminated mid-step.

## Failure handling

- If no Coordinator child is alive after the activity marker is written, the barrier is a safe no-op; restarted Coordinator work remains blocked by the marker.
- If a live Coordinator receives a barrier request but does not ACK within the bounded timeout, canonical ingest must not begin.
- If a research child ignores `SIGTERM`, the Coordinator may escalate to `SIGKILL` after a short grace period. The durable job must already be returned to retryable state before escalation.
- If canonical ingest later fails, current Push failure/rollback behavior remains unchanged.
- Duplicate or concurrent Collector Push requests share/coalesce the active barrier and must not corrupt queue state.
- The barrier mechanism must not depend on the normal two-second scheduler interval for correctness.

## Tests

Add RED tests first, then implement until GREEN.

Required regressions:

1. **Ordering test**: with a running historical research child, a Push cannot enter canonical persistence until the research child exit ACK is observed.
2. **No polling gap test**: the Push barrier works immediately even when the next scheduler tick is artificially delayed beyond two seconds.
3. **Admission-race test**: once the in-process barrier flag is set, a concurrent scheduler tick cannot start a new research worker.
4. **Durable resume test**: Collector-preempted research returns to retryable/deferred state without increasing failure budget and can be resumed later.
5. **No-Coordinator test**: activity marker is written first; if the Coordinator child is absent/restarting, Push can proceed and a later Coordinator start cannot admit research while the marker is active.
6. **Push durability test**: existing `PushV2 success means raw artifact and canonical DB are durable before acknowledgement` remains unchanged and passing.
7. **Canonical failure test**: existing `canonical persistence failure fails PushV2 and rolls Relay day publication back` remains unchanged and passing.
8. **Daily-analysis preservation test**: Collector barrier does not preempt `DAILY_ANALYSIS`.
9. **Concurrent Push test**: two Pushes arriving together coalesce safely around one active barrier.
10. Full VPS, root regression, Collector, and production-preservation suites remain green.

## Deployment boundary

Implementation occurs only on the research branch. Production deployment still requires a fresh explicit approval after tests and diff review. The repository `main` branch is not touched. Production `deploy/vps` must only move by non-force fast-forward.

## Acceptance criteria

The change is ready for production review only when:

- canonical ingest cannot start while a research worker selected for Collector preemption is still running;
- no two-second scheduler polling gap exists in that ordering;
- no scheduler admission race can create a new research worker after barrier entry;
- the Coordinator restart/no-child case does not create a new Push failure mode;
- Push success durability semantics are unchanged;
- research jobs remain restartable and do not burn failure budget when Collector-preempted;
- protected analysis/judgment semantics remain byte-exact or otherwise proven untouched by preservation tests;
- all required automated suites pass on the exact candidate SHA.
