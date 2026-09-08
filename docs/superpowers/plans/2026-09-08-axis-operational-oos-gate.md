# Axis Operational OOS Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a research-only Phase 2B operational OOS safety gate that may downgrade a Phase 1 `SHADOW_CHAMPION` to `CONTROL` using only prior revealed OOS evidence for the exact `store × ensembleKey`.

**Architecture:** Keep Phase 1 selector semantics unchanged. Add a pure `oos-gate.mjs` module that validates and scores prior same-store/same-ensemble receipts, then integrate it after Shadow ranking is frozen but before current-day outcome scoring in `walk-forward.mjs`. Extend receipts and reports to distinguish control, ungated selector Shadow, and gate-controlled operational Shadow; keep Fast Runner/sample generation untouched.

**Tech Stack:** Node.js 22 ESM, `node:test`, existing Axis Auto-Selector research modules, SHA-256 receipts, GitHub Actions regression suite.

**Spec:** `docs/superpowers/specs/2026-09-08-axis-operational-oos-gate-design.md`

## Global Constraints

- Research-only and shadow-only; no browser runtime wiring.
- Do not modify `main`, Production, visible ranking, Collector, Device Sync, current `v4PredictStore`, Phase 1 selector semantics, approved-axis semantics, or protected judgment math.
- Gate evidence is isolated by exact `store × ensembleKey`.
- A selector `CONTROL` may never be promoted to Shadow.
- Current target outcomes and all future outcomes are excluded from the target's gate decision and pre-outcome hash.
- Blocked Shadow counterfactual rankings are still frozen and scored after reveal for later same-ensemble evidence.
- Defaults are fixed before final holdout: `minEvidenceDays:12`, `windowEligibleDays:24`, `releaseScore:0.002`, `keepScore:0.000`, uncertainty penalty `0.12`.
- Final holdout must be locked before opening results and may not be retuned after inspection.

---

### Task 1: Pure `store × ensembleKey` Operational Gate

**Files:**
- Create: `research/axis-auto-selector/oos-gate.mjs`
- Create: `tests/axis-phase2b-oos-gate.mjs`

**Interfaces:**
- Consumes: prior Phase 2B/compatible receipts with `store`, `targetDate`, `selectorDecision`, `ensembleKey`, `utilityDelta`, and gate state.
- Produces: `DEFAULT_OOS_GATE_CONFIG` and `evaluateOperationalGate({store,ensembleKey,selectorDecision,priorReceipts,previousState,config})`.

- [ ] **Step 1: Write failing cold-start, release, keep, block, recovery and exact-ensemble-isolation tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_OOS_GATE_CONFIG,evaluateOperationalGate} from '../research/axis-auto-selector/oos-gate.mjs';

const receipt=(i,{store='A',ensembleKey='E1',delta=.01}={})=>({
  store,targetDate:`2026-01-${String(i+1).padStart(2,'0')}`,
  selectorDecision:'SHADOW_CHAMPION',ensembleKey,utilityDelta:delta,
  gate:{stateAfter:'BLOCKED'}
});

test('cold start blocks until exact ensemble has 12 prior eligible receipts',()=>{
  const result=evaluateOperationalGate({store:'A',ensembleKey:'E1',selectorDecision:'SHADOW_CHAMPION',priorReceipts:Array.from({length:11},(_,i)=>receipt(i)),previousState:'BLOCKED'});
  assert.equal(result.operationalDecision,'CONTROL');
  assert.equal(result.reason,'oos_insufficient_evidence');
  assert.equal(result.evidenceCount,11);
});

test('evidence from another ensemble is not borrowed',()=>{
  const prior=[...Array.from({length:11},(_,i)=>receipt(i)),receipt(11,{ensembleKey:'E2'})];
  const result=evaluateOperationalGate({store:'A',ensembleKey:'E1',selectorDecision:'SHADOW_CHAMPION',priorReceipts:prior,previousState:'BLOCKED'});
  assert.equal(result.evidenceCount,11);
  assert.equal(result.operationalDecision,'CONTROL');
});
```

Add tests with 12 positive same-ensemble deltas to release, non-negative evidence to keep while `ALLOWED`, negative evidence to block, and later positive window evidence to recover.

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
node --test tests/axis-phase2b-oos-gate.mjs
```

