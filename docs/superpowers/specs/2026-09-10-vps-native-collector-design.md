# JUGEST VPS Native Collector Design

## Status

Approved in-chat architecture for the first VPS-native collection implementation.

- Base branch: `deploy/vps`
- Feature branch: `sol/vps-native-collector`
- Production authorization: **none**
- `main`: **must remain untouched**
- `deploy/vps`: **must remain untouched during implementation and verification**
- Scope: VPS-side acquisition and durable storage only
- Out of scope: JUGEST UI integration, protected judgement math, prediction/ranking changes, automatic promotion to production

## Goal

Move the upstream data-acquisition responsibility from the iPhone/Launcher path to the VPS while preserving the current normalized JUGEST data contract and keeping collection independent from protected analysis logic.

Target steady-state path:

```text
ana-slo
  -> VPS native collector
  -> raw HTML archive
  -> existing-compatible parser
  -> canonical SQLite store/day data
  -> later analysis stages
```

The collector must be durable, restart-safe, idempotent, conservative about source access, and able to operate continuously without requiring daily user actions.

## Scope of this implementation

Implement now:

- multi-store-capable VPS collector architecture;
- canary operation with one enabled store at first;
- store registration / enable / disable / list CLI;
- durable per-store/per-date acquisition state;
- daily scheduling beginning at 04:00 JST;
- newest-uncollected-date-first ordering;
- 10–30 second randomized delay between source requests;
- separate retry policy for ordinary failures and HTTP 403/429;
- automatic `excluded` classification for durable 404/410 cases only;
- raw HTML archival for successful acquisitions;
- parser extraction/reuse from the existing acquisition implementation without changing judgement math;
- canonical persistence to existing VPS SQLite store/day tables;
- manual CLI collection trigger using the same collector path;
- systemd oneshot + timer installation files, but do not enable them automatically during development;
- tests for all collector state transitions and safety rules.

Explicitly not implemented in this phase:

- new JUGEST UI;
- the future in-app manual-start button;
- production deployment;
- direct changes to existing judgement math, strict Champion, Calibration, store-share constraints, Juggler/HANA probability tables, HANA hard constraints, single-evidence engine, ranking, or prediction semantics;
- destructive migration of existing browser/Vercel acquisition data;
- automatic re-acquisition of already collected days.

## Existing code to reuse

The current `ana-single-day.js` and `ana-launcher.js` already contain source-compatible parsing behavior, machine aliases, deduplication, row validation, quality warnings, and source URL generation.

The VPS already contains:

- SQLite initialization with WAL / foreign keys;
- `stores`;
- `store_days`;
- `machine_day_data`;
- a resource-aware analysis coordinator that remains separate from acquisition.

This implementation should reuse parser semantics but isolate browser-only dependencies such as `document`, `location`, `localStorage`, IndexedDB, wake lock, cookies, and UI rendering.

## Store configuration

Each source store is represented by a durable collector-store record.

Required fields:

```text
store_id        stable internal/source id, normally the ana-slo slug
name            human-readable store name
slug            ana-slo URL slug
enabled         whether automatic collection may schedule this store
history_start   earliest business date allowed for this store
created_at
updated_at
```

For a newly added store, default `history_start` is approximately 13 months before the current JST date, matching the current long-history collection policy unless explicitly supplied.

CLI operations:

```text
add
list
enable
disable
status
collect-now
reset-day
```

`reset-day` is the only supported way in this phase to move an already collected day back to `pending` for source re-acquisition.

## Day state model

Every `store × business_date` acquisition target has exactly one collector state:

```text
pending      未取得
running      取得中
collected    取得済
excluded     対象外
```

Operational error metadata is stored separately from this state.

### State transitions

Normal success:

```text
pending -> running -> collected
```

Ordinary failure:

```text
pending -> running -> pending
```

The row remains pending with `retry_after` set 45 minutes into the future.

Durable no-page condition:

```text
pending -> running -> pending -> ... -> excluded
```

`excluded` may be assigned automatically only when all of the following are true:

1. the source response is HTTP 404 or 410;
2. the same day has accumulated at least 3 such failures;
3. at least 24 hours have elapsed since the first observed 404/410.

Other error classes never auto-transition to `excluded`.

Manual reset:

```text
collected -> pending
excluded  -> pending
```

The collector must not automatically re-fetch `collected` days.

## Restart and crash recovery

`running` is a temporary lease-like state, not permanent truth.

Each running row records:

```text
run_owner
started_at
lease_expires_at
```

At the beginning of a collector run, expired `running` rows are returned to `pending` without deleting any previously stored successful canonical data or HTML artifacts.

Only one source request may be active globally at a time in this phase.

## Daily target creation

Source data for the current JST date must never be automatically collected.

At and after **04:00 JST**, the collector ensures that yesterday exists as a `pending` target for every enabled store unless it is already `collected` or `excluded`.

For initial backfill, target rows are created from each store's configured `history_start` through yesterday.

Scheduling priority is strictly:

```text
newest eligible pending date first
```

across enabled stores.

A row is eligible when:

