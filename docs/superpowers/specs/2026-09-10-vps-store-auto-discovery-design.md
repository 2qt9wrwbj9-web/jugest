# JUGEST VPS Store Auto-Discovery Design

## Status

Approved in-chat direction for automatic ana-slo store discovery layered on top of the VPS native collector.

- Feature branch: `sol/vps-native-collector`
- Production authorization: **none**
- `main`: **must remain untouched**
- `deploy/vps`: **must remain untouched during implementation and verification**
- Target regions: **Tokyo and Kanagawa only**
- Scope: automatic store discovery, store registration, and discovery-derived collection target creation
- Out of scope: protected judgement math, ranking, prediction, analysis semantics, UI redesign, native iOS work

## Goal

Remove the need to manually register collection stores for Tokyo and Kanagawa.

The VPS should discover every store currently listed by ana-slo for those two prefectures, register newly discovered stores automatically, enable collection automatically, inspect each store's own data-list page, and create collection targets only for dates that actually exist within the most recent one year.

Target flow:

```text
ana-slo Tokyo/Kanagawa hall lists
  -> discover listed stores
  -> upsert store identity + source metadata
  -> enable collector automatically
  -> fetch each store's data-list page
  -> extract existing dates in rolling one-year window
  -> create pending collector_days only for those dates
  -> existing VPS collector fetches detailed daily pages newest-first
```

The existing collector remains the only implementation that fetches and persists detailed daily machine data.

## Fixed product decisions

1. Discover **all ana-slo-listed stores in Tokyo and Kanagawa**.
2. Do not discover or collect other prefectures in this phase.
3. Newly discovered stores are **automatically enabled** for collection.
4. There is **no arbitrary upper limit** on the number of newly discovered stores in a discovery run.
5. Store discovery is automatic and recurring, not a one-time bootstrap script.
6. For a newly discovered or refreshed store, use the store's own ana-slo data-list page to determine which dates actually exist.
7. Create targets only for dates found on that data-list page and inside the rolling one-year window.
8. Do not probe all 365 possible daily URLs merely to discover whether a date exists.
9. Existing detailed-page collection remains globally serial, newest pending date first.
10. Discovery must not modify protected analysis or ranking behavior.

## One-year window

For automatic discovery, "past one year" means a rolling 365-day source window ending at yesterday in JST.

```text
window_end   = yesterday JST
window_start = window_end - 364 days
```

The current business day is never added automatically.

Manual collector-store configuration may continue to support an explicit `history_start`; this design only changes target generation for stores managed by automatic discovery.

## Discovery sources

The discovery subsystem has two source page types.

### 1. Prefecture hall-list pages

One list for Tokyo and one for Kanagawa.

The parser extracts, for every listed store:

```text
prefecture
store name
canonical store/detail-list URL
ana-slo slug/source identifier when derivable
source URL
```

Identity must be based on stable source identifiers/URLs rather than only visible display names, because names may be duplicated or later renamed.

### 2. Store data-list page

Each discovered store has a page that lists dates for which ana-slo has store data.

The parser extracts the set of business dates and, where available, the corresponding detailed-data links.

Only dates inside the rolling one-year window become collector targets.

## Store identity and rename handling

Automatic discovery must not create duplicate JUGEST stores merely because a display name changed.

Preferred identity order:

1. stable ana-slo source slug / stable URL identifier;
2. canonical store data-list URL-derived identifier;
3. normalized prefecture + source-specific identifier fallback.

The human-readable store name is mutable metadata and may be updated by later discovery runs.

A store discovered automatically is marked with discovery metadata so the system can distinguish it from manually managed stores.

## Schema additions

Extend the existing collector schema with discovery-specific metadata rather than overloading analysis tables.

Recommended additions:

```sql
ALTER TABLE collector_stores ADD COLUMN discovery_managed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE collector_stores ADD COLUMN prefecture TEXT;
ALTER TABLE collector_stores ADD COLUMN source_list_url TEXT;
ALTER TABLE collector_stores ADD COLUMN source_store_list_url TEXT;
ALTER TABLE collector_stores ADD COLUMN last_discovered_at TEXT;
ALTER TABLE collector_stores ADD COLUMN last_catalog_refresh_at TEXT;
ALTER TABLE collector_stores ADD COLUMN catalog_retry_after TEXT;
ALTER TABLE collector_stores ADD COLUMN catalog_last_http_status INTEGER;
ALTER TABLE collector_stores ADD COLUMN catalog_last_error_class TEXT;
ALTER TABLE collector_stores ADD COLUMN catalog_last_error_message TEXT;
```