Expected: FAIL because `oos-gate.mjs` does not exist.

- [ ] **Step 3: Implement minimal pure gate**

```js
export const DEFAULT_OOS_GATE_CONFIG=Object.freeze({
  minEvidenceDays:12,
  windowEligibleDays:24,
  releaseScore:.002,
  keepScore:0,
  uncertaintyPenalty:.12
});

export function evaluateOperationalGate({store,ensembleKey,selectorDecision,priorReceipts,previousState='BLOCKED',config=DEFAULT_OOS_GATE_CONFIG}={}){
  // validate config, store, ensembleKey, chronology and gate-eligible receipts;
  // filter exact store + exact ensembleKey + prior selector SHADOW_CHAMPION;
  // malformed gate-eligible evidence fails closed/throws instead of being skipped;
  // take latest windowEligibleDays;
  // compute meanDelta, population sdDelta, oosScore;
  // CONTROL selector => selector_control and carry state;
  // insufficient exact-ensemble evidence => CONTROL/BLOCKED;
  // BLOCKED enters only at releaseScore with meanDelta > 0;
  // ALLOWED stays only at keepScore with meanDelta >= 0;
  // otherwise CONTROL/BLOCKED;
  // return deeply frozen statistics including exact evidenceDates.
}
```

Use one deterministic implementation only; no network, file, wall-clock, random, or learned model dependency.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
node --test tests/axis-phase2b-oos-gate.mjs
```

Expected: all Task 1 tests PASS.

- [ ] **Step 5: Add fail-closed tests and commit**

Cover duplicate/non-increasing dates, mixed store, malformed exact-ensemble eligible receipt, missing/non-finite `utilityDelta`, invalid config, invalid state, and selector `CONTROL` never promoting. Then run the focused file again and commit Task 1.

---

### Task 2: Walk-Forward Integration and Pre-Outcome Receipt Contract

**Files:**
- Modify: `research/axis-auto-selector/walk-forward.mjs`
- Modify: `tests/axis-phase2a-walk-forward.mjs`
- Create: `tests/axis-phase2b-walk-forward.mjs`

**Interfaces:**
- Consumes: `evaluateOperationalGate` from Task 1 and unchanged `runShadowEvaluation` / `rankShadowRows`.
- Produces: Phase 2B receipt fields `store`, `selectorDecision`, `operationalDecision`, `gate`, `operationalRankedKeys`, `operationalUtility`, while preserving existing Phase 2A fields for compatibility.

- [ ] **Step 1: Write failing integration tests**

Test that an eligible selector Shadow is blocked during cold start, that `shadowRankedKeys` remain the ungated counterfactual, and that `operationalRankedKeys === controlRankedKeys` when blocked.

```js
assert.equal(receipt.selectorDecision,'SHADOW_CHAMPION');
assert.equal(receipt.operationalDecision,'CONTROL');
assert.equal(receipt.gate.reason,'oos_insufficient_evidence');
assert.deepEqual(receipt.operationalRankedKeys,receipt.controlRankedKeys);
assert.notDeepEqual(receipt.shadowRankedKeys,receipt.controlRankedKeys);
```

Add a deterministic fixture where the same ensemble reaches 12 positive revealed prior deltas and later becomes operationally allowed.

- [ ] **Step 2: Run Phase 2B integration test and verify RED**

```bash
node --test tests/axis-phase2b-walk-forward.mjs
```

Expected: FAIL because receipt fields/gate integration do not exist.

- [ ] **Step 3: Integrate gate after Shadow ranking freeze and before current outcome scoring**

In each evaluated target:

```js
const selectorDecision=profile.decision;
const rankedShadow=rankShadowRows(sample.rows,profile,registry);
const eKey=ensembleKey(profile);
const stateBefore=latestStateFor({receipts,store:bundle.store,ensembleKey:eKey});
const gate=evaluateOperationalGate({
  store:bundle.store,
  ensembleKey:eKey,
  selectorDecision,
  priorReceipts:receipts,
  previousState:stateBefore,
  config:oosGateConfig
});
const operationalRankedKeys=gate.operationalDecision==='SHADOW_CHAMPION'
  ? rankedShadow.map(row=>row.key)
  : controlRankedKeys;
