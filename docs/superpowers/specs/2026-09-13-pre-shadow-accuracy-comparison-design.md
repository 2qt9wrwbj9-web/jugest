# JUGEST PRE Shadow Accuracy Comparison Design

Date: 2026-09-13
Status: design approved in chat; implementation pending written-spec review
Target branch: `sol/vps-research-pipeline-phase1-impl`

## 1. Purpose

Deploy the new store-reading research engine as a PRE release while keeping the current JUGEST store-reading method running in the background as a shadow baseline. Normal JUGEST usage should show the new engine's store-reading output. A settings-only accuracy comparison view should expose whether the new engine is actually outperforming the current method on real, forward-only store data.

The objective is to move from "the new code works" to "the new model is measurably better on live data" without changing protected setting-judgment mathematics.

## 2. Scope and protected boundaries

This feature compares the store-reading / target-ranking layer only.

It MUST NOT change:

- Juggler or HANA probability tables.
- `externalJudge`, reverse judgment, posterior setting math, or HANA hard constraints.
- strict Champion, Calibration, store-share constraint, or existing protected judgment semantics.
- canonical raw-data retention or Collector contracts.
- existing `DAILY_ANALYSIS` result semantics.

The current JUGEST store-reading engine remains intact and is invoked as a baseline through the existing headless runtime adapter rather than copied or rewritten.

## 3. PRE user experience

### 3.1 Primary output

Where JUGEST needs a next-store-read / next-table ranking, the PRE build uses the active research `store-read-v1` snapshot as the primary source.

The new store-read output currently provides ordered candidates using model score. The PRE UI must display only fields the new model actually owns (rank, table number, machine name, research score, model/holdout metadata where useful). It must not fabricate expected-setting or P4+ values from the research score.

Existing setting-judgment screens continue to use their existing protected mathematics.

### 3.2 Fallback

If the new store-read snapshot is unavailable, stale for the requested target date, or `insufficient_data`, JUGEST falls back to the current store-reading method so the app remains usable.

Fallback must be visibly labeled `現行版 fallback` and must not count as a new-engine win in comparison statistics.

### 3.3 PRE marker

The app version area should show a small `PRE` marker while this comparison period is active. This is informational only and does not add a mode switch.

### 3.4 Settings placement

Accuracy comparison lives under the existing/top-left settings entry.

If the current branch still exposes that top-left slot as the `.topbar-side` placeholder, wire that existing slot as the settings button rather than creating a sixth bottom-nav workspace or a new main navigation item.

Settings gets one new row:

- `PRE版 精度比較`

Opening it shows the comparison screen. Normal usage remains uncluttered.

## 4. Fair shadow prediction contract

For every store and target date, predictions from both engines must be fixed before target-day outcome data is used for scoring.

Each stored prediction includes at least:

- `store_id`
- `target_date`
- `engine` (`pre_research` or `current_shadow`)
- `engine_version`
- `model_fingerprint` when applicable
- `feature_version` when applicable
- `source_frontier_date`
- `input_hash`
- immutable ordered candidate payload
- `payload_hash`
- `created_at`

A prediction for the same store / target date / engine must not silently mutate after target-day data arrives. New engine/model revisions require a distinct engine-version/fingerprint identity, while the first live prediction used for evaluation remains preserved.

Backfilled walk-forward experiments and real PRE shadow predictions are stored and reported separately. They MUST NOT be pooled into one accuracy number.

## 5. Current-version shadow engine

The baseline must be the actual current JUGEST store-reading path, not a simplified proxy.

Extend the existing VPS runtime adapter so it can:

1. boot the current JUGEST runtime headlessly,
2. import the exact same canonical store-day history available at the source frontier,
3. invoke the current store plan / ranking bridge for the next target date,
4. normalize its ranked candidates into the immutable shadow prediction schema.

This preserves the old implementation as the source of truth and avoids maintaining a second rewritten copy of protected logic.

The shadow baseline never controls ordinary PRE UI output unless fallback is required.

## 6. New-engine prediction capture

`store-read-v1` remains the active latest snapshot for client consumption.

In addition, every live store-read generation must persist an immutable evaluation prediction for its target date. This preserves the exact ranking that was available before the result day.

Research model activation/refresh continues to produce the client snapshot, but evaluation persistence is separated from the mutable latest-snapshot contract.

## 7. Scoring contract

### 7.1 Outcome

Use the same canonical next-day machine outcome proxy already used by research backtesting (`canonical-diff-proxy-v1`): rank target-day machines by actual canonical `diff`.

This does not claim that diff equals true machine setting. It is a consistent observable outcome proxy for comparing ranking skill between engines.

### 7.2 Per-day metrics

For both engines calculate, from the same target-day machine set:

- Top1 overlap rate and lift.
- Top3 overlap rate and lift.
- Top5 overlap rate and lift.
- rank correlation (Spearman).
- candidate/machine coverage.
- whether prediction was available before the cutoff.

