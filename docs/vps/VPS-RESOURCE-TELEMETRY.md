# VPS Resource Telemetry

JUGEST VPS resource telemetry is an observation-only diagnostic surface. It must not alter judgment, ranking, prediction, Collector scheduling, canonical ingest semantics, or analysis admission behavior.

## Metrics

`GET /api/vps/system/resources` is receiver-authenticated with the existing browser receiver credentials.

The response reports host/effective memory, load average, CPU count, the web Node process memory, analysis queue/history from the existing durable scheduler tables, and lightweight in-process canonical ingest history.

Process metrics use `process.memoryUsage()`:

- `rssBytes`: resident set size of the reporting Node process.
- `heapUsedBytes` / `heapTotalBytes`: V8 heap use and capacity.
- `externalBytes` / `arrayBuffersBytes`: memory outside the V8 heap accounted by Node.

Analysis peak RSS is sourced from the existing analysis child heartbeat/job-run evidence. Parent process RSS is not labeled as analysis memory.

## Interpretation

A start/end memory delta is not exact memory consumed by an operation. Garbage collection, allocator reuse, other requests, and native allocations can move the number in either direction. Treat deltas as observations only.

`observedPeakRssBytes` is the sampled peak reported by the analysis child and can miss a peak between samples. The current daily-analysis worker samples on its existing heartbeat cadence.

Canonical ingest records start/end RSS and heap plus duration. It does not add a high-frequency sampling timer because ingest is normally short-lived and telemetry overhead should remain negligible.

## Retention

Analysis/job telemetry reuses existing SQLite tables and their current retention behavior. Ingest telemetry is an in-memory ring of the latest 50 operations and is intentionally lost when the web process restarts.

## UI

Settings contains a `VPSリソース` diagnostic entry. The panel loads once when opened and refreshes only when the user taps `更新`; there is no 1-second polling.

## Failure behavior

Telemetry is best-effort. Resource endpoint failure returns a diagnostic error and must not make Collector, canonical ingest, analysis, or ordinary browser APIs fail. No automatic throttling or analysis shutdown is introduced by this feature.