Use migration guards so an existing VPS database upgrades safely.

Add a small durable control table for the two prefecture discovery feeds:

```sql
CREATE TABLE IF NOT EXISTS collector_discovery_sources (
  region TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  last_success_at TEXT,
  retry_after TEXT,
  last_http_status INTEGER,
  last_error_class TEXT,
  last_error_message TEXT,
  updated_at TEXT NOT NULL
);
```

No protected analysis schema semantics are changed.

## Automatic registration behavior

When a prefecture list successfully parses:

- every newly discovered store is upserted into `stores` and `collector_stores`;
- `discovery_managed = 1`;
- `prefecture` is Tokyo or Kanagawa;
- `enabled = 1` automatically;
- visible store name and source URLs are refreshed for existing discovery-managed stores;
- no collection target is created solely from a guessed calendar range.

The store's data-list page is then queued for catalog refresh.

## Existing-date target creation

A successful store data-list refresh produces a set of actual ana-slo dates.

For each date in the rolling one-year window:

- if no collector day exists, insert `pending`;
- if a collector day is already `pending`, `running`, `collected`, or `excluded`, preserve its state;
- never reset `collected` automatically;
- never convert a previously known day to `excluded` merely because a later catalog refresh does not list it;
- never delete existing canonical data when the catalog changes.

Dates not listed by the source are simply absent from the target queue.

This avoids generating hundreds of known-absent 404 probes per store.

## Store removal or disappearance

A store disappearing from one later prefecture list must **not** immediately delete the store or its historical data.

This phase uses conservative retention:

- preserve the store record;
- preserve all collected data;
- record the last successful discovery timestamp;
- do not infer permanent closure from one missing listing;
- continued automatic enable/disable behavior for long-term disappearance is deferred until there is enough live evidence to design it safely.

## Discovery cadence

Prefecture discovery runs once per JST day after 04:00.

A successful region list does not need to be fetched again until the next JST day.

Store data-list refresh policy:

- newly discovered store: refresh as soon as eligible;
- existing discovery-managed store: refresh at most once per JST day;
- a failed catalog refresh uses the ordinary retry/cooldown rules below.

The discovery process may take hours; it is not required to finish in one timer invocation. Work is durable and resumes on later invocations.

## Shared source-access safety

Discovery and detailed collection contact the same upstream site, so they share one source-access safety envelope.

- only **one ana-slo HTTP request globally at a time**, whether discovery, catalog refresh, or detailed daily collection;
- normal inter-request delay remains randomized **10–30 seconds**;
- HTTP 403 or 429 activates the existing **global 45-minute source block** for both discovery and collection;
- while globally blocked, neither subsystem contacts ana-slo;
- ordinary network/5xx/parser failures use a **45-minute retry delay for only the affected discovery/catalog item**;
- discovery never bypasses the existing global run lock.

There is no special new-store-count throttle.

## Work priority

Keep fresh detailed data from falling behind while a large historical bootstrap is running.

Recommended priority across source requests:

```text
1. today's due prefecture discovery list refreshes
2. newly discovered stores needing first data-list refresh
3. existing stores needing daily data-list refresh
4. detailed collector_days, newest business_date first
```

However, discovery/catalog work must be bounded per invocation so detailed collection is not starved indefinitely. The scheduler alternates/budgets work rather than spending an unbounded run solely on catalogs.

After all currently due discovery/catalog work is satisfied, the existing collector continuously consumes detailed pending days newest-first.

## Failure behavior

### Prefecture list failure

- do not remove stores;
- do not disable stores;
- retain previous successful discovery state;
- retry after 45 minutes for ordinary failure;
- 403/429 triggers global 45-minute block.

### Store data-list failure

- do not invent 365 targets;
- do not delete previously known targets;
- do not disable the store;
- retry after 45 minutes for ordinary failure;
- 403/429 triggers global 45-minute block.

### Parse anomaly

An HTTP 200 page that fails structural validation is treated as a retryable parser failure, not as an empty valid list.

A valid page returning zero historical dates may be accepted only if the parser can positively identify the expected store-list page structure; otherwise retry.

## Detailed collector compatibility

The existing detailed collector remains unchanged in its core semantics:

- states remain exactly `pending`, `running`, `collected`, `excluded`;
- successful detailed acquisition still requires fetch + parse + quality + archive + canonical DB commit;
- collected days are never automatically refetched;
- stale running leases recover;
- detailed 404/410 exclusion semantics remain available for stale links/source changes;
- raw HTML archival and canonical persistence remain unchanged;
- protected analysis is not automatically triggered by this feature.