- state is `pending`;
- store is enabled;
- business date is not today/future in JST;
- `retry_after` is absent or elapsed;
- no global block cooldown is active.

## Source access policy

### Normal pacing

- global concurrency: 1 source request;
- after each attempted source request, wait a random **10–30 seconds** before the next source request;
- delay is randomized per request and testable through an injected random source / clock.

### Ordinary failure

For network failures, timeouts, source 5xx, parser failures, quality validation failures, filesystem archive failures, or SQLite commit failures:

- affected day returns to `pending`;
- set `retry_after = now + 45 minutes`;
- continue with other eligible dates once the normal inter-request delay has elapsed.

### HTTP 403 / 429

Treat 403 and 429 as source-wide pressure signals.

On either status:

- affected day returns to `pending`;
- persist a **global collector cooldown** until `now + 45 minutes`;
- stop source acquisition for all stores and dates until the cooldown expires;
- do not mark the day excluded.

The next invocation may perform local DB housekeeping while blocked but must not contact ana-slo before the cooldown expires.

## Fetch contract

For each target date/store:

```text
https://ana-slo.com/YYYY-MM-DD-<slug>-data/
```

The fetcher must:

- use a normal bounded timeout;
- follow redirects;
- return final URL, status, headers needed for diagnostics, and raw HTML;
- avoid logging or persisting cookies/authorization material if any are later introduced;
- expose an injected transport in tests so no test requires live ana-slo access.

No browser DOM runtime is required by the collector.

## Parser design

Create a server-safe parser module extracted from the existing `ana-single-day.js` behavior.

The parser must preserve current acquisition semantics for:

- target Juggler/HANA machine aliases;
- machine-name normalization;
- required table columns;
- numeric normalization;
- table selection preference;
- duplicate physical table-number handling;
- conflicting machine/table-number rejection;
- missing difference values;
- quality score / grade / warnings;
- machine category and machine key output shape.

The parser module accepts pure inputs:

```js
parseAnaSloHtml({ html, date, sourceUrl, expectedMedian })
```

and must not reference browser globals.

This work must not modify judgement probability tables or protected analysis logic.

## Successful acquisition transaction

A day is considered successfully collected only after all of the following complete:

1. source HTTP response is successful;
2. HTML body passes basic sanity checks;
3. parser completes;
4. parser returns an acceptable normalized day with at least one supported machine row;
5. parser quality is not rejected by the collection acceptance rule;
6. raw HTML is written durably to the archive path;
7. the normalized store/day and complete machine row set are persisted transactionally to SQLite;
8. collector metadata is updated;
9. collector day state becomes `collected` in the same semantic commit boundary as canonical data persistence.

If any step fails, the day must not end as `collected`.

## Existing canonical data preservation

A manual reset of a previously collected day changes only collector acquisition eligibility.

Existing successful canonical rows and archived HTML remain available until a new successful acquisition is committed. A failed re-acquisition must not destroy the prior known-good copy.

On successful replacement, the complete machine row set for that store/day is replaced atomically so stale rows cannot survive.

## Raw HTML archive

Successful source HTML is stored outside the release symlink so deployments do not remove data.

Recommended default root:

```text
/var/lib/jugest/collector/raw
```

Suggested layout:

```text
/var/lib/jugest/collector/raw/<store-id>/YYYY/MM/YYYY-MM-DD.html.gz
```

Archive requirements:

- gzip compression;
- write temporary file then atomic rename;
- restrictive permissions owned by the unprivileged `jugest` service user;
- store SHA-256 and archive path in collector/store-day metadata;
- do not rewrite an archived collected day during ordinary scheduler passes.

## Schema additions

Extend VPS SQLite with collector-specific tables rather than overloading analysis-job state.

```sql
CREATE TABLE IF NOT EXISTS collector_stores (
  store_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  history_start TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collector_days (
  store_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','running','collected','excluded')),
  retry_after TEXT,
  run_owner TEXT,
  started_at TEXT,
  lease_expires_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  not_found_count INTEGER NOT NULL DEFAULT 0,
  first_not_found_at TEXT,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_http_status INTEGER,
  last_error_class TEXT,
  last_error_message TEXT,
  raw_artifact_path TEXT,
  raw_sha256 TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(store_id,business_date),
  FOREIGN KEY(store_id) REFERENCES collector_stores(store_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS collector_days_sched_idx
ON collector_days(state,retry_after,business_date DESC,store_id);

CREATE TABLE IF NOT EXISTS collector_control (
  id INTEGER PRIMARY KEY CHECK(id=1),
  global_block_until TEXT,
  last_run_started_at TEXT,
  last_run_ended_at TEXT,
  last_run_result TEXT,
  updated_at TEXT NOT NULL
);
```

Existing `store_days.raw_artifact_path` may point to the same durable artifact after success.

## Canonical persistence

On first successful acquisition:

- upsert `stores` name/metadata;
- upsert `store_days` with business date, parser version, raw source hash/path, normalized payload hash and valid quality status;
- delete and replace all `machine_day_data` rows for that day inside the transaction;
- preserve the parser's source machine rows exactly in canonical JSON payloads.

