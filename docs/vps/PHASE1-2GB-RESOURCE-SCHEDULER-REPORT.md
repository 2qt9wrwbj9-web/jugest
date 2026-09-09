# JUGEST VPS 2GB Phase 1 Resource Scheduler Report

## Result

**Phase 1 resource-aware execution substrate: PASS for the research/Preview branch scope.**

This result means the scheduler substrate satisfies the frozen synthetic safety contracts in CI while the existing JUGEST Production runtime remains preserved. It does **not** prove that a real 2 GiB KAGOYA VPS has enough capacity for Tokyo/Kanagawa production workloads.

- Production/main baseline: `273ed61ed2019365ae1b38d76288f20e9625c9e1`
- Phase 1 code freeze: `7b743e4d92adfe137a8393b250443fbe74aaf30b`
- Feature branch: `sol/vps-2gb-memory-scheduler`
- Final code verification workflow run: `34305561771`
- Final code verification job: `102321410461`
- CI Node.js: `v22.23.2`
- Production deploy performed: **no**
- main merge performed: **no**

## Frozen scheduler defaults

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

Lease and heap rules:

```text
estimatedLease = max(configuredFloor, EWMA_peakRSS * 1.25)
heapMiB = clamp(floor(leaseMiB * 0.65), 96, 768)
```

Existing running children retain full scheduler lease commitments across later ticks. Phase 1 deliberately uses conservative full-lease reservation rather than inferring free capacity from a momentary low child RSS.

## Verification commands

The final code verification workflow ran the following required checks:

```bash
npm test
npm --prefix vps test
node tests/collector-preservation.mjs
node --test tests/production-preservation.mjs
```

The root regression command reported `64/64 commands passed` before the VPS suite. The VPS suite passed completely after the final cross-tick lease fix. Mandatory Production-preservation checks also completed successfully in the same workflow run.

## Phase 1 safety evidence

### Memory admission and reserve protection

Verified behavior:

- multiple small children are admitted when their leases fit;
- the 320 MiB hard reserve blocks an additional child when its lease would consume the reserve;
- same-tick projections subtract every newly admitted lease;
- **cross-tick projections also preserve the full leases of already-running children**, preventing apparent free memory from being reused while an existing child still has unrealized lease headroom;
- `maxAnalysisChildren: 3` remains an independent hard ceiling;
- PAUSE and EMERGENCY pressure bands reject new admissions.

The cross-tick invariant was added after final self-review found that a fresh host memory sample could otherwise forget prior lease commitments. The new test first failed with three children started where only two were safe, then passed after the coordinator began carrying outstanding leases into each admission projection.

### Priority behavior

Verified behavior:

- queue order is priority first and FIFO within equal priority;
- daily work can take the next released slot ahead of queued research;
- emergency victim selection stops `RESEARCH` before `BACKFILL`;
- `DAILY_ANALYSIS` is not selected as an emergency victim by that low-priority preemption policy.

### Emergency recovery

Verified behavior:

- emergency-stopped low-priority work is durably moved to `retry_wait`, not terminally cancelled;
- the job records `memory_emergency` metadata;
- the disposable child is terminated after the durable defer is recorded;
- admissions remain blocked during emergency;
- deferred work resumes only after memory stays below the pause threshold continuously for the frozen 10-second cooldown;
- re-entry into PAUSE/EMERGENCY resets the recovery window.

### Durable queue and restart recovery

Verified behavior:

- SQLite initializes in WAL mode with required pragmas;
- idempotency keys return the canonical existing job instead of duplicating semantic work;
- claims are atomic across database connections;
- leased jobs transition through running/heartbeat/completion;
- ordinary failures use durable retry state and bounded attempts;
- stale leased/running jobs recover after database close/reopen and coordinator startup;
- committed queue/state data survives process restart.

### Memory learning and process isolation

Verified behavior:

- actual worker peak RSS updates persisted job-type/size-class EWMA estimates;
- the next lease deterministically grows from observed RSS with the 25% margin;
- a child-reported error still records the peak and leaves durable retry state;
- the real synthetic worker runs as a separate disposable child process and emits bounded heartbeat/completion messages;
- each child receives a derived V8 old-space cap below its RSS lease.

### Operational substrate

Verified behavior:

- migration, enqueue, and status CLIs operate on the same durable SQLite file;
- coordinator timer remains referenced, so the service does not exit merely because no job is currently running;
- the systemd template runs as unprivileged `jugest` user/group and includes basic filesystem/process hardening;
- resource samples have bounded retention rather than unbounded growth.

## Existing JUGEST preservation

The feature branch remains based directly on Production/main baseline `273ed61ed2019365ae1b38d76288f20e9625c9e1`.

At the Phase 1 code freeze, the branch was ahead of that baseline and not behind. The implementation diff was isolated to:

- `vps/**`;
- Phase 1 design/plan documentation;
- the temporary Phase 1 GitHub Actions verification workflow.

No existing root JUGEST runtime source, protected judgment math, Juggler/HANA tables, parser semantics, Device Sync crypto/merge logic, Collector V3 behavior, visible rankings, or Production deployment files were modified by the Phase 1 implementation.

Mandatory preservation checks passed in workflow run `34305561771`.

## Known limitations before real workload adoption

Phase 1 is deliberately a synthetic substrate. The following remain open before real JUGEST semantic workers should be treated as Production-ready:

1. **Failure budget vs resource preemption.** The current launch `attempts` sequence is shared with ordinary max-attempt failure handling. Repeated benign memory preemptions should eventually be separated from actual semantic failure budget.
2. **Emergency cooldown across coordinator restart.** The stable-below-pause timer is in memory; a process restart loses elapsed cooldown history. Production hardening should persist or safely reconstruct this state if needed.
3. **Graceful shutdown.** Restart recovery is durable, but service stop does not yet perform a complete child drain/defer handshake.
4. **Conservative utilization.** Cross-tick safety subtracts full outstanding leases even though the Linux snapshot already includes current child RSS. This can underutilize RAM. A future per-child RSS/headroom optimization must retain the same reserve invariant.
5. **No real analysis adapter yet.** The worker path is synthetic and does not run protected JUGEST judgment/store-analysis logic.
6. **Node built-in SQLite maturity.** CI on Node 22.23.2 reports Node's SQLite API as experimental. The current Phase 1 tests pass, but deployment/runtime version pinning and upgrade policy should be reviewed before long-term Production adoption.

## KAGOYA 2 GiB readiness

**Not yet proven.**

CI establishes scheduler correctness for the tested contracts, not real capacity. A KAGOYA 2 GiB soak test remains required before deciding whether 2 GiB is sufficient.

The soak must measure at least:

- host peak memory and minimum effective available memory;
- per-worker peak RSS distribution;
- queue completion before the morning deadline;
- OOM/retry/preemption counts;
- coordinator/API/collector responsiveness during analysis;
- swap use and whether swap becomes sustained;
- parity of any future real analysis snapshots against the existing implementation.

If the actual workload cannot complete reliably while preserving the reserve and avoiding sustained swap, moving to 4 GiB is preferable to weakening the scheduler safety rules.

## Production decision

Phase 1 is ready to remain as the **feature-branch foundation for Phase 2 plumbing and later KAGOYA soak testing**.

It is **not authorized for Production**, and this report does not request or imply:

- merge to `main`;
- Vercel Production deployment;
- KAGOYA Production deployment;
- DNS migration;
- activation of the VPS backend for current users.

Any such action still requires explicit approval immediately beforehand.
