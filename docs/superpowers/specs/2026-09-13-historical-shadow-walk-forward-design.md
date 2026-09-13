# JUGEST Historical Shadow Walk-Forward Design

Date: 2026-09-13
Status: design approved in chat; implementation pending written-spec review
Target branch: `sol/vps-research-pipeline-phase1-impl`

## 1. Purpose

Add a historical PRE-vs-current validation lane that replays already-stored store history in chronological order. The goal is to obtain hundreds of fair comparison days immediately instead of waiting for live PRE shadow data to accumulate one day at a time.

The historical result is evaluation-only. It must never alter production judgment math, the live research champion, the live Today Plan, canonical raw data, or the live PRE-vs-current score ledger.

## 2. Core rule: simulate the information that was available then

For a target date `D`, both engines must receive only canonical store days whose date is `< D`.

The outcome for `D` is read only after both predictions for `D` have been produced. The stored canonical `D` machine rows are then used as the common outcome through the existing `canonical-diff-proxy-v1` scorer.

No current/future champion, feature snapshot, axis, outcome, score, or post-`D` store data may be injected into either engine before predicting `D`.

## 3. Approaches considered

### A. Apply today's PRE model to old dates

Fastest, but rejected. Today's active research model was learned using data that may be later than the historical target date, so historical scores would contain future leakage.

### B. Rebuild both engines completely from scratch for every target date

Statistically valid, but unnecessarily expensive. It repeatedly rediscovers the same state for adjacent dates.

### C. Sequential isolated replay — selected

Create a separate historical simulation state per store and advance it one store-day at a time. The historical PRE research state begins from the same baseline and is updated only when each simulated frontier becomes available. The next target prediction is produced from that isolated state. The current engine is invoked through the existing headless runtime adapter with the exact same canonical history cutoff.

This mirrors how the system would have evolved had PRE existed at the time, while avoiding repeated full-from-zero work.

## 4. Eligibility and comparison start

Historical replay scans dates in ascending order.

A target date is scored only when all of the following are true:

1. At least 7 prior canonical store days exist. This is only an initial warm-up floor, not an automatic score guarantee.
2. The PRE research engine produces a non-empty deterministic ranking using only data before the target date.
3. The current JUGEST Today Plan engine produces a non-empty deterministic ranking using the same cutoff.
4. The target date has canonical machine outcome rows with finite `diff` values.

The official comparison therefore begins on the first target date for which both engines are valid. If the current engine needs substantially more than 7 days, earlier dates are recorded as excluded rather than forced into the score.

## 5. Historical PRE research simulation

Historical PRE state must be isolated from live research tables.

For each store, the replay owns an independent simulated research state containing at minimum:

- simulated frontier date,
- simulated champion model and fingerprint,
- generation/search-round/convergence state needed to reproduce the current research process,
- feature/dataset version,
- deterministic input hash,
- replay algorithm version.

At each frontier, the replay uses only samples derived from days at or before that frontier. Axis discovery, chronological train/validation/holdout splitting, model search, promotion rules, convergence rules, and scoring use the same research modules and constants as the live PRE pipeline.

The historical lane must not read `research_champion` or any other live model as its starting point. It starts from `baselineModel()` and evolves chronologically.

If implementation requires a pure helper around the existing research-cycle behavior, create that helper rather than writing a second incompatible model-search algorithm.

## 6. Historical current-engine simulation

Use the existing headless runtime adapter that boots the real current JUGEST runtime.

For target `D`:

- import only canonical days `< D`,
- set the simulated active store,
- invoke the existing current Today Plan/ranking path,
- normalize its ordered candidates,
- never port or duplicate current JUGEST prediction math into a separate implementation.

If the current engine returns no valid candidate set, mark that date excluded as `missing_current_shadow`.

## 7. Historical prediction and score persistence

Do not mix historical replay rows with `store_prediction_snapshots` / `store_prediction_scores`, because those tables are the immutable live PRE ledger.

Add separate durable historical tables, conceptually:

### `historical_comparison_runs`

One row per store + replay algorithm/version/input history identity.

Fields include:

- run id,
- store id,
- replay version,
- first/last canonical date,
- canonical input hash or stable history identity,
- cursor/next target date,
- state (`queued`, `running`, `complete`, `failed`, `stale`),
- total/processed/scored/excluded counts,
- PRE simulated champion fingerprint at cursor,
- serialized isolated replay state or a reference to normalized state rows,
- created/updated/completed timestamps,
- last error.

### `historical_comparison_days`

One immutable result row per run + target date.

Fields include:

- run id/store id/target date,
- PRE prediction metadata and ordered candidates,
- current prediction metadata and ordered candidates,
- PRE/current prediction hashes,
- common outcome input hash,
- PRE/current metrics,
- winner,
- exclusion reason,
- PRE simulated model fingerprint/feature version/frontier,
- scorer version,
- created timestamp.

Historical day rows are append-once for a given run. A changed canonical history or replay algorithm creates a new run identity rather than silently rewriting old results.

## 8. Scheduling and 2 GB VPS safety

Introduce a dedicated low-priority job type, e.g. `HISTORICAL_COMPARE`.

Rules:

- lower priority than canonical ingest, `DAILY_ANALYSIS`, live feature refresh, live PRE research, live shadow prediction, and live comparison scoring,
- research concurrency remains effectively one heavy historical worker at a time,
- process at most one store target date per job execution, then persist the cursor and enqueue the next target,
- use the existing child-process/resource telemetry and emergency deferral behavior,
- never hold the entire multi-store replay in one long-running process,
- coalesce duplicate scheduling for the same store/run,
- resume safely after restart using the persisted cursor,
- if resource policy defers the job, keep it in retry state rather than losing progress.

The lane may run continuously while the VPS is otherwise idle.

## 9. Store coverage

Historical replay is automatic for all registered stores that have sufficient canonical history.

Each store has its own run and cursor. Stores with insufficient history are reported as not-yet-eligible rather than failed.

When new old history is backfilled into a store and changes the canonical history identity before or inside an existing replay range, the old run is retained for audit and a new run may be scheduled.

## 10. Metrics

Use the same comparison metrics and winner semantics as live PRE shadow validation:

- Top1 overlap/rate/lift,
- Top3 overlap/rate/lift,
- Top5 overlap/rate/lift,
- rank correlation,
- coverage,
- quality = `top3Lift * 100 + top5Lift * 10 + rankCorrelation`,
- winner by the same epsilon used by the live scorer.

Both historical engines on the same target date must share the exact same `outcomeInputHash`.

Excluded dates do not count as wins/losses/ties and are reported separately by reason.

## 11. API

Extend the authenticated research comparison response instead of creating a second unrelated UI protocol.

The existing comparison endpoint continues returning `live` and now returns a populated `historical` object containing at minimum:

- state/progress,
- store id,
- run id/replay version,
- canonical date range,
- processed/scored/excluded counts,
- new/current wins and ties,
- cumulative PRE/current metrics,
- recent historical window metrics,
- quality delta,
- per-day rows (bounded/paginated),
- exclusion breakdown,
- current simulated PRE fingerprint/frontier,
- last error if any.

Existing receiver authentication and channel/store isolation remain mandatory.

## 12. Settings UI

Keep one Settings entry: `PRE版 精度比較`.

Inside it add a two-mode selector:

- `LIVE` — the existing real forward-only PRE shadow results,
- `過去検証` — the new historical walk-forward replay.

The historical view shows:

- replay progress (`処理済み / 対象候補日`),
- `新版勝ち / 現行勝ち / 引き分け`,
- scored and excluded day counts,
- Top1/3/5 and rank correlation side by side,
- quality delta,
- date range,
- recent daily results,
- expandable audit metadata for fingerprint/frontier/outcome hash/exclusion reason.

If replay is running, show that it is calculating in the background and that the numbers will continue to grow. Do not present historical results as LIVE results.

## 13. Improve current empty-state wording

While touching the comparison page, replace the vague live message `1件はまだ未採点です` with target-aware wording whenever the pending row is known, e.g.:

`9/14予測を固定済み · 9/14の実績データ待ち`

This is presentation-only and does not change scoring.

## 14. Failure and restart behavior

A single target-date failure must not corrupt prior historical rows.

- deterministic data/input problems: persist exclusion/failure detail and continue when safe,
- transient worker/resource failures: retry through the queue,
- process restart: resume from the durable cursor,
- canonical-history identity change: mark current run stale and start a new run,
- live pipeline failure: historical work must yield; it must never block or delay live ingest/analysis.

## 15. Tests

At minimum add automated coverage for:

1. future-day poisoning cannot change an earlier historical PRE prediction,
2. historical PRE starts from baseline and cannot read the live champion,
3. current-engine adapter never receives target/future days,
4. first scored day is the first date where both engines are valid, not simply day 7,
5. PRE/current historical scores use the identical outcome hash,
6. replay resumes exactly from its persisted cursor after interruption,
7. re-running the same run identity does not duplicate day rows,
8. changed canonical history creates/stales run identity rather than mutating prior results,
9. historical jobs are lower priority and obey the existing research/resource lane,
10. comparison API keeps receiver auth and store isolation,
11. UI keeps LIVE and historical data visually separate,
12. live pending wording includes the target date when available,
13. full VPS/root/Collector/production-preservation suites remain green,
14. protected Juggler/HANA judgment math and existing `DAILY_ANALYSIS` output semantics remain unchanged.

## 16. Rollout

Implementation and CI happen only on `sol/vps-research-pipeline-phase1-impl` until verification completes.

Do not update `main`, `deploy/vps`, or production as part of implementation. A separate explicit Hiro approval is required immediately before production deployment.

After production deployment, historical replay can begin automatically at low priority and fill the `過去検証` page progressively.

## 17. Non-goals

This change does not:

- alter Juggler/HANA setting probability math,
- alter current `externalJudge`, strict Champion, Calibration, store-share constraints, or HANA hard constraints,
- substitute `diff` for a true hidden setting label; `canonical-diff-proxy-v1` remains an evaluation proxy,
- let historical scores automatically promote a production model,
- merge historical and live win/loss counts,
- create a new bottom navigation workspace,
- use future data to make a historical prediction.
