# JUGEST Axis Auto-Selector — Design Spec

Date: 2026-09-08
Status: ready for user review, then Astra implementation planning
Base: `preview/v512-collector-batch` @ `273ed61ed2019365ae1b38d76288f20e9625c9e1`
Target branch: `astra/axis-auto-selector-shadow`

## Goal

Add a leakage-safe ensemble-selection subsystem that automatically evaluates and weights only pre-approved analysis axes per store, using walk-forward evaluation and later holdout data. The subsystem starts in shadow mode and must not alter current user-visible/production prediction ordering until a later, separately approved promotion.

Long-term nightly flow:

1. collect store data,
2. parse/judge with existing protected math,
3. score approved analysis axes using only information available before each target date,
4. compare predictions against later observed JUGEST-derived outcomes,
5. optimize a sparse store-specific ensemble,
6. apply guardrails and holdout gates,
7. persist a shadow champion profile,
8. generate next-day shadow predictions and audit evidence.

## Protected areas / non-goals

Do not change semantics or arithmetic of:

- `externalJudge` and current Juggler/HANA probability tables,
- strict Champion eligibility or score math,
- Calibration,
- store-share constraint,
- single-evidence arithmetic / eligibility,
- HANA hard constraints,
- parser identity/sanity rules,
- Device Sync cryptography/merge semantics,
- Collector V3 batching semantics,
- current ranking while shadow mode is enabled.

Existing v4.7.6-v4.7.8 hybrid ranking is the behavioral control/fallback.

## Existing foundation

JUGEST already has:

- practical/model/strict hybrid components,
- walk-forward sample construction,
- simplex weight search,
- holdout guard,
- shrinkage toward conservative fallback weights,
- per-store persisted hybrid profiles,
- source-data signatures and stale-profile invalidation,
- independent-fact grouping / alias dedup,
- replay and store-analysis snapshot infrastructure.

Generalize these ideas; do not replace them with an opaque ML model in the first implementation.

## 1. Axis Registry

An axis is a pre-approved deterministic scorer with metadata:

- stable `id`,
- label,
- version,
- scope,
- independence/correlation group,
- minimum history requirement,
- availability predicate,
- approved-for-auto-selection flag,
- optional max weight,
- audit description.

Initial axes must expose only signals already present in current JUGEST logic. Astra must inspect the actual code and register only signals whose current semantics can be preserved exactly. Candidate existing signals include practical single-evidence, model/root, strict calibrated, validated calendar-memory contribution, and any existing recent/regime signal that is demonstrably leakage-safe.

## 2. Leakage-safe Walk-forward Evaluator

For target day `D`, every feature, fit, normalization, axis score and weight decision must use data strictly earlier than `D`.

Target-day observed data is used only after prediction generation to score the prediction.

Persist audit provenance for each evaluated day: target date, training cutoff, source signature, axis versions, row count and metrics.

Add synthetic leakage tests where future exposure would create an artificially perfect result, ensuring the guard is meaningful.

## 3. Outcome / Utility

JUGEST does not observe authoritative machine settings, so do not label the metric “true setting accuracy”.

Use later observed JUGEST-derived outcomes and store-relative lift. Preserve the existing hybrid concept of Top3/Top5/Top10 expected-setting and P4+ lift as the control metric unless a strictly compatible extraction is required.

Record at minimum:

- Top3/5/10 ES lift,
- Top3/5/10 P4+ lift,
- positive-day rate,
- sample count,
- mean utility,
- dispersion/stability.

## 4. Sparse Ensemble Selector

Per store, select a small subset of approved axes and non-negative normalized weights.

Requirements:

- default max active axes = 4,
- deterministic optimization and tie-breaking,
- bounded weight grid/search,
- minimum support,
- chronological train / validation / final holdout separation,
- shrinkage toward the current conservative control,
- no adoption for negligible or unstable gains.

Always compare candidate against both current control hybrid and conservative fallback.

## 5. Correlation / Double-count Guard

Keep existing independent-fact grouping authoritative inside current evidence math.

