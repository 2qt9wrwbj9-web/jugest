# JUGEST Axis Auto-Selector — Sol Handoff

Date: 2026-09-08
Branch: `astra/axis-auto-selector-shadow`
Design: `docs/superpowers/specs/2026-09-08-axis-auto-selector-design.md`
Plan: `docs/superpowers/plans/2026-09-08-axis-auto-selector.md`
Base before docs: `273ed61ed2019365ae1b38d76288f20e9625c9e1`

## What Sol already resolved

This is not a new replacement prediction engine. JUGEST already has the correct conceptual seed in v4.7.6-v4.7.8:

- `v4HybridPrepareSignals` produces `practicalSignal`, `modelSignal`, `strictSignal` and the validated-calendar bonus.
- `v4HybridDayUtility` measures Top3/5/10 inferred-ES and P4 lift relative to that day’s store baseline.
- `v4HybridEvaluate` adds stability/win-rate terms.
- `v4HybridOptimizeSamples` searches a simplex, uses chronological train/holdout, and shrinks toward 55/30/15.
- `v4HybridDataSignature` / `v4HybridProfiles` invalidate learned profiles after source data changes.
- `v4PredictStore` applies the current hybrid to visible ranking.
- `bruteSingleFactGroups` / alias dedup already prevent many same-fact representations from stacking inside practical evidence.

The new subsystem generalizes the evaluation/selection idea while remaining additive and shadow-only.

## Existing code map

### Protected/current behavior in `index.html`

Do not casually edit these functions:

- `v4HybridNormWeights`
- `v4HybridGrid`
- `v4HybridDayUtility`
- `v4HybridEvaluate`
- `v4HybridOptimizeSamples`
- `v4HybridDataSignature`
- `v4HybridProfileFor`
- `v4HybridStoredWeights`
- `v4HybridWalkForwardWeights`
- `v4HybridRetrain`
- `v4HybridProfileStatus`
- `v4HybridPrepareSignals`
- `v4HybridApplyWeights`
- `v4PredictStore`

Use `window.V4_TEST` for parity testing where possible. Current test exports already expose `predictStore`, `hybridOptimizeSamples`, `hybridEvaluate`, `hybridGrid`, `hybridNormWeights`, `hybridStoredWeights`, `hybridProfileStatus`, and `hybridRetrain`.

### Persistence

Current browser save state includes `v4HybridProfiles`; restore reads it back. Phase 1 shadow profiles MUST NOT reuse or mutate this object. File/JSON persistence for shadow research is deliberately separate until a later browser/VPS integration phase.

### Headless test runtime

`tests/helpers/runtime.mjs` boots the existing browser runtime inside Node `vm`, with mocked DOM/storage and no expected network. Use it to prove parity and to adapt current prediction rows in tests. Do not import test-only runtime code into shipped application/runtime code.

### Existing point-in-time research reference

`research/store-optimization.mjs` already enforces:

- history dates strictly before target date,
- immutable callback input,
- duplicate date/machine rejection,
- future/target poisoning invariance,
- prediction receipt hashes,
- paired identical validation dates,
- research-only abstention.

Preserve these guarantees and reuse their style.

### Regression baseline

At Collector batch checkpoint:

- 64/64 commands passed,
- Collector: 33 tests,
- protected hashes: 20,
- jitter exact files: 5.

`tests/commands.json` contains the exact command list. `tests/production-preservation.mjs` and `docs/collector-batch/protected-hashes.json` are the main preservation references.

## Initial axis approval decision

Only these are auto-selectable in Phase 1:

| Axis | Source | Approved | Notes |
| --- | --- | --- | --- |
| `practical-v1` | `row.practicalSignal` | yes | Existing practical single-evidence aggregate; do not recalculate it in the new module. |
| `model-v1` | `row.modelSignal` | yes | Existing model/root aggregate; do not recalculate it in the new module. |
| `strict-v1` | `row.strictSignal` | yes | Existing strict calibrated aggregate; do not change strict math. |
| `calendar-v1` | existing validated calendar signal/bonus | **no** | Candidate descriptor only until point-in-time safety and overlap with model/context are proven. |

Do not add an axis just to reach four active axes. Three safe axes are better than four partly duplicated axes.

For the initial 3-axis shadow model, keep current `hybridValidatedBonus` as the same fixed additive bonus outside normalized weights. This avoids changing the control definition and avoids counting calendar twice.

## Critical chronology rule

For a historical target date `D`, absolutely nothing trained/created using `D` or later may affect the prediction for `D`.

This includes a subtle case: **do not take a profile trained on today’s full history and apply it backwards to historical target dates.**

Historical evaluation must simulate point-in-time availability. For each `D`:

1. construct/generate axis signals using only dates `< D`,
2. freeze/hash the prediction bundle,
3. only then reveal `D` outcomes for scoring,
4. never let later profile weights flow backward into that bundle.

The existing current runtime may intentionally use fallback behavior in historical/research paths. Treat the actual point-in-time current behavior as control; do not manufacture a stronger “current control” using future-trained weights.

## Phase 1 thresholds fixed by Sol

These are shadow-only provisional gates, not permanent production truth:

```js
{
  maxActiveAxes: 4,
  minEvaluatedDays: 24,
  minTrainDays: 12,
  minValidationDays: 6,
  minHoldoutDays: 6,
  split: {train:.50, validation:.25, holdout:.25},
  weightStep: .10,
  minAxisAvailability: .80,
  validationMinAdvantage: .005,
  holdoutMinAdvantage: .002,
  holdoutMinWinRate: .55,
  maxCandidateEnsembles: 25000
}
```

Phase 2 must report whether these thresholds are too strict/loose on real historical stores before any ranking promotion.

## Selection discipline

Selection sequence is fixed:

1. eligible approved axes only,
2. train-only weight/subset search,
3. validation gate,
4. final holdout examined once,
5. shadow adoption or control abstention.

Never choose a different candidate after seeing final holdout. If final holdout fails, the result is CONTROL/abstain; do not go back and pick the runner-up.

Candidate must be compared against:

- point-in-time current control,
- conservative 55/30/15 fallback with current fixed validated-calendar bonus behavior.

## Why Phase 1 does not extract all judgment math to Node yet

Current setting/store prediction logic remains embedded in the established runtime. Extracting all protected judgment/prediction math into a shared server core is a separate high-risk architecture change.

Phase 1 therefore makes the selector/evaluator headless while consuming normalized prediction-row signals through an adapter. This gives us leakage-safe selection and VPS-compatible selector code without simultaneously rewriting protected judgment math.

A later VPS phase can extract/share the full source-data-to-signal pipeline once Phase 1/2 evidence justifies it and parity tests are strong enough.

## Astra freedom vs stop points

Astra may choose better internal file decomposition than the plan if all published interfaces/tests remain equivalent and the reason is documented.

Astra must stop rather than improvise if:

- current ranking has to change,
- protected math has to change,
- calendar cannot be isolated from duplicate model evidence,
- future/target data is needed to generate a signal,
- preservation tests must be weakened,
- shadow profiles cannot stay separate,
- Production/main would need modification.

## Required final report to Sol/Hiro

Return:

- final branch + HEAD,
- commits and changed files,
- architecture,
- actual approved registry,
- chronology/leakage proof,
- synthetic poisoning result,
- selection/adoption behavior,
- control/fallback parity,
- all test results,
- performance measurements,
- any deviation from the implementation plan and why,
- calendar-v1 conclusion,
- remaining risks,
- recommendation for Phase 2 historical run.

Do not deploy Production.
