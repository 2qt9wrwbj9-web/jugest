# VPS Resource Telemetry

JUGEST VPS resource telemetry is an observation-only diagnostic surface. Telemetry collection must not alter judgment, ranking, prediction, Collector scheduling, canonical ingest semantics, or the result of analysis work. The separate research Scheduler policy may decide whether a research job is admitted; telemetry only records what happened.

## Metrics

`GET /api/vps/system/resources` is receiver-authenticated with the existing browser receiver credentials.

The response reports host/effective memory, load average, CPU count, the web Node process memory, analysis queue/history from durable scheduler tables, per-store task history, and lightweight in-process canonical ingest history.

Process metrics use `process.memoryUsage()`:

- `rssBytes`: resident set size of the reporting Node process.
- `heapUsedBytes` / `heapTotalBytes`: V8 heap use and capacity.
- `externalBytes` / `arrayBuffersBytes`: memory outside the V8 heap accounted by Node.

The web process RSS is not labeled as analysis memory. Heavy analysis and research tasks run in child processes.

## Two durable execution records

`job_runs` remains the Scheduler-level execution record. It answers questions such as which queued job ran, when it started/ended, whether it failed, and the peak RSS reported to the Scheduler.

`analysis_task_metrics` is the per-store workload record used by the self-improving research pipeline. One row represents one store and one heavy task. It records:

- phase and task kind (`daily_analysis`, `feature_build`, later `axis_discovery`, `backtest`, `model_search`)
- store ID and machine-count scale bucket
- day count, machine-day row count, and workload units
- start/end time and duration
- start/end RSS and process peak RSS
- CPU time
- success/failure/cancellation and error class
- task/model version metadata

The resource API exposes only a bounded recent `taskHistory`, even though the underlying rows are durable SQLite evidence.

## Peak RSS interpretation

For Phase 1 analysis/research children, the stored task peak is the maximum available observation from:

1. `process.resourceUsage().maxRSS`
2. heartbeat-observed RSS
3. ending `process.memoryUsage().rss`

This is a process high-water mark, not "RAM exclusively consumed by this calculation". Shared pages, allocator reuse, native allocations, garbage collection, and runtime overhead are included. Start/end deltas are likewise observations, not exact consumed memory.

The existing `job_runs.peak_rss_mib` is preserved for Scheduler compatibility. `analysis_task_metrics.peak_rss_mib` adds the store/workload context needed to compare, for example, a 100-machine store with a 300-machine store.

## Canonical ingest

Canonical ingest records start/end RSS and heap plus duration. It does not add a high-frequency sampling timer because ingest is normally short-lived and telemetry overhead should remain negligible.

## Retention

- `job_runs`: existing durable Scheduler behavior is unchanged.
- `analysis_task_metrics`: durable SQLite task evidence; the API/UI returns only a bounded recent slice.
- `resource_samples`: existing bounded Scheduler samples.
- canonical ingest telemetry: an in-memory ring of the latest 50 operations and intentionally lost when the web process restarts.

## UI

Settings contains a `VPSリソース` diagnostic entry. The panel loads once when opened and refreshes only when the user taps `更新`; there is no high-frequency UI polling.

The `処理実績` card shows recent one-store task records including store size, days, machine-day rows, Peak RAM, CPU time, duration, and result. This is intended to build empirical evidence for later safe Scheduler parallelism decisions.

## Failure behavior

Telemetry is best-effort. A resource endpoint failure returns a diagnostic error and must not make Collector, canonical ingest, analysis, or ordinary browser APIs fail. Failure to persist an optional per-task metric is logged but must not turn a successful business analysis into a failed analysis job.
