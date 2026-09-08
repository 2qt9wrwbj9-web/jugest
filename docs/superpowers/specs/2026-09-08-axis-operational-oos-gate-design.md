# Axis Auto-Selector Phase 2B — Operational OOS Gate Design

## Status

Design for a research-only, shadow-only safety layer after the existing Axis Auto-Selector.

Base branch: `sol/axis-phase2a-fast-runner` at `a7eff0e47a463908222ce910a0aa470b2fc435d7`.

Implementation must not modify main, Production, visible ranking, protected judgment math, Collector, Device Sync, current `v4PredictStore`, Phase 1 selector semantics, or approved-axis semantics.

## Problem

Phase 2A proved that train → validation → final holdout can still admit ensembles whose later operational out-of-sample behavior differs sharply by store.

The first three real-store studies are design evidence only:

- Green: long-run Shadow underperformed CONTROL.
- Jias Ofuna: Shadow was positive over the evaluated period.
- Seven S Kawasaki: Shadow was slightly positive.

A second risk exists inside a single store: the selector may choose different axis/weight ensembles over time. OOS evidence from one ensemble must not be borrowed by another ensemble simply because both were selected for the same store.

The gate must therefore answer a different question from the selector:

> Even when the selector says `SHADOW_CHAMPION`, has this exact store × ensemble combination previously demonstrated stable revealed OOS behavior strongly enough to permit the Shadow result today?

The gate is not a replacement selector and must not search for weights or axes.

## Chosen architecture

```text
current JUGEST point-in-time sample
        ↓
Phase 1 Axis Selector
        ↓
selectorDecision = CONTROL | SHADOW_CHAMPION
        ↓
exact ensembleKey from selected axes + versions + weights
        ↓
Operational OOS Gate
(store × ensembleKey evidence only)
        ↓
operationalDecision = CONTROL | SHADOW_CHAMPION
        ↓
shadow-only receipt / evaluation
```

The Phase 1 selector remains authoritative for whether an ensemble is statistically eligible. Phase 2B may only downgrade `SHADOW_CHAMPION` to `CONTROL`; it may never promote a selector `CONTROL` result to Shadow.

Gate evidence and state are isolated by **store × ensembleKey**. No store may borrow another store's OOS state, and no ensemble may borrow another ensemble's OOS history.

A newly selected ensemble begins with no operational trust even if another ensemble at the same store has a strong history.

## Ensemble identity

The operational gate uses the same deterministic ensemble identity concept already present in Phase 2A receipts: a hash over the selector decision plus the exact selected axes, axis versions, and normalized weights.

Two profiles share operational evidence only when their `ensembleKey` is exactly identical.

Any change in:

- active axis set;
- axis version;
- normalized selected weight;

produces a different ensemble identity and therefore a separate OOS evidence stream.

Profile-id churn alone must not create a new evidence stream when the exact ensemble identity is unchanged.

## Operational evidence

For target date D and current ensemble E, the gate may inspect only prior receipts satisfying all of:

1. `receipt.targetDate < D`;
2. same store as D;
3. `receipt.selectorDecision === 'SHADOW_CHAMPION'`;
4. `receipt.ensembleKey === E`;
5. the receipt's Shadow ranking was frozen before its own outcome reveal;
6. its post-outcome `utilityDelta = shadowUtility - controlUtility` is finite.

Gate eligibility is independent of whether Phase 2B itself allowed or blocked Shadow on that historical date. This prevents self-starvation: even a blocked Shadow remains a legitimate counterfactual because its ranked keys were frozen before outcome reveal and can be scored afterward.

No current-day `actualES`, `actualP4`, current-day utility, future receipt, later profile, later ensemble, or later gate state may participate in D's decision.

## Gate statistics

The first implementation deliberately uses one small deterministic statistic instead of another learned model.

For the latest `windowEligibleDays` prior gate-eligible receipts belonging to the same store × ensembleKey:

```text
meanDelta = mean(utilityDelta)
sdDelta   = population standard deviation(utilityDelta)
oosScore  = meanDelta - 0.12 * sdDelta / sqrt(n)
```

The `0.12` uncertainty penalty is intentionally aligned with the existing evaluator's uncertainty penalty. The gate does not reuse the evaluator's win-rate term because Phase 2A has many exact/tiny ties and a separate directional threshold would introduce another sparse, tuneable degree of freedom.

### Fixed Phase 2B research defaults

```js
{
  minEvidenceDays: 12,
  windowEligibleDays: 24,
  releaseScore: 0.002,
  keepScore: 0.000
}
```

Rationale:

- `12` matches the selector's minimum train support.
- `24` matches the selector's minimum evaluated-history scale.
- `0.002` matches the existing final-holdout minimum advantage.
- `0.000` is the neutral keep threshold and creates hysteresis without inventing a second positive margin.

These defaults are frozen before evaluating any Phase 2B final holdout data.

## State machine

Operational state is tracked independently for each **store × ensembleKey** pair. Each pair has two effective states: `BLOCKED` and `ALLOWED`. Cold-start is a blocked reason, not a third behavior.

For target date D:

1. If selector decision is `CONTROL`, final decision is `CONTROL` with reason `selector_control`. The gate may not promote it.
2. If selector decision is `SHADOW_CHAMPION`, compute the current exact `ensembleKey`.
3. Load only prior same-store, same-ensemble gate-eligible receipts.
4. If fewer than `minEvidenceDays` such receipts exist, final decision is `CONTROL` with reason `oos_insufficient_evidence`.
5. If the previous state for this exact store × ensembleKey was not `ALLOWED`, Shadow is released only when both:
   - `oosScore >= releaseScore`, and
   - `meanDelta > 0`.
6. If the previous state for this exact store × ensembleKey was `ALLOWED`, Shadow remains allowed only while both:
   - `oosScore >= keepScore`, and
   - `meanDelta >= 0`.
7. Otherwise final decision is `CONTROL` with reason `oos_gate_blocked`.

This gives deliberate hysteresis: entering/re-entering Shadow requires positive conservative evidence, while an already healthy identical ensemble may remain active down to neutral conservative evidence.

If the selector changes to a new ensembleKey, operational trust does **not** carry over. That ensemble must establish its own evidence history.

The state transition is deterministic and derived only from prior frozen receipts. No wall-clock state or hidden cache may change the answer.

## Receipt contract

Phase 2B extends the walk-forward receipt without overwriting existing fields.

Required new fields:

```json
{
  "selectorDecision": "SHADOW_CHAMPION",
  "operationalDecision": "CONTROL",
  "ensembleKey": "sha256...",
  "gate": {
    "stateBefore": "BLOCKED",
    "stateAfter": "BLOCKED",
    "reason": "oos_gate_blocked",
    "evidenceCount": 18,
    "evidenceDates": ["YYYY-MM-DD"],
    "windowStart": "YYYY-MM-DD",
    "windowEnd": "YYYY-MM-DD",
    "meanDelta": -0.0012,
    "sdDelta": 0.0123,
    "oosScore": -0.0018,
    "releaseScore": 0.002,
    "keepScore": 0.0
  }
}
```

The pre-outcome receipt hash must include selector decision, operational decision, exact ensembleKey, gate state/statistics, exact evidence dates, selected axes, control ranked keys, and frozen Shadow ranked keys. It must exclude the current target's outcomes and post-outcome score.

## Ranking behavior

- If selector decision is `CONTROL`, operational ranking is current CONTROL.
- If selector decision is `SHADOW_CHAMPION` but the exact store × ensembleKey gate blocks, operational ranking is current CONTROL.
- If selector decision is `SHADOW_CHAMPION` and that exact store × ensembleKey gate allows, operational ranking is the already-frozen Shadow ranking.

The counterfactual Shadow ranking must still be retained and scored after outcome reveal even on blocked days so later evidence for that same ensembleKey remains observable.

Evidence from that blocked day may never be used by a different ensembleKey.

## Report additions

Phase 2B summary must distinguish three layers:

1. current CONTROL;
2. ungated Phase 1 selector Shadow;
3. gate-controlled operational Shadow.

Required aggregate fields:

- total evaluated days;
- selector Shadow-eligible days;
- gate-allowed Shadow days;
- gate-blocked Shadow days;
- cold-start blocked days;
- operational abstain rate;
- CONTROL vs ungated selector utility delta;
- CONTROL vs operational gate utility delta;
- operational vs ungated selector utility delta;
- Shadow wins / CONTROL wins / ties under operational decisions;
- prevented-loss days: gate blocked and ungated Shadow would have lost;
- missed-gain days: gate blocked and ungated Shadow would have won;
- per-store + per-ensemble gate transitions, evidence counts, and evidence windows;
- count of distinct ensembleKeys selected per store;
- count of ensemble switches that reset operational trust.

The report must never present counterfactual prevented losses as realized Production profit.

## Chronology and leakage invariants

Tests must prove all of the following:

- D's gate input contains only receipts with target date `< D`.
- D's gate evidence contains only the same store and exact current ensembleKey.
- Changing D's outcome cannot change D's selector decision, ensembleKey, gate decision, ranked keys, evidence set, or pre-outcome hash.
- Changing any future outcome cannot change earlier gate decisions or hashes.
- A later profile, later ensemble, or later gate state cannot flow backward.
- A blocked Shadow day's frozen counterfactual is scored only after its outcome is revealed and may influence only later dates for the same store × ensembleKey.
- Store A receipts cannot affect Store B.
- Ensemble A receipts cannot affect Ensemble B, even inside the same store.
- Changing only profile id while exact selected axes/versions/weights stay identical does not unnecessarily reset evidence.
- Re-running the same bundle produces identical decisions and receipt hashes.
- Sequential and Fast Runner bundle generation remain identical; Phase 2B must not change historical sample construction.

## Data separation / anti-overfitting rule

The three already-inspected Phase 2A stores are permitted for implementation debugging and regression fixtures, but they are **not** valid final proof of Phase 2B effectiveness.

Before looking at Phase 2B results on unused real data, the defaults above, exact ensemble isolation rule, and algorithm must be frozen in source and tests. The implementation must then write a holdout lock artifact containing:

- implementation commit SHA;
- gate config and algorithm version;
- selected untouched store/period identifiers;
- hashes of the input bundle partitions used for final evaluation.

The lock is committed before final holdout results are opened.

Final Phase 2B evidence must come from one of:

1. stores in the existing backup not used in the three-store design study; or
2. a chronologically later period that was not used to choose or adjust gate rules.

After opening that final holdout, thresholds or ensemble-sharing rules may not be tuned against it. If the gate fails, the result is NO-GO and any redesign requires a new untouched holdout.

## Modules / interfaces

New research-only module:

```text
research/axis-auto-selector/oos-gate.mjs
```

Primary pure API:

```js
evaluateOperationalGate({
  store,
  ensembleKey,
  selectorDecision,
  priorReceipts,
  previousState,
  config
})
```

It returns a deeply frozen, machine-readable gate decision/statistics object and has no file/network/time dependency.

Existing integration point:

```text
research/axis-auto-selector/walk-forward.mjs
```

The walk-forward runner will:

- call the existing selector unchanged;
- derive the exact ensembleKey from selected axes/versions/weights;
- freeze Shadow ranking first;
- call the pure gate using only prior same-store/same-ensemble receipts;
- choose operational ranking;
- freeze the pre-outcome gate receipt;
- score CONTROL, ungated Shadow, and operational ranking after outcome reveal;
- append the revealed receipt for later dates.

Report aggregation extends `research/axis-auto-selector/report.mjs` without changing Phase 1 evaluation semantics.

CLI remains shadow/research-only. No browser runtime wiring is part of Phase 2B.

## Fail-closed behavior

Phase 2B returns CONTROL when:

- selector is CONTROL;
- current selector Shadow lacks a valid ensembleKey;
- exact ensemble evidence is insufficient;
- a required prior same-ensemble receipt is malformed;
- utilityDelta is missing/non-finite in a receipt that claims to be eligible evidence;
- chronology is invalid;
- same-store evidence has conflicting ensemble identity fields;
- gate statistics are non-finite;
- config is invalid.

Malformed evidence must not be silently skipped in a way that could turn a blocked decision into an allowed one.

Receipts from other stores or other ensembleKeys are not malformed evidence for the current gate; they are simply outside the current evidence stream and must be excluded deterministically.

## Testing strategy

TDD order:

1. pure gate cold-start / release / keep / block / recovery tests;
2. exact ensembleKey isolation and profile-id-churn tests;
3. malformed and store-isolation tests;
4. target-outcome poisoning and future-outcome poisoning tests;
5. blocked-counterfactual-learning test restricted to same ensembleKey;
6. walk-forward integration tests proving selector remains unchanged;
7. report accounting tests for prevented loss / missed gain and ensemble switches;
8. sequential determinism and existing Fast Runner parity;
9. full regression and all Production-preservation suites;
10. commit the holdout lock;
11. only then open the locked unused real-store / unused-period evaluation.

No test may weaken existing exact/ULP parity requirements just to make Phase 2B pass.

## Success criteria

Phase 2B infrastructure is complete when:

- all chronology / poisoning / determinism tests pass;
- protected production behavior is unchanged;
- selector outputs before the gate are identical to Phase 2A;
- operational decisions are reproducible from prior same-store/same-ensemble receipts alone;
- ensemble changes reset operational trust rather than borrowing unrelated evidence;
- unused final holdout evidence is produced without retuning.

A Production recommendation requires separate evidence. Phase 2B completion by itself does not authorize main merge, visible-ranking changes, or Production deployment.
