# PRE v2 Promotion & Evaluation Design

> Implementation snapshot of the user-approved PRE v2 design as of 2026-09-17. The authoritative design record remains the Notion page `🧪 JUGEST PRE v2 設計メモ（継続更新）` (`3dd28460ead081619fc5da34f67bf72b`). If this file and that page conflict, the later confirmed Notion decision wins.

## Goal

Replace the old payout/diff-proxy promotion path with a point-in-time, setting-allocation ranking evaluation path that can formally promote a final Challenger to the per-store Active Champion only after fresh future evidence supports improvement.

This subsystem must not change the protected setting-discrimination mathematics. It consumes protected setting judgements/posteriors as truth inputs.

## Non-goals

- Do not change protected Juggler/Hanahana setting-discrimination formulas.
- Do not deploy to production as part of this implementation branch.
- Do not silently reinterpret old `store_prediction_scores`, old Top1/3/5 diff-proxy scores, or historical PRE v1 rows.
- Do not add new analysis axes or change axis semantics.
- Do not add automatic rollback in the initial PRE v2 release.

## Evaluation truth

PRE v2 predicts next-day setting allocation/ranking, not next-day diff coins.

For each evaluable machine, convert the protected setting posterior to expected relevance:

`expectedRelevance = Σ_s posterior(s) * R_s`

with `R_s = P_s - P_1`, where `P_s` is the approved representative payout scale for the machine family.

### Juggler relevance v1

The accepted initial representative average is:

- setting 1: 98.31125
- setting 2: 99.42250
- setting 3: 101.17500
- setting 4: 103.69125
- setting 5: 106.23250
- setting 6: 109.58250

Therefore `R = [0, 1.11125, 2.86375, 5.38, 7.92125, 11.27125]` percentage points.

The source convention is: Happy Juggler V III and Mister Juggler use full-perfect-play payout; the other six target Juggler machines use the accepted cherry-targeting series.

### Normal Hanahana relevance v1

Normal six-setting Hanahana machines use a separate representative six-setting scale. New King Hanahana V is not included in that average.

### New King Hanahana V

New King Hanahana V is a special five-stage machine. Use its own public payout scale `97 / 99 / 101 / 104 / 108` for settings `1 / 2 / 3 / 4 / V`, yielding relevance `0 / 2 / 4 / 7 / 11`.

Never fabricate setting 5/6 posterior probabilities for New King V.

## Ranking metric

The primary daily metric is linear-gain NDCG@10.

For rank `r`, use discount:

`w(r) = 1 / log2(r + 1)`

Daily DCG@k:

`DCG@k = Σ_{r=1..min(k,m)} relevance(rank_r) * w(r)`

Daily IDCG@k is computed from the same store/day/evaluation-machine set sorted by true expected relevance.

Daily NDCG@k is `DCG / IDCG` when `IDCG > 0`.

Rules:

- Primary metric: NDCG@10.
- Safety metric: NDCG@5.
- If `m < k`, evaluate `@min(k,m)` and record `m`.
- Champion and Challenger must be compared on the same predeclared machine set.
- Ties in predicted rank use a result-independent deterministic rule (machine/table key), never next-day truth.
- Missing/unjudgeable truth is not treated as low setting.
- Coverage/missingness is recorded separately.
- If IDCG is zero, raw NDCG is stored as unevaluable/null. For the formal paired comparison update, the daily difference is exactly zero because neither forecaster can gain ranking information from that outcome.

## Point-in-time boundary

For target day `t`, every prediction input, feature, preprocessing parameter, time-weight choice, shrinkage estimate, model selection decision, threshold, and candidate choice must be reproducible using information available before `t` (normally through `t-1`).

No full-period tuning followed by retroactive scoring may be called future performance.

## Research vs formal promotion

Research may search aggressively and retain many candidates. Research score is not promotion proof.

Before formal future evidence begins, freeze one final Challenger per store/promotion attempt:

- model fingerprint
- feature version
- scorer/evaluation version
- relevance-table version
- target machine-set rule
- sequential-test method/configuration
- attempt number and alpha allocation

Old research/holdout code must not directly replace the Active Champion in PRE v2. A research-selected final candidate becomes a formal Challenger only.