Machine row keys must use a deterministic transport key if no stronger physical-machine identity is guaranteed by the current schema.

This phase does **not** enqueue or execute protected analysis automatically unless an existing non-protected plumbing requirement makes that unavoidable. Collection correctness is verified independently first.

## Manual collection CLI

`collect-now` invokes the same collector engine as the timer and does not bypass safety rules.

Default behavior:

- ensure targets;
- recover stale running rows;
- honor global 403/429 cooldown;
- take the newest eligible pending item;
- continue within a bounded run budget;
- apply normal 10–30 second pacing.

A future authenticated UI action may call the same backend entry point; no second collection implementation should be introduced for the button.

## Process model

Use a dedicated collector process separate from the existing web service and resource-aware analysis coordinator.

Preferred runtime:

```text
jugest-collector.service   systemd oneshot
jugest-collector.timer     approximately once per minute
```

Each invocation performs bounded work and exits. If no work is eligible, it exits quickly.

Benefits:

- deployment releases do not leave a long-lived old collector process running indefinitely;
- crashes are naturally retried by later timer invocations;
- source cooldown and day state are durable in SQLite;
- the web service does not own collection lifecycle;
- collection does not consume analysis-child slots.

The installer must install unit files only. It must not enable/start production collection automatically as part of development or CI.

## Canary rollout

Architecture supports multiple stores from the start, but initial live verification uses exactly one enabled store.

Before enabling continuous live collection:

1. migration and CLI verified on VPS;
2. one manually selected store is registered;
3. one or a very small number of missing dates are fetched manually;
4. raw HTML archive and normalized DB rows are inspected;
5. source status codes and response timing are reviewed;
6. only after explicit user approval is the timer enabled for canary operation.

Expansion to additional stores happens only after observing live behavior.

## Logging

Persist or journal concise operational events:

```text
run start/end
store/date attempted
HTTP status
fetch duration
parser result / machine count / quality
archive success/failure
DB commit success/failure
retry_after
403/429 global block activation
404/410 excluded transition
stale-running recovery
```

Never log full HTML content in journald.

## Error safety

- network timeout -> pending, retry in 45 minutes;
- 5xx -> pending, retry in 45 minutes;
- 403/429 -> pending plus global 45-minute block;
- 404/410 before threshold -> pending, retry in 45 minutes;
- 404/410 at threshold and after 24 hours -> excluded;
- HTTP 200 but parser finds no supported rows -> pending, retry in 45 minutes;
- rejected quality -> pending, retry in 45 minutes;
- archive write failure -> pending, preserve old good data;
- DB failure -> pending, preserve old good data;
- process death while running -> stale lease recovery returns row to pending;
- already collected -> never source-fetch automatically;
- today/future JST date -> never source-fetch automatically.

## Testing requirements

Implementation follows TDD. Tests must include at least:

1. new store target generation covers configured history through yesterday but not today;
2. 04:00 JST gate for adding yesterday's automatic target;
3. newest eligible pending date is selected first;
4. collected rows are never selected automatically;
5. excluded rows are never selected automatically;
6. reset-day returns collected/excluded to pending without deleting prior canonical data;
7. running lease recovery after expiry;
8. ordinary failure returns day to pending with 45-minute retry;
9. one day's retry delay does not prevent another date from running;
10. 403 activates a global 45-minute block;
11. 429 activates a global 45-minute block;
12. no source request occurs during global block;
13. 404/410 do not exclude before 3 failures and 24 hours;
14. 404/410 exclude only after both thresholds are satisfied;
15. parser pure-module parity cases for representative Juggler and HANA HTML;
16. duplicate/conflict handling preserved from current parser behavior;
17. malformed/unsupported 200 response never becomes collected;
18. successful acquisition writes gzip HTML atomically;
19. successful acquisition commits normalized rows and state together;
20. failure after archive preparation but before DB commit does not mark collected;
21. successful re-acquisition atomically replaces old machine rows;
22. old canonical data survives failed manual re-acquisition;
23. global source concurrency stays at 1;
24. randomized normal pacing stays within 10–30 seconds;
25. CLI commands validate store/date inputs and never touch protected analysis semantics;
26. root application regression tests remain green;
27. VPS test suite remains green;
28. `main` and `deploy/vps` remain unchanged.

## Acceptance criteria

The implementation is ready for VPS canary installation when all of these are true:

- all new tests pass;
- existing VPS tests pass;
- existing root regression suite passes;
- parser behavior is verified against stored/static fixtures without live network dependence;
- one development/manual smoke command can show the next eligible target without source access;
- systemd unit installation is reproducible and disabled by default;
- no UI code is required for operation;
- no protected judgement/ranking behavior changed;
- no production branch was advanced.

## Production gate

Completion of implementation and tests is **not** authorization to enable live automatic collection on the VPS.

Before the first real canary request sequence, report:

- feature branch head;
- tests run and results;
- files changed;
- exact migration/install commands;
- exact store/date proposed for the canary;
- rollback/disable commands.

Wait for explicit user authorization before enabling or starting continuous collector operation on the production VPS.