Top10 may be added in the API/UI when the store has enough machines, but Top1/3/5 are the required base metrics because the current research evaluator already uses them.

### 7.3 Daily winner

For the simple `新版勝ち / 現行版勝ち / 引き分け` counter, compare a transparent ranking-quality score aligned with the existing research promotion objective:

`quality = top3Lift * 100 + top5Lift * 10 + rankCorrelation`

Use a small deterministic epsilon for ties. A fallback day, missing prediction, or invalid comparison is excluded from win/loss counts and reported separately.

The UI must still show the underlying metrics so the win counter is never the only evidence.

## 8. Persistence

Add durable VPS tables for:

### 8.1 Immutable predictions

`store_prediction_snapshots`

Stores one pre-outcome ranked prediction per engine identity / store / target date, with hashes and creation timestamps.

### 8.2 Scored comparison days

`store_prediction_scores`

Stores deterministic scored metrics for an immutable prediction against a specific canonical target-day input hash / outcome-proxy version. Re-scoring the same inputs is idempotent.

The schema must make future leakage auditable: source frontier, target date, prediction hash, outcome input hash, and scorer version are explicit.

## 9. Scheduling and resource safety

Shadow evaluation is lower priority than operational ingest and existing analysis.

Priority order remains conceptually:

1. canonical ingest / save
2. `DAILY_ANALYSIS`
3. required feature refresh / active store-read work
4. research work
5. current-version shadow prediction and comparison scoring

Shadow baseline execution uses a child process / existing resource controls and research concurrency remains bounded. It must never block ingestion or normal analysis.

A coalesced low-priority job should generate the current-version shadow prediction after a new source frontier becomes available. Scoring should occur only when both target-day canonical data and at least one valid pre-outcome prediction exist.

## 10. Authenticated comparison API

Add an authenticated read-only endpoint under the existing VPS analytics API, e.g.:

`GET /api/vps/stores/:storeId/research/comparison?limit=90`

Response includes:

- cumulative PRE live metrics for new and current engines,
- recent-30-day metrics,
- new/current/tie counts,
- excluded/fallback/missing counts,
- per-day rows,
- current research model fingerprint/version,
- prediction/source cutoffs,
- diagnostic reason codes for excluded days.

Historical walk-forward metrics, if exposed, are returned in a separate field and visually separated from live PRE results.

Add `getStoreRead()` and `getResearchComparison()` to `vps-browser-analytics.mjs`.

## 11. Settings > PRE版 精度比較 UI

The first screen should answer one question quickly: "Is PRE beating the current version?"

Required summary:

- `新版 / 現行版` side-by-side overall quality.
- `新版勝ち / 現行版勝ち / 引き分け`.
- scored live day count.
- recent 30-day delta.
- Top1 / Top3 / Top5 metrics for both engines.
- rank correlation for both engines.

Required drill-down:

- store selector or current store scope.
- cumulative vs recent 30 days.
- daily comparison rows.
- days where PRE lost by the largest margin.
- excluded/fallback days and reason.

Developer/debug details may live in collapsed sections:

- model fingerprint / model version.
- feature version.
- source frontier and prediction timestamp.
- input/payload hashes.
- failed/missing shadow jobs.
- target-day outcome hash.

No manual model switching or promotion button is included in Phase 1. Comparison is observational.

## 12. Primary PRE store-read UI integration

The current `Today Plan` path should request the authenticated `store-read-v1` snapshot first.

When ready for the selected target date:

- render research-ranked candidates,
- show PRE/research metadata,
- do not display legacy-only probability fields as if they came from the new model.

When unavailable:

- use the existing current plan function,
- label the result as `現行版 fallback`.

Other store-analysis pages remain unchanged unless they explicitly consume store-read ranking output.

## 13. Tests

Implementation must add tests for:

- immutable prediction persistence and no silent overwrite after outcome arrival.
- current-version shadow adapter uses only history before target date.
- new/current predictions receive identical target-day scoring inputs.
- no future leakage when later days are mutated.
- deterministic Top1/3/5, lift, Spearman, and winner calculation.
- fallback days excluded from wins/losses.
- comparison API authentication and store isolation.
- settings route/render and PRE comparison loading states.
- `Today Plan` prefers research store-read and falls back cleanly.
- protected Juggler/HANA and existing production-preservation suites remain unchanged/passing.
- full VPS, root, Collector, and preservation regression suites.

## 14. Rollout

Implementation and CI may proceed on the research branch.

Production deployment is explicitly out of scope until Hiro gives a separate final deployment approval.

The PRE comparison period begins only after the production deployment boundary is approved. Formal promotion from PRE to normal release requires sufficient live scored days and a separate review; no automatic promotion is allowed.

## 15. Non-goals

- Changing machine setting-judgment probabilities.
- Replacing canonical `diff` with an unverified hidden setting label.
- Treating backfilled walk-forward results as live PRE evidence.
- Auto-promoting a research model to final release based on a single metric.
- Adding another bottom-nav workspace.
- Letting the current shadow engine influence primary output except explicit fallback.