## CLI / observability

Add read/trigger support sufficient to diagnose discovery before a UI exists.

Recommended CLI additions:

```text
discover-now
status
list
```

`status` should expose concise discovery information such as:

```text
Tokyo last discovery
Kanagawa last discovery
discovered store count by prefecture
stores awaiting first catalog refresh
stores with catalog refresh errors
oldest/newest pending detailed dates
global block status
```

No public unauthenticated mutating HTTP endpoint is introduced.

## Runtime integration

Reuse the existing `jugest-collector.service` / timer rather than creating a second independently scheduled service.

The collector invocation should perform bounded discovery/catalog work and bounded detailed collection work under the same durable global run lease.

Benefits:

- one upstream concurrency limit is straightforward to guarantee;
- one 403/429 block protects every ana-slo request path;
- no race between discovery and detailed collection processes;
- deployment/rollback remains simple;
- one timer remains responsible for acquisition lifecycle.

## Expected bootstrap behavior

On the first live run after activation:

1. fetch Tokyo hall list;
2. fetch Kanagawa hall list;
3. register all stores found and enable them;
4. progressively fetch one data-list page per store under the same 10–30 second pacing;
5. create pending targets only for actual dates found in the rolling one-year window;
6. detailed collection begins/continues with newest pending dates first;
7. later runs resume unfinished work until the one-year historical backlog is filled.

The VPS may continuously collect for weeks or months. That is expected and acceptable.

## Testing requirements

Implementation follows TDD. Add tests for at least:

1. Tokyo hall-list parser discovers representative stores and source URLs;
2. Kanagawa hall-list parser discovers representative stores and source URLs;
3. malformed hall-list HTML is rejected rather than interpreted as zero stores;
4. duplicate listings do not create duplicate stores;
5. store rename updates metadata without changing stable identity;
6. newly discovered stores are enabled automatically;
7. no arbitrary new-store-count limit is enforced;
8. only Tokyo and Kanagawa discovery sources are configured;
9. store data-list parser extracts representative historical dates;
10. dates outside the rolling 365-day window are ignored;
11. today JST is never added;
12. only dates actually listed become pending targets;
13. existing collected state is preserved across catalog refresh;
14. existing excluded/running/pending states are preserved;
15. a later missing date does not delete prior canonical data or target state;
16. valid zero-date page is distinguished from malformed parser input;
17. newly discovered store receives an immediate catalog-refresh opportunity;
18. successful region refresh is not repeated more than once per JST day;
19. successful store catalog refresh is not repeated more than once per JST day;
20. ordinary discovery failure delays only that work item 45 minutes;
21. ordinary catalog failure delays only that store catalog 45 minutes;
22. discovery 403 activates the global 45-minute block;
23. catalog 429 activates the global 45-minute block;
24. no discovery, catalog, or detailed request occurs during global block;
25. source concurrency remains exactly one across all three request types;
26. normal pacing remains 10–30 seconds across mixed request types;
27. detailed newest-date-first behavior remains intact;
28. discovery work cannot starve detailed collection indefinitely;
29. existing native collector tests remain green;
30. root production-preservation/regression tests remain green;
31. `main` and `deploy/vps` remain unchanged during implementation.

## Live verification gate

Do not immediately unleash the full Tokyo/Kanagawa historical crawl in production as part of code implementation.

Before continuous activation:

1. deploy only after explicit user authorization;
2. install/update collector runtime if required;
3. run a bounded live discovery probe against Tokyo/Kanagawa;
4. verify store count and sample identities;
5. refresh a small sample of store data-list pages;
6. verify the extracted date sets and generated `pending` rows;
7. perform a very small number of detailed acquisitions;
8. inspect raw archive + canonical SQLite persistence;
9. only then enable continuous timer-driven operation with explicit user approval.

This gate is about validating live source structure, not limiting the eventual number of stores.

## Acceptance criteria

The feature is complete when:

- Tokyo and Kanagawa ana-slo listings can be parsed automatically;
- all discovered stores are durably registered without manual store entry;
- newly discovered stores are automatically enabled;
- each store's actual available dates are learned from its data-list page;
- only actual dates from the rolling one-year window become detailed collection targets;
- discovery and detailed acquisition share the existing one-at-a-time source policy and 403/429 global block;
- the historical backlog may run continuously without preventing fresh dates from being prioritized;
- no protected judgement/ranking/analysis behavior changes;
- all collector and root regression suites pass;
- production branches remain untouched until explicit authorization.