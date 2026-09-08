# Axis Auto-Selector Phase 2B — Operational OOS Gate Freeze

## Status

Research-only / shadow-only implementation freeze for Phase 2B.

- Base: `sol/axis-phase2a-fast-runner` at `a7eff0e47a463908222ce910a0aa470b2fc435d7`
- Frozen implementation commit: `44a8f40129306cd97b1cd93474dc5f90804b0eb9`
- Algorithm version: `phase2b-oos-gate-v1`
- No main, Production, visible-ranking, protected judgment-math, Collector, Device Sync, `v4PredictStore`, Phase 1 selector, or approved-axis semantic changes are authorized by this work.

Phase 2B is a safety gate after the unchanged Axis selector. It may downgrade selector `SHADOW_CHAMPION` to operational `CONTROL`; it may never promote selector `CONTROL` to Shadow.

## Frozen architecture

```text
point-in-time JUGEST sample
        ↓
unchanged Phase 1 Axis Selector
        ↓
selectorDecision = CONTROL | SHADOW_CHAMPION
        ↓
exact ensembleKey
(hash of selector decision + selected axis ids + versions + weights)
        ↓
Phase 2B Operational OOS Gate
        ↓
operationalDecision = CONTROL | SHADOW_CHAMPION
        ↓
shadow-only receipt / report
```

The counterfactual Shadow ranking is frozen before the target outcome is scored, even when the operational gate blocks it. That blocked counterfactual remains valid later evidence only for the same store × exact ensembleKey.

## Frozen gate configuration

```js
{
  minEvidenceDays: 12,
  windowEligibleDays: 24,
  releaseScore: 0.002,
  keepScore: 0.000,
  uncertaintyPenalty: 0.12
}
```

For the latest eligible exact-ensemble receipts:

```text
meanDelta = mean(shadowUtility - controlUtility)
sdDelta   = population standard deviation(utilityDelta)
oosScore  = meanDelta - 0.12 * sdDelta / sqrt(n)
```

No threshold or ensemble-sharing rule may be changed after the final holdout is opened. A failed locked holdout is a NO-GO; redesign requires a new untouched holdout.

## Exact evidence eligibility

For target date D and current ensemble E, gate evidence may use only prior receipts satisfying all of:

1. `receipt.targetDate < D`;
2. same store as D;
3. `receipt.selectorDecision === 'SHADOW_CHAMPION'`;
4. `receipt.ensembleKey === E`;
5. non-empty pre-outcome hash proving the counterfactual was frozen before its own outcome reveal;
6. finite `utilityDelta = shadowUtility - controlUtility`.

Evidence is independent of whether the operational gate allowed or blocked Shadow on that historical day. This prevents self-starvation while preserving exact-ensemble isolation.

Receipts from another store or another ensemble are not borrowed. Malformed receipts that claim to be eligible exact-ensemble evidence fail closed instead of being silently skipped.

## Frozen state semantics

State is derived entirely from prior receipts; callers do **not** supply `previousState`.

For the current store and ensemble:

- Ignore prior selector `CONTROL` receipts when reconstructing Shadow trust. A CONTROL gap alone does not reset an unchanged ensemble.
- Inspect the most recent prior selector `SHADOW_CHAMPION` receipt for the same store.
- If that receipt has the current exact ensembleKey, reuse its `gate.stateAfter` (`BLOCKED` or `ALLOWED`).
- If that receipt has a different ensembleKey, current operational state re-enters through `BLOCKED`.
- Exact current-ensemble historical evidence is retained across such a switch; only the operational `ALLOWED` state is reset. Returning to an old ensemble therefore must satisfy the stricter release threshold again instead of inheriting old ALLOWED trust.

Decision rules:

1. Selector `CONTROL` → operational `CONTROL`, reason `selector_control`; never promoted.
2. Selector Shadow with fewer than 12 exact prior evidence days → operational `CONTROL`, state `BLOCKED`, reason `oos_insufficient_evidence`.
3. `stateBefore === ALLOWED` stays Shadow only while `oosScore >= keepScore` and `meanDelta >= 0`; reason `oos_gate_kept`.
4. `stateBefore === BLOCKED` releases Shadow only when `oosScore >= releaseScore` and `meanDelta > 0`; reason `oos_gate_released`.
5. Otherwise operational `CONTROL`, state `BLOCKED`, reason `oos_gate_blocked`.

