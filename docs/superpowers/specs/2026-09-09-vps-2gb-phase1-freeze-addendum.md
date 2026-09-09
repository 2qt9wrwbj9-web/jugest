# JUGEST VPS 2GB Phase 1 Freeze Addendum

## Status

This addendum freezes the Phase 1 resource-aware execution substrate implemented on `sol/vps-2gb-memory-scheduler`.

- Production/main baseline: `273ed61ed2019365ae1b38d76288f20e9625c9e1`
- Phase 1 code freeze: `7b743e4d92adfe137a8393b250443fbe74aaf30b`
- Scope: synthetic VPS execution substrate only
- Production authorization: **none**

It supplements `2026-09-09-vps-2gb-memory-aware-backend-design.md` where implementation details were intentionally left open.

## Frozen 2 GiB resource policy

```js
{
  hardReserveMiB: 320,
  emergencyReserveMiB: 220,
  cautionUsedRatio: 0.70,
  pauseUsedRatio: 0.82,
  emergencyUsedRatio: 0.88,
  maxAnalysisChildren: 3,
  sampleIntervalMs: 2000,
  emergencyCooldownMs: 10000
}
```

`emergencyCooldownMs` is fixed at 10 seconds for Phase 1, equivalent to five normal 2-second scheduler samples. The scheduler may resume emergency-deferred work only after memory remains below the pause threshold continuously for this cooldown period. Any return to PAUSE or EMERGENCY resets the cooldown.

## Emergency preemption semantics

Memory emergency is a temporary resource preemption, not a terminal semantic cancellation.

- New admissions stop immediately.
- `RESEARCH` is stopped before `BACKFILL`.
- `DAILY_ANALYSIS` is preserved by the emergency-victim policy.
- Stopped low-priority jobs move to durable `retry_wait` with `memory_emergency` metadata.
- The child process is terminated after the durable defer is committed.
- Once pressure stays below the pause threshold for the cooldown, normal priority admission can run the deferred work again.

The ordinary explicit `cancelled` queue state remains available for actual cancellation; memory pressure does not use it.

## Cross-tick memory lease accounting

A memory lease remains a scheduler commitment for the complete lifetime of a running child. It is not forgotten when the scheduler enters a later tick.

Before each admission loop, Phase 1 conservatively subtracts the **full configured/learned lease of every already-running child** from the fresh Linux/cgroup effective-available snapshot. New jobs admitted during that same tick are then subtracted once as they start.

This is intentionally conservative because the Linux memory snapshot already includes the child's current RSS. Phase 1 therefore may double-reserve part of current RSS, but it cannot exploit not-yet-realized lease headroom to over-admit another child. Protecting the 320 MiB hard reserve outranks utilization in this phase.

A future optimization may reserve only each child's unrealized lease headroom after reading current per-child RSS, but it must prove equivalent reserve safety before replacing this rule.

## Frozen implementation behavior

Phase 1 includes:

- Node.js 22+ VPS package boundary under `vps/`;
- built-in SQLite with WAL, `synchronous=NORMAL`, foreign keys, and busy timeout;
- durable priority queue, idempotency keys, atomic claim, heartbeat, retry, and stale-job recovery;
- cgroup v2 plus `/proc/meminfo` effective-memory telemetry;
- pressure-band admission and emergency preemption;
- RSS lease learning with `max(configuredFloor, EWMA_peakRSS * 1.25)`;
- V8 heap cap `clamp(floor(leaseMiB * 0.65), 96, 768)`;
- disposable `child_process` execution;
- bounded resource telemetry retention;
- CLI migration/enqueue/status tools;
- an unprivileged hardened systemd coordinator template;
- daemon timer behavior that keeps the coordinator alive for continuous operation;
- synthetic deterministic workers used only to verify the substrate.

No current JUGEST judgment engine or protected Production runtime is wired into this Phase 1 worker path.

## Known Phase 1 limitations carried forward

These are not hidden Production claims and must be addressed or explicitly accepted before real semantic workloads are promoted:

1. **Attempt accounting:** emergency preemption starts a new run later and the existing `attempts` field is also used by normal failure limits. Before real long-running workloads, failure-budget accounting should be separated from benign resource-preemption/run sequencing so repeated memory emergencies do not consume semantic failure budget accidentally.
2. **Cooldown restart persistence:** the emergency cooldown latch is coordinator-memory state. A coordinator restart does not preserve how long memory had already remained below the pause threshold. Phase 2/Production hardening should persist or safely reconstruct recovery state if this distinction matters operationally.
3. **Graceful service stop:** stale-job recovery safely handles abandoned leases after coordinator restart, but systemd shutdown does not yet perform a full child drain/defer handshake. A graceful shutdown path is preferred before real analysis workers are adopted.
4. **Conservative lease reservation:** full outstanding leases are subtracted from a host snapshot that already includes current child RSS. This intentionally sacrifices some throughput for reserve safety until per-child RSS headroom accounting is proven.
5. **Real 2 GiB capacity:** CI proves scheduler behavior, not that a real KAGOYA 2 GiB host can finish Tokyo/Kanagawa workloads by the morning deadline. That requires the planned soak test.

## Safety boundary

This freeze does not authorize:

- merge to `main`;
- Vercel Production changes;
- DNS changes;
- KAGOYA Production deployment;
- wiring protected JUGEST judgment semantics into the VPS backend.

Explicit approval is still required immediately before any Production action.