```

Score `control`, ungated `shadow`, and `operational` only after the pre-outcome ranking/gate decision is frozen. Store `utilityDelta` as ungated `shadowUtility-controlUtility` so blocked same-ensemble days remain later counterfactual evidence.

- [ ] **Step 4: Extend pre-outcome hash**

Hash exact `store`, `selectorDecision`, `operationalDecision`, `ensembleKey`, gate state/statistics/evidenceDates, selected axes, control ranked keys, ungated Shadow ranked keys, and operational ranked keys. Do not include current target utility or outcomes.

- [ ] **Step 5: Preserve Phase 2A compatibility and run tests**

Existing fields `decision`, `controlUtility`, `shadowUtility`, `utilityDelta`, `controlRankedKeys`, `shadowRankedKeys`, `ensembleKey`, `selectedAxes` remain present. Keep `decision` equal to selector decision for Phase 2A report compatibility; new behavior uses explicit `operationalDecision`.

Run:

```bash
node --test tests/axis-phase2a-walk-forward.mjs tests/axis-phase2b-walk-forward.mjs
```

Expected: all tests PASS.

- [ ] **Step 6: Commit Task 2**

Commit only walk-forward integration/tests.

---

### Task 3: Poisoning, Chronology, State, and Ensemble Isolation Regressions

**Files:**
- Modify: `tests/axis-phase2b-walk-forward.mjs`
- Modify: `tests/axis-phase2b-oos-gate.mjs`

**Interfaces:**
- Consumes: Task 1 gate and Task 2 receipts.
- Produces: regression proof for the Phase 2B chronology contract.

- [ ] **Step 1: Add target-outcome poisoning test**

Change only target D `actualES`/`actualP4`; assert D's `selectorDecision`, `operationalDecision`, `gate`, ranked-key arrays, and `preOutcomeHash` are byte/deep equal while post-outcome utility changes.

- [ ] **Step 2: Add future-outcome poisoning test**

Mutate outcomes strictly after cutoff D and assert every receipt through D remains deeply equal.

- [ ] **Step 3: Add blocked-counterfactual-learning test**

Construct an ensemble that is blocked for its first 12 appearances but whose frozen Shadow counterfactual deltas are positive; assert the 13th appearance can release based on those blocked historical receipts.

- [ ] **Step 4: Add ensemble-switch state reset test**

Make E1 reach `ALLOWED`, then select E2. Assert E2 starts with zero exact-ensemble evidence and `BLOCKED`; switching back to E1 restores only E1's own deterministic state/evidence stream.

- [ ] **Step 5: Run focused chronology suite and commit**

```bash
node --test tests/axis-phase2b-oos-gate.mjs tests/axis-phase2b-walk-forward.mjs
```

Expected: PASS.

---

### Task 4: Three-Layer Phase 2B Report

**Files:**
- Modify: `research/axis-auto-selector/report.mjs`
- Create: `tests/axis-phase2b-report.mjs`

**Interfaces:**
- Consumes: receipts with control, ungated Shadow, operational gate fields.
- Produces: existing Phase 2A summary fields unchanged plus a nested `phase2b` summary.

- [ ] **Step 1: Write failing report accounting test**

Use deterministic synthetic receipts to assert:

```js
assert.equal(summary.phase2b.selectorShadowEligibleDays,4);
assert.equal(summary.phase2b.gateAllowedShadowDays,1);
assert.equal(summary.phase2b.gateBlockedShadowDays,3);
assert.equal(summary.phase2b.preventedLossDays,2);
assert.equal(summary.phase2b.missedGainDays,1);
```

Also assert mean control→selector, control→operational, and operational→selector utility deltas.

- [ ] **Step 2: Run report test and verify RED**

```bash
node --test tests/axis-phase2b-report.mjs
```

Expected: FAIL because `summary.phase2b` is absent.

- [ ] **Step 3: Add nested Phase 2B accounting without changing old fields**

Compute Phase 2B metrics only when new fields are present. Count prevented loss only when gate blocked a selector Shadow and ungated `utilityDelta < -EPSILON`; count missed gain only when blocked and ungated `utilityDelta > EPSILON`. Never label either as Production profit.

- [ ] **Step 4: Run Phase 2A + Phase 2B report tests and commit**

```bash
node --test tests/axis-phase2a-walk-forward.mjs tests/axis-phase2b-walk-forward.mjs tests/axis-phase2b-report.mjs
```

Expected: PASS.

---

### Task 5: Full Regression, Fast Runner Preservation, and Documentation

**Files:**
- Modify: `docs/axis-auto-selector/PHASE2A-REPORT.md` only to append a Phase 2B research status section, or create `docs/axis-auto-selector/PHASE2B-REPORT.md` if separation is clearer after implementation.
- No Fast Runner code changes unless a failing preservation test proves integration accidentally affected sample construction; if that happens, stop and investigate rather than patching around parity.

**Interfaces:**
- Consumes: complete Phase 2B implementation.
- Produces: verified research branch with protected behavior unchanged.

- [ ] **Step 1: Run all focused Phase 2B tests**

```bash
node --test tests/axis-phase2b-oos-gate.mjs tests/axis-phase2b-walk-forward.mjs tests/axis-phase2b-report.mjs
```

- [ ] **Step 2: Run existing Phase 2A/Fast Runner suites**

```bash
node --test tests/axis-phase2a-builder.mjs tests/axis-phase2a-builder-fast.mjs tests/axis-phase2a-cli.mjs tests/axis-phase2a-cli-fast.mjs tests/axis-phase2a-fast-runner.mjs tests/axis-phase2a-input.mjs tests/axis-phase2a-jugest-runtime.mjs tests/axis-phase2a-walk-forward.mjs
```

- [ ] **Step 3: Run full and mandatory preservation regressions**

```bash
npm test
node --test tests/production-preservation.mjs
node --test tests/collector-batch-v3.mjs
node tests/collector-preservation.mjs
node tests/store-analysis-evidence-view.mjs
node tests/store-optimization-research.mjs
node --test tests/ui-home-jobs.mjs
```

Any protected regression failure is a blocker; do not weaken tests.

- [ ] **Step 4: Document exact algorithm/config and test evidence**

Record fixed config, exact ensemble evidence isolation, per-target worker preservation, chronology guarantees, and current status `research-only / no Production recommendation`.

- [ ] **Step 5: Commit Task 5**

Commit documentation and any test-only verification artifacts required by the repository.

---

### Task 6: Freeze and Open an Untouched Final Holdout

**Files:**
- Create: `research/axis-auto-selector/phase2b-holdout-lock.json`
- Create after opening results: `docs/axis-auto-selector/PHASE2B-HOLDOUT-REPORT.md`

**Interfaces:**
- Consumes: fixed implementation commit/config and an untouched store/period from the existing backup.
- Produces: immutable holdout lock followed by one no-retuning final evidence report.

- [ ] **Step 1: Select untouched holdout without evaluating Phase 2B metrics**

Prefer stores not used in the Green / Jias Ofuna / Seven S Kawasaki design study and with enough usable history to support repeated exact-ensemble evidence. Record selected store/period identifiers before running Phase 2B outcome aggregation.

- [ ] **Step 2: Write holdout lock artifact**

```json
{
  "schema":"jugest-axis-phase2b-holdout-lock-v1",
  "algorithm":"operational-oos-gate-v1",
  "config":{"minEvidenceDays":12,"windowEligibleDays":24,"releaseScore":0.002,"keepScore":0,"uncertaintyPenalty":0.12},
  "implementationCommit":"<actual branch commit SHA>",
  "holdout":{"stores":["<selected untouched store>"],"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"},
  "inputHashes":{"bundlePartitionSha256":"<actual SHA-256>"}
}
```

Replace every angle-bracket value with an actual resolved value before committing; the committed file must contain no placeholder text.

- [ ] **Step 3: Commit the holdout lock before opening results**

After this commit, do not change gate thresholds/algorithm based on the locked holdout.

- [ ] **Step 4: Run locked point-in-time replay and Phase 2B walk-forward**

Use the existing Fast Runner with per-target worker recycle to generate the locked historical bundle, then run the fixed Phase 2B walk-forward and report.

- [ ] **Step 5: Verify sequential parity on at least the latest two locked targets**

Recompute those targets sequentially with current JUGEST replay and require exact sample/source-signature parity.

- [ ] **Step 6: Write holdout report and commit**

Report control, ungated selector, operational gate deltas, allowed/blocked counts, prevented-loss/missed-gain counterfactual counts, and parity evidence. If the gate fails, record `NO-GO`; do not retune against this holdout.