## Pure API

```js
evaluateOperationalGate({
  store,
  targetDate,
  ensembleKey,
  selectorDecision,
  priorReceipts,
  config
})
```

The gate has no file, network, wall-clock, or hidden-cache dependency. It validates that every prior receipt is strictly earlier than `targetDate` and returns a deeply frozen machine-readable result.

## Walk-forward receipt contract

Phase 2B extends the existing Phase 2A receipt and preserves the original counterfactual fields. Important fields are:

```json
{
  "store": "...",
  "targetDate": "YYYY-MM-DD",
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
    "minEvidenceDays": 12,
    "windowEligibleDays": 24,
    "releaseScore": 0.002,
    "keepScore": 0,
    "uncertaintyPenalty": 0.12
  },
  "controlRankedKeys": [],
  "shadowRankedKeys": [],
  "operationalRankedKeys": [],
  "controlUtility": 0,
  "shadowUtility": 0,
  "operationalUtility": 0,
  "utilityDelta": 0,
  "operationalUtilityDelta": 0,
  "preOutcomeHash": "sha256..."
}
```

`preOutcomeHash` includes store/date/source identity, selector and operational decisions, exact ensembleKey, gate state/statistics/evidence dates, selected axes, and all three frozen ranked-key lists. It excludes the target's outcome and post-outcome utilities.

## Report contract

The existing Phase 2A summary remains present. Phase 2B adds `summary.phase2b`, separating:

1. CONTROL;
2. ungated selector Shadow;
3. operational gate result.

The Phase 2B section records selector Shadow-eligible days, gate-allowed/blocked Shadow days, cold-start blocks, operational abstention, operational wins/losses/ties, prevented-loss and missed-gain counterfactual counts, mean-utility deltas for the three layers, distinct ensemble count, Shadow ensemble switches, gate transitions, and per-ensemble selection/allow/block/evidence statistics.

Prevented-loss counts are counterfactual research metrics, never realized Production profit.

## Leakage / determinism invariants

The implementation and tests freeze these requirements:

- D's gate receives only receipts with `targetDate < D`.
- D's evidence is same-store + exact-current-ensemble only.
- Changing D's outcome cannot change D's selector decision, ensemble identity, gate decision, ranked keys, evidence set, or pre-outcome hash.
- Changing a future outcome cannot change earlier receipts or hashes.
- A later profile, ensemble, or gate state cannot flow backward.
- Store A cannot affect Store B.
- Ensemble A evidence cannot be borrowed by Ensemble B.
- A blocked counterfactual may influence only later dates for its own exact ensemble.
- CONTROL gaps do not reset unchanged Shadow trust.
- A different intervening Shadow ensemble resets ALLOWED state without deleting exact-ensemble evidence.
- Identical input produces identical receipts and hashes.
- Historical sample construction remains Phase 2A-compatible; sequential and Fast Runner parity must remain intact.

## Verification before holdout

At frozen implementation commit `44a8f40129306cd97b1cd93474dc5f90804b0eb9`, the fresh GitHub Actions verification completed successfully for:

- Phase 2B focused tests;
- Phase 2A and Fast Runner preservation tests;
- full regression suite;
- mandatory Production-preservation regressions.

The final holdout lock must be committed **before** opening the selected unused real-data result and must contain:

- this frozen implementation SHA;
- algorithm version and exact config above;
- untouched store and evaluation-period identifiers;
- SHA-256 hashes of the locked input bundle / evaluation partition;
- evaluation command and warmup rule.

## Final evidence rule

The Phase 2A design stores (Green, Jias Ofuna, Seven S Kawasaki) are not valid final Phase 2B proof. Final evidence must use an untouched store or a genuinely untouched later period.

After the holdout lock exists, run the frozen implementation exactly once on the locked partition and report the result without retuning. Infrastructure completion does not authorize merge to main, visible ranking changes, or Production deployment.