At the axis layer, prevent overlapping signals from stacking unconstrained weight. Prefer explicit registry-level `correlationGroup` and combined caps in v1. Historical score/rank correlation may be used as an audit guard, not as a predictive feature.

## 6. Auto-adoption Guard

A candidate may become `shadow champion` only if all required gates pass:

- sufficient walk-forward dates,
- valid final holdout,
- no leakage/integrity violation,
- holdout utility not meaningfully worse than control,
- minimum positive-day rate,
- practical/stable improvement threshold,
- no tiny-sample axis domination,
- every selected axis is approved.

Failure retains the current control profile.

Initial implementation MUST NOT change the current visible ranking. Adoption only updates a separate shadow profile.

## 7. Profile Persistence

Persist shadow profiles separately from existing hybrid profiles with:

- schema version,
- store key,
- source-data signature,
- trained-through date,
- timestamp,
- selected axes/weights and axis versions,
- train/validation/holdout summaries,
- control summaries,
- decision and explicit reasons,
- evaluation dates,
- integrity flags.

Stale source signatures must invalidate safely.

## 8. Shadow Prediction Output

Generate shadow ranking without changing visible ranking.

Expose/persist per row:

- control rank,
- shadow rank,
- control score,
- shadow score,
- selected-axis contributions,
- selected-axis weights,
- disagreement magnitude,
- source profile id/signature.

UI work is intentionally minimal in phase 1. A test/developer audit surface is enough.

## 9. Headless / VPS Boundary

Core selector/evaluator must be runnable in Node.js without DOM dependency. Browser UI may use adapters, but domain evaluation should be headless/pure where practical.

Do not deploy an actual VPS service in phase 1. First deliver a deterministic headless command/test harness that a later VPS scheduler can invoke.

Suggested future CLI shape (implementation may differ):

`node scripts/axis-auto-selector.mjs --store <id> --through <date> --shadow`

## 10. Safety / Production Boundary

- work only on a non-production branch,
- do not modify `main` or Production,
- Preview may be used for verification if needed,
- stop immediately before any Production promotion and request Hiro’s explicit authorization.

## Mandatory tests

Use TDD. Cover at least:

1. no target/future-day leakage,
2. deterministic same-input results,
3. stale profile invalidation,
4. insufficient-history fallback,
5. chronological train/validation/holdout ordering,
6. max-active-axis constraint,
7. non-negative normalized weights,
8. unapproved axes never adopted,
9. correlation-group cap,
10. control wins -> no adoption,
11. clearly superior candidate -> shadow adoption,
12. weak/tiny-sample candidate -> no adoption,
13. missing axis signal handling,
14. duplicate/aliased evidence cannot create duplicate votes,
15. current production hybrid output remains semantically equivalent while shadow is disabled,
16. protected hashes / existing regressions stay green,
17. Collector V3 tests stay green,
18. current store-analysis/history/UI regressions stay green.

## Performance requirements

Capture evaluated dates, candidate count, axis count, elapsed time and process memory if practical. Do not allow unbounded subset search. Max four active axes and bounded optimization are deliberate.

## Rollout

### Phase 1 — Shadow core
Registry, evaluator, sparse selector, guards, persistence, headless harness. Zero effect on current ranking.

### Phase 2 — Historical evidence
Run across available stores/history. Produce per-store audit comparing shadow vs current control.

### Phase 3 — Preview audit integration
Optionally expose bounded shadow-vs-control results. Current ranking remains authoritative.

### Phase 4 — Ranking promotion
Only after evidence review and explicit approval, allow validated shadow profiles to affect next-table ranking. Separate protected-regression change.

### Phase 5 — VPS automation
Deploy collection + nightly evaluation + shadow prediction to VPS. Production deployment requires explicit authorization immediately before execution.

## Astra implementation guidance

- inspect the repository before choosing exact module boundaries,
- reuse/extract existing v4 hybrid walk-forward and utility semantics where safe; do not copy-diverge,
- prefer additive modules/adapters over invasive monolith edits,
- shadow mode is the hard default,
- if safe implementation would require changing any protected mathematical principle, STOP and report the conflict,
- do not deploy Production.
