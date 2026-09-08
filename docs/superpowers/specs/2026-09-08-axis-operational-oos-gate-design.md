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

The gate must therefore answer a different question from the selector:

> Even when the selector says `SHADOW_CHAMPION`, has that store's previously frozen Shadow behavior been stable enough in later revealed OOS outcomes to permit the Shadow result today?

The gate is not a replacement selector and must not search for weights or axes.

## Chosen architecture

```text
current JUGEST point-in-time sample
        ↓
Phase 1 Axis Selector
        ↓
selectorDecision = CONTROL | SHADOW_CHAMPION
        ↓
Operational OOS Gate
        ↓
operationalDecision = CONTROL | SHADOW_CHAMPION
        ↓
shadow-only receipt / evaluation
```

The Phase 1 selector remains authoritative for whether an ensemble is statistically eligible. Phase 2B may only downgrade `SHADOW_CHAMPION` to `CONTROL`; it may never promote a selector `CONTROL` result to Shadow.

The gate is store-local. No store may borrow another store's OOS state.

## Operational evidence

For a target date D, the gate may inspect only prior receipts whose `targetDate < D` and whose outcomes were revealed after their own pre-outcome predictions were frozen.

A receipt is **gate-eligible evidence** only when the Phase 1 selector, before outcome reveal, chose `SHADOW_CHAMPION` for that historical target date.

Gate eligibility is independent of whether Phase 2B itself allowed or blocked Shadow on that date. This prevents self-starvation: even a blocked Shadow remains a legitimate counterfactual because its ranked keys were frozen before outcome reveal and can be scored afterward.

Each gate-eligible historical receipt contributes:

```text
utilityDelta = shadowUtility - controlUtility
```

No current-day `actualES`, `actualP4`, current-day utility, future receipt, later profile, or later gate state may participate in D's decision.

## Gate statistics

The first implementation deliberately uses one small deterministic statistic instead of another learned model.

For the latest `windowEligibleDays` prior gate-eligible receipts:

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

Per store, the gate has only two effective states: `BLOCKED` and `ALLOWED`. Cold-start is a blocked reason, not a third behavior.

For target date D:

1. If selector decision is `CONTROL`, final decision is `CONTROL` with reason `selector_control`. The gate state carries forward unchanged; a selector CONTROL day neither resets nor advances operational health evidence.
2. If fewer than `minEvidenceDays` prior gate-eligible receipts exist, final decision is `CONTROL` with reason `oos_insufficient_evidence` and state `BLOCKED`.
3. If the previous operational state was not `ALLOWED`, Shadow is released only when both:
   - `oosScore >= releaseScore`, and
   - `meanDelta > 0`.
4. If the previous operational state was `ALLOWED`, Shadow remains allowed only while both:
   - `oosScore >= keepScore`, and
   - `meanDelta >= 0`.
5. Otherwise final decision is `CONTROL` with reason `oos_gate_blocked` and state `BLOCKED`.

This gives deliberate hysteresis: entering/re-entering Shadow requires positive conservative evidence, while an already healthy Shadow may remain active down to neutral conservative evidence.

The previous state is the immediately preceding receipt's `gate.stateAfter` for the same store. If no prior receipt exists, it is `BLOCKED`. The state transition is deterministic and derived only from prior frozen receipts. No wall-clock state or hidden cache may change the answer.

## Receipt contract

Phase 2B extends the walk-forward receipt without overwriting existing fields. Every receipt gains the store identifier so pure gate validation can reject mixed-store evidence.

Required new fields:

```json
{
  "store": "STORE NAME",
  "selectorDecision": "SHADOW_CHAMPION",
  "operationalDecision": "CONTROL",
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

`evidenceDates` is the exact ordered set used for the current decision, capped to the current rolling window. `evidenceCount` equals its length.

The pre-outcome receipt hash must include store, selector decision, operational decision, gate state/statistics, exact evidence dates, selected axes, control ranked keys, and frozen Shadow ranked keys. It must exclude the current target's outcomes and post-outcome score.

## Ranking behavior

- If selector decision is `CONTROL`, operational ranking is current CONTROL.
- If selector decision is `SHADOW_CHAMPION` but gate blocks, operational ranking is current CONTROL.
- If selector decision is `SHADOW_CHAMPION` and gate allows, operational ranking is the already-frozen Shadow ranking.

The counterfactual Shadow ranking must still be retained and scored after outcome reveal even on blocked days so later gate evidence remains observable.

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
- per-store gate transitions and evidence counts.

The report must never present counterfactual prevented losses as realized Production profit.

## Chronology and leakage invariants

Tests must prove all of the following:

- D's gate input contains only receipts with target date `< D`.
- Changing D's outcome cannot change D's selector decision, gate decision, ranked keys, evidence set, or pre-outcome hash.
- Changing any future outcome cannot change earlier gate decisions or hashes.
- A later profile or later gate state cannot flow backward.
- A blocked Shadow day's frozen counterfactual is scored only after its outcome is revealed and may influence only later dates.
- Store A receipts cannot affect Store B; mixed-store prior receipts fail closed.
- Re-running the same bundle produces identical decisions and receipt hashes.
- Sequential and Fast Runner bundle generation remain identical; Phase 2B must not change historical sample construction.

## Data separation / anti-overfitting rule

The three already-inspected Phase 2A stores are permitted for implementation debugging and regression fixtures, but they are **not** valid final proof of Phase 2B effectiveness.

Before looking at Phase 2B results on unused real data, the defaults above and algorithm must be frozen in source and tests. The implementation must then write a holdout lock artifact containing:

- implementation commit SHA;
- gate config and algorithm version;
- selected untouched store/period identifiers;
- hashes of the input bundle partitions used for final evaluation.

The lock is committed before final holdout results are opened.

Final Phase 2B evidence must come from one of:

1. stores in the existing backup not used in the three-store design study; or
2. a chronologically later period that was not used to choose or adjust gate rules.

After opening that final holdout, thresholds may not be tuned against it. If the gate fails, the result is NO-GO and any redesign requires a new untouched holdout.

## Modules / interfaces

New research-only module:

```text
research/axis-auto-selector/oos-gate.mjs
```

Primary pure API:

```js
evaluateOperationalGate({
  store,
  selectorDecision,
  priorReceipts,
  previousState,
  config
})
```

It returns a deeply frozen, machine-readable gate decision/statistics object and has no file/network/time dependency. It validates that all supplied prior receipts belong to `store` and are strictly chronological.

Existing integration point:

```text
research/axis-auto-selector/walk-forward.mjs
```

The walk-forward runner will:

- call the existing selector unchanged;
- freeze Shadow ranking first;
- call the pure gate using only prior receipts;
- choose operational ranking;
- freeze the pre-outcome gate receipt;
- score CONTROL, ungated Shadow, and operational ranking after outcome reveal;
- append the revealed receipt for later dates.

Report aggregation extends `research/axis-auto-selector/report.mjs` without changing Phase 1 evaluation semantics.

CLI remains shadow/research-only. No browser runtime wiring is part of Phase 2B.

## Fail-closed behavior

Phase 2B returns CONTROL when:

- selector is CONTROL;
- evidence is insufficient;
- a gate-eligible prior receipt is malformed;
- utilityDelta is missing/non-finite in a receipt that claims to be eligible evidence;
- chronology is invalid;
- store identity is mixed or missing;
- gate statistics are non-finite;
- config is invalid.

Malformed gate-eligible evidence must not be silently skipped in a way that could turn a blocked decision into an allowed one.

## Testing strategy

TDD order:

1. pure gate cold-start / release / keep / block / recovery tests;
2. malformed and store-isolation tests;
3. target-outcome poisoning and future-outcome poisoning tests;
4. blocked-counterfactual-learning test;
5. walk-forward integration tests proving selector remains unchanged;
6. report accounting tests for prevented loss / missed gain;
7. sequential determinism and existing Fast Runner parity;
8. full regression and all Production-preservation suites;
9. commit the holdout lock;
10. only then open the locked unused real-store / unused-period evaluation.

No test may weaken existing exact/ULP parity requirements just to make Phase 2B pass.

## Success criteria

Phase 2B infrastructure is complete when:

- all chronology / poisoning / determinism tests pass;
- protected production behavior is unchanged;
- selector outputs before the gate are identical to Phase 2A;
- operational decisions are reproducible from prior receipts alone;
- unused final holdout evidence is produced without retuning.

A Production recommendation requires separate evidence. Phase 2B completion by itself does not authorize main merge, visible-ranking changes, or Production deployment.