## Formal sequential comparison

For each fresh target day:

`D10_t = NDCG@10(Challenger,t) - NDCG@10(Champion,t)`

and separately:

`D5_t = NDCG@5(Challenger,t) - NDCG@5(Champion,t)`

Both lie in `[-1,1]`.

Formal inference is based on the sequential forecaster-comparison framework of Choe & Ramdas, *Comparing Sequential Forecasters*, Operations Research 72(4), 2024, DOI 10.1287/opre.2021.0792. The implementation must use a theorem-valid bounded-difference confidence-sequence/e-process construction and must be numerically checked against an independent reference implementation (`comparecast` and/or CRAN `seqcomp`) on frozen fixtures before activation.

The target estimand is the running average conditional expected score difference, allowing day-to-day expected advantages to vary. Do not replace this with a stronger claim that the Challenger must have nonnegative conditional advantage every individual day.

### Top10 promotion gate

Promotion is allowed only when the pre-specified anytime-valid one-sided evidence for positive average Top10 difference crosses its threshold for the attempt's alpha allocation.

No fixed-time p-value may be repeatedly inspected until favorable.

### Top5 safety gate

Top5 is a separate degradation guard. It does not require proof that Top5 improved. A Challenger is blocked/stopped only when the pre-specified anytime-valid evidence supports negative average `D5` strongly enough under the safety rule.

The safety process and its threshold must be frozen before the attempt starts.

## Lifetime false-promotion budget

Risk scope is per store, across that store's Champion lineage.

Lifetime false-promotion family-wise error budget: 0.05.

For formal attempt number `k >= 1`:

`alpha_k = 0.05 / (k * (k + 1))`

The attempt counter increments when a formal attempt starts, not only when it succeeds. Failed/cancelled attempts do not restore spent allocation.

`Σ alpha_k = 0.05`.

Different stores have separate lifetime budgets. JUGEST-wide quality is monitored separately rather than putting all stores into one global 5% budget.

## Missingness and anti-selection rules

- Formal target-machine membership must be fixed before truth is observed whenever possible.
- A Challenger cannot improve its formal evidence by dropping machines/days after outcomes become known.
- Missing/unjudgeable outcomes must carry an explicit reason and coverage record.
- Outcome-dependent exclusions that can favor the Challenger are forbidden.
- Exact conservative handling for post-outcome missing truth must be deterministic, versioned, and tested before formal promotion can be enabled.

## State persistence and restart safety

Persist enough state to resume a formal attempt without resetting evidence:

- store ID
- attempt number
- status
- Champion fingerprint
- Challenger fingerprint
- feature/model/evaluation/relevance versions
- method and frozen method parameters
- alpha allocation
- first eligible target date / last processed target date
- cumulative sequential-test state needed for exact continuation
- Top10 gate state
- Top5 safety state
- coverage/missingness counters
- creation/update/decision timestamps
- terminal decision/reason

A process restart must not reset evidence, attempt number, alpha usage, or allow the same target day to be double-counted.

## Holdout semantics

Fresh future days may be accumulated sequentially; no arbitrary fixed 30/60-day holdout length is required.

Once a day has been observed for a formal attempt, it is consumed for that attempt. A modified Challenger cannot pretend those same outcomes are unseen.

Research diagnostics such as HAC/LRV and block bootstrap may remain available, but they are not an alternate acceptance route on the same formal future data.

## Initial rollback behavior

Keep old Champions and historical lineage. On post-promotion degradation, record diagnostics, increase research priority, and allow manual restore. Automatic rollback is out of scope for the initial implementation because it requires its own sequential risk policy.

## Compatibility rule

PRE v1/old research metrics may remain readable for history and diagnostics. New PRE v2 tables/versions must make the new semantics explicit. Do not overwrite old rows with new meaning.

## Reference implementations

- Choe & Ramdas paper/code: https://github.com/yjchoe/ComparingForecasters
- CRAN `seqcomp`: https://CRAN.R-project.org/package=seqcomp

The code must record the exact theorem/method/version it implements and include conformance fixtures rather than relying on package defaults by name alone.
