# PRE v2 Live Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement PRE v2's protected, testable evaluation core: payout-derived relevance, linear-gain NDCG@10/@5, anytime-valid weak-null sequential Champion comparison, per-store-lineage alpha spending, and persisted formal-trial state without changing the existing production comparison path yet.

**Architecture:** Add focused pure modules under `vps/src/research/pre-v2/` and a small persistence layer. Existing `vps/src/research/live-comparison.mjs` remains behaviorally unchanged in this phase; PRE v2 consumes explicit daily score deltas and trial state through new APIs. The sequential test uses a finite equal-weight mixture of valid fixed-lambda sub-exponential e-processes for the Choe–Ramdas weak null, with bounded daily NDCG differences in [-1,1], scale c=2, predictable lagged-running-mean centering, and one-sided thresholds.

**Tech Stack:** Node.js >=22.13, ES modules, `node:test`, built-in SQLite via the existing database layer; no new runtime dependency.

**Spec:** Notion page `JUGEST PRE v2 設計メモ（継続更新）`, especially the implementation handoff master spec and the 2026-09-17 mathematical audit/closure sections.

## Global Constraints

- Do not modify protected setting-discrimination mathematics.
- PRE v2 target is next-day setting allocation/ranking, not next-day diff coins.
- Top10 is the primary metric; Top5 is a degradation safety gate.
- Top10/Top5 use linear-gain NDCG with log2 rank discount.
- Setting relevance is payout-derived with setting 1 as zero: `R_s = P_s - P_1`.
- Juggler uses the accepted eight-machine representative scale; normal HANA excludes New King Hanahana V; New King V uses its own five-stage scale.
- Formal historical/live evaluation must use only information available before the target day.
- Formal trial risk is controlled per store Champion lineage with lifetime alpha 0.05 and `alpha_k = 0.05 / (k * (k + 1))`, where k counts every formal trial start.
- Do not deploy to production in this plan.
- Existing `live-comparison.mjs` output semantics must remain unchanged in this phase.

---

### Task 1: PRE v2 relevance and ranking metrics

**Files:**
- Create: `vps/src/research/pre-v2/relevance.mjs`
- Create: `vps/src/research/pre-v2/ndcg.mjs`
- Test: `vps/tests/pre-v2-relevance-ndcg.test.mjs`

**Interfaces:**
- Produces: `JUGGLER_PAYOUT_BY_SETTING`, `HANA_PAYOUT_BY_SETTING`, `NEW_KING_V_PAYOUT_BY_SETTING`, `relevanceScaleForFamily()`, `expectedRelevance()`, `linearNdcg()`, `pairedNdcgDelta()`.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {relevanceScaleForFamily, expectedRelevance} from '../src/research/pre-v2/relevance.mjs';
import {linearNdcg, pairedNdcgDelta} from '../src/research/pre-v2/ndcg.mjs';

test('Juggler relevance has setting 1 at zero and preserves accepted payout gaps', () => {
  const r = relevanceScaleForFamily('juggler');
  assert.equal(r['1'], 0);
  assert.ok(Math.abs(r['6'] - 11.27125) < 1e-9);
});

test('New King V uses its dedicated five-stage relevance scale', () => {
  assert.deepEqual(relevanceScaleForFamily('new_king_v'), {1:0,2:2,3:4,4:7,V:11});
});

test('expected relevance uses the full posterior without rounding', () => {
  assert.equal(expectedRelevance({1:0.5,6:0.5}, 'juggler'), 11.27125 / 2);
});

test('linear NDCG gives a perfect ranking 1 and reversals less than 1', () => {
  const truth = new Map([['a',3],['b',2],['c',1]]);
  assert.equal(linearNdcg(['a','b','c'], truth, 3).score, 1);
  assert.ok(linearNdcg(['c','b','a'], truth, 3).score < 1);
});

test('IDCG zero is stored as non-informative and formal paired delta is zero', () => {
  const truth = new Map([['a',0],['b',0]]);
  const result = pairedNdcgDelta(['a','b'], ['b','a'], truth, 2);
  assert.equal(result.informative, false);
  assert.equal(result.delta, 0);
});
```

- [ ] **Step 2: Run `node --test tests/pre-v2-relevance-ndcg.test.mjs` from `vps/` and verify RED because the modules do not exist.**

- [ ] **Step 3: Implement the accepted payout masters and pure linear-gain NDCG functions.**

```js
export function expectedRelevance(posterior, family) {
  const scale = relevanceScaleForFamily(family);
  return Object.entries(posterior).reduce((sum,[setting,p]) => sum + Number(p || 0) * Number(scale[setting] ?? 0), 0);
}
```

`linearNdcg()` must use `1 / Math.log2(rank + 1)`, `kEff = Math.min(k, rankedKeys.length, truth.size)`, and return `{score:null, informative:false, idcg:0}` when IDCG is zero. `pairedNdcgDelta()` must return formal `delta:0` in that case while preserving the diagnostic null scores.

- [ ] **Step 4: Re-run the focused test and verify GREEN.**
- [ ] **Step 5: Run full `npm test` from `vps/`.**

---

### Task 2: Lifetime alpha spending and weak-null sequential e-process

**Files:**
- Create: `vps/src/research/pre-v2/sequential.mjs`
- Test: `vps/tests/pre-v2-sequential.test.mjs`

**Interfaces:**
- Produces: `alphaForTrial(k)`, `createSequentialState()`, `updateSequentialState(state, delta)`, `promotionEvidence(state, alpha)`, `safetyEvidence(state, alpha)`.

- [ ] **Step 1: Write failing tests for alpha summation, bounds, predictable centering, deterministic fixtures, and serialization/resume.**

```js
test('lifetime alpha allocation sums to 0.05', () => {
  let sum = 0;
  for (let k=1;k<=100000;k+=1) sum += alphaForTrial(k);
  assert.ok(sum < 0.05 && 0.05 - sum < 1e-6);
});

test('daily deltas outside [-1,1] are rejected', () => {
  assert.throws(() => updateSequentialState(createSequentialState(), 1.0001));
});

test('state can be JSON round-tripped without changing the next update', () => {
  const a = [0.2,-0.1,0.3].reduce(updateSequentialState, createSequentialState());
  const restored = JSON.parse(JSON.stringify(a));
  assert.deepEqual(updateSequentialState(restored, 0.1), updateSequentialState(a, 0.1));
});
```

Add a numeric reference fixture for deltas `[0.20,-0.10,0.30,0.15,-0.05,0.25]`, using the fixed lambda grid exported by the module, and assert `logE`/`eValue` to 1e-12 against an independently generated reference.

- [ ] **Step 2: Verify RED.**

- [ ] **Step 3: Implement a finite mixture of fixed-lambda weak-null e-processes.**

For each lambda `0 < lambda < 1/c` with `c=2`, update

```js
psi = (-Math.log(1 - c * lambda) - c * lambda) / (c * c);
logE_j = lambda * cumulativeSum - psi * cumulativeIntrinsicTime;
```

with predictable center `gamma_t = runningMean(delta_1..delta_{t-1})`, `gamma_1=0`, and intrinsic increment `(delta_t - gamma_t)^2`. Combine the fixed-lambda e-processes with an equal-weight log-sum-exp mixture. Keep all calculations in log-space and expose the clipped display e-value separately from the unclipped log evidence used for threshold comparison.

Use a version-frozen grid entirely below 0.5, e.g. `[0.025,0.05,0.10,0.20,0.30,0.40,0.475]`; the grid is part of the scorer version and may not adapt using future outcomes.

- [ ] **Step 4: Verify GREEN and compare the fixed-lambda components against the Choe–Ramdas `comparecast.eprocess_expm(..., lambda_=...)` formula for the same deltas, c=2.**
- [ ] **Step 5: Run full VPS tests.**

---

### Task 3: Formal PRE v2 trial state and Top10/Top5 decision gate

**Files:**
- Create: `vps/src/research/pre-v2/trial.mjs`
- Test: `vps/tests/pre-v2-trial.test.mjs`

**Interfaces:**
- Produces: `startFormalTrial()`, `applyFormalDay()`, `formalTrialDecision()`.
- Consumes: Task 2 sequential state.

- [ ] **Step 1: Write failing tests that prove:**
  - trial number k fixes promotion alpha at start;
  - promotion requires Top10 e-value crossing `1/alpha_k`;
  - a Top5 degradation crossing blocks the Challenger;
  - no Top5 degradation evidence does not require equivalence proof;
  - IDCG-zero formal days update both deltas as zero;
  - a completed/blocked trial cannot be updated further.

- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement the minimal immutable-state transition functions.**
- [ ] **Step 4: Verify GREEN.**
- [ ] **Step 5: Run full VPS tests.**

Top5 safety uses the same weak-null engine in the degradation direction (`x_t = -D5_t`). In this initial phase the safety test is one-sided at 0.05 within each formal trial; it does not spend from the promotion lineage alpha because a false safety block preserves the incumbent rather than causing a false Champion promotion. Save its evidence and crossing time for diagnostics.

---

### Task 4: Persist formal trial state without activating it

**Files:**
- Modify: `vps/src/schema.mjs`
- Create: `vps/src/research/pre-v2/trial-store.mjs`
- Test: `vps/tests/pre-v2-trial-store.test.mjs`

**Interfaces:**
- Produces DB helpers `nextTrialNumber()`, `createTrialRecord()`, `loadTrialRecord()`, `appendTrialDay()`, `saveTrialState()`.

- [ ] **Step 1: Write failing migration/persistence tests.**
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Add append-only day evidence plus current serialized state.**

Schema must include a formal-trial table keyed by `(store_id,lineage_id,trial_number)` and a day table keyed by trial + target date. Persist scorer/e-process version, alpha, Champion/Challenger fingerprints, predeclared machine-set hash, Top10/Top5 deltas, informative flags, evidence state JSON, decision, and timestamps.

- [ ] **Step 4: Verify GREEN.**
- [ ] **Step 5: Run full VPS tests and confirm existing schema migrations remain idempotent.**

---

### Task 5: Reference-vector regression and implementation boundary

**Files:**
- Create: `vps/tests/fixtures/pre-v2-sequential-reference.json`
- Create: `vps/tests/pre-v2-reference-vector.test.mjs`
- Update: `docs/superpowers/plans/2026-09-17-pre-v2-live-evaluation.md` only to mark completed verification commands/results.

**Interfaces:**
- Consumes Tasks 1-4.

- [ ] **Step 1: Generate frozen reference vectors from independent Python/R reference calculations using the published Choe–Ramdas fixed-lambda formula.**
- [ ] **Step 2: Write the regression test and verify it catches a deliberately perturbed expected value (RED), then restore the reference (GREEN).**
- [ ] **Step 3: Run `npm test` under `vps/` and the repository root workflow suite.**
- [ ] **Step 4: Confirm `vps/src/research/live-comparison.mjs` is byte-identical to the base branch; PRE v2 is not yet wired to production execution.**
- [ ] **Step 5: Stop before deployment/integration. Report the implementation branch and test evidence to Hiro. Production wiring/deploy requires separate explicit approval.**
