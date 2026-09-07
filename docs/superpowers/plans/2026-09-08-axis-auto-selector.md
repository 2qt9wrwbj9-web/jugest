# JUGEST Axis Auto-Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a leakage-safe, sparse, per-store shadow ensemble selector that evaluates only approved JUGEST analysis axes, persists a separate shadow champion, and never changes the current visible ranking in Phase 1.

**Architecture:** Keep the current v4.7.6-v4.7.8 hybrid ranking untouched as the control. Add pure Node-compatible research/shadow modules that consume existing prediction-row signals, evaluate them chronologically, search bounded non-negative weight combinations, apply conservative adoption gates, and emit a separately persisted shadow profile/audit artifact. Use the current runtime only through an adapter/callback in tests and research; do not extract or rewrite protected mathematics unless semantic parity can be demonstrated first.

**Tech Stack:** Node.js >=20, ESM, `node:test`, `node:assert/strict`, `node:crypto`; no new runtime dependencies in Phase 1.

**Spec:** `docs/superpowers/specs/2026-09-08-axis-auto-selector-design.md`

## Global Constraints

- Base is `preview/v512-collector-batch` @ `273ed61ed2019365ae1b38d76288f20e9625c9e1`.
- Work only on `astra/axis-auto-selector-shadow` or an isolated worktree/child branch from it.
- Phase 1 is shadow-only. Current user-visible ranking must be semantically identical with shadow disabled.
- Do not change `externalJudge`, Juggler/HANA probability tables, strict Champion, Calibration, store-share constraint, single-evidence arithmetic/eligibility, HANA hard constraints, parser identity/sanity, Device Sync semantics, Collector V3 semantics, or current ranking math.
- Existing `v4HybridDayUtility`, `v4HybridEvaluate`, `v4HybridOptimizeSamples`, `v4HybridPrepareSignals`, `v4HybridApplyWeights`, `v4HybridRetrain`, and `v4PredictStore` are the behavioral reference, not code to casually rewrite.
- Existing research chronology guard in `research/store-optimization.mjs` is a second reference for point-in-time isolation and poisoning tests.
- No new npm dependency unless unavoidable and explicitly justified; default is zero dependencies.
- No Production deployment, Production alias change, or `main` promotion. Preview is allowed only for verification.
- If a protected mathematical change becomes necessary, stop and report rather than changing it.

## Sol-decided Phase 1 defaults

These are deliberately conservative shadow defaults; Phase 2 historical evidence may recommend changing them before any ranking promotion.

```js
export const AXIS_SELECTOR_DEFAULTS = Object.freeze({
  maxActiveAxes: 4,
  minEvaluatedDays: 24,
  minTrainDays: 12,
  minValidationDays: 6,
  minHoldoutDays: 6,
  split: Object.freeze({train: .50, validation: .25, holdout: .25}),
  weightStep: .10,
  minAxisAvailability: .80,
  validationMinAdvantage: .005,
  holdoutMinAdvantage: .002,
  holdoutMinWinRate: .55,
  maxCandidateEnsembles: 25000
});
```

Initial registry policy:

- `practical-v1`: approved; exact source is current `row.practicalSignal`.
- `model-v1`: approved; exact source is current `row.modelSignal`.
- `strict-v1`: approved; exact source is current `row.strictSignal`.
- `calendar-v1`: present as a candidate descriptor but `approved:false` until Astra proves point-in-time safety and non-duplicative treatment versus the existing model/calendar paths. Do not force a fourth active axis.
- Existing `row.hybridValidatedBonus` remains part of the control score exactly as today. In the initial 3-axis shadow candidate, preserve it as the same fixed capped bonus outside normalized weights so candidate-vs-control comparison is fair. Do not count it twice.

Control/fallback definitions:

- **Current control:** ranking/score produced by current JUGEST `v4PredictStore` with its stored current hybrid profile/fallback behavior.
- **Conservative fallback:** current 55/30/15 practical/model/strict mixture plus the current validated-calendar bonus behavior.
- A candidate shadow champion must beat both where metrics are available.

---

### Task 1: Capture immutable behavioral baselines before implementation

**Files:**
- Create: `tests/fixtures/axis-auto-selector-baseline.json`
- Create: `tests/axis-auto-selector-parity.mjs`
- Read only: `index.html`, `tests/helpers/runtime.mjs`, `tests/production-preservation.mjs`, `docs/collector-batch/protected-hashes.json`

**Interfaces:**
- Consumes: current `window.V4_TEST.predictStore`, `hybridEvaluate`, `hybridNormWeights`, `hybridStoredWeights` from the untouched base runtime.
- Produces: a deterministic fixture containing representative current control outputs and a parity test that future tasks must keep green.

- [ ] **Step 1: Verify the implementation worktree starts from the expected commit**

Run:

```bash
git rev-parse HEAD
git status --short
```

Expected before implementation: branch/worktree descends from `61fd208f6134429ddc135c20f12140e695b740ee`; working tree clean.

- [ ] **Step 2: Write a parity fixture generator as temporary test code**

Use `tests/helpers/runtime.mjs` to boot the current runtime and construct deterministic synthetic store history with enough rows/days to call current prediction/hybrid helpers. Capture only stable plain JSON fields needed for parity: normalized 55/30/15 weights, utility/evaluation outputs on fixed synthetic samples, and prediction row ordering/signals if the current runtime fixture can produce them without network/global nondeterminism.

The committed fixture must include:

```json
{
  "baseCommit": "273ed61ed2019365ae1b38d76288f20e9625c9e1",
  "fallbackWeights": {"practical":0.55,"model":0.30,"strict":0.15},
  "utilityCases": [],
  "predictionCases": []
}
```

- [ ] **Step 3: Write `tests/axis-auto-selector-parity.mjs`**

At minimum assert:

```js
assert.deepEqual(plain(ctx.V4_TEST.hybridNormWeights({practical:.55,model:.30,strict:.15})), baseline.fallbackWeights);
// For every captured utility case, current V4_TEST.hybridEvaluate must remain exactly equal.
// For every captured prediction case, visible current rank/aimScore/hybridScore ordering must remain equal.
```

The test must not call any future shadow module yet; it freezes the control first.

- [ ] **Step 4: Run the parity test and the existing protected test**

Run:

```bash
node tests/axis-auto-selector-parity.mjs
node --test tests/production-preservation.mjs
```

Expected: PASS before feature code exists.

- [ ] **Step 5: Commit baseline evidence**

```bash
git add tests/fixtures/axis-auto-selector-baseline.json tests/axis-auto-selector-parity.mjs
git commit -m "test: capture axis selector control baseline"
```

---

### Task 2: Add the validated axis registry and JUGEST row adapter

**Files:**
- Create: `research/axis-auto-selector/registry.mjs`
- Create: `research/axis-auto-selector/jugest-adapter.mjs`
- Test: `tests/axis-auto-selector-registry.mjs`

**Interfaces:**
- Produces: `createAxisRegistry(definitions?)`, `DEFAULT_AXIS_DEFINITIONS`, `axisSignalsFromPredictionRow(row, registry)`.
- Row contract consumed by later tasks:

```js
{
  key: "machine|tableNo",
  controlRank: Number,
  controlScore: Number,
  fixedBonus: Number,
  axes: {"practical-v1": Number|null, "model-v1": Number|null, "strict-v1": Number|null},
  actualES: Number|null,
  actualP4: Number|null
}
```

- [ ] **Step 1: Write failing registry tests**

Cover duplicate IDs, invalid versions, out-of-range maxWeight, unknown correlation group metadata, approved filtering, and the exact default policy:

```js
assert.equal(registry.get('practical-v1').approved, true);
assert.equal(registry.get('model-v1').approved, true);
assert.equal(registry.get('strict-v1').approved, true);
assert.equal(registry.get('calendar-v1').approved, false);
```

Adapter tests must assert exact mapping:

```js
assert.equal(out.axes['practical-v1'], row.practicalSignal);
assert.equal(out.axes['model-v1'], row.modelSignal);
assert.equal(out.axes['strict-v1'], row.strictSignal);
assert.equal(out.fixedBonus, row.hybridValidatedBonus || 0);
```

- [ ] **Step 2: Run tests to confirm RED**

```bash
node --test tests/axis-auto-selector-registry.mjs
```

Expected: module-not-found or missing export failure.

- [ ] **Step 3: Implement the registry minimally**

Default definitions must be immutable. Suggested shape:

```js
export const DEFAULT_AXIS_DEFINITIONS = Object.freeze([
  Object.freeze({id:'practical-v1',label:'Practical single evidence',version:1,approved:true,correlationGroup:'practical',maxWeight:1}),
  Object.freeze({id:'model-v1',label:'Model/root',version:1,approved:true,correlationGroup:'model',maxWeight:1}),
  Object.freeze({id:'strict-v1',label:'Strict calibrated',version:1,approved:true,correlationGroup:'strict',maxWeight:1}),
  Object.freeze({id:'calendar-v1',label:'Validated calendar',version:1,approved:false,correlationGroup:'calendar-model',maxWeight:.20})
]);
```

`calendar-v1` must return unavailable/null unless later explicitly enabled after its audit task; it must not silently enter auto-selection.

- [ ] **Step 4: Implement the adapter without changing `index.html`**

The adapter accepts already-produced current prediction rows and maps fields. It must not reimplement `practicalSignal`, `modelSignal`, or `strictSignal` formulas.

- [ ] **Step 5: Run registry tests**

```bash
node --test tests/axis-auto-selector-registry.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add research/axis-auto-selector/registry.mjs research/axis-auto-selector/jugest-adapter.mjs tests/axis-auto-selector-registry.mjs
git commit -m "feat: add approved shadow axis registry"
```

---

### Task 3: Build the leakage-safe chronological evaluator and control-parity utility

**Files:**
- Create: `research/axis-auto-selector/evaluator.mjs`
- Create: `tests/axis-auto-selector-evaluator.mjs`
- Reuse concepts from: `research/store-optimization.mjs`
- Read-only parity reference: current `v4HybridDayUtility` / `v4HybridEvaluate` via `window.V4_TEST`

**Interfaces:**
- Produces: `scoreDay(rows, weights)`, `evaluatePeriod(samples, weights)`, `splitChronologically(samples, config)`, `validatePointInTimeSamples(samples)`, `sourceSignature(samples)`.
- Sample contract:

```js
{
  targetDate:'YYYY-MM-DD',
  trainingCutoff:'YYYY-MM-DD',
  sourceSignature:'sha256...',
  rows:[/* adapter row contract */]
}
```

- [ ] **Step 1: Write failing utility parity tests**

`scoreDay` must preserve current utility semantics:

```js
// Rank by weighted practical/model/strict + fixedBonus.
// Compute store baseline ES/P4.
// Top3/5/10 lift weights are .45/.35/.20.
// Combined utility is .72*esLift + .28*(p4Lift*3).
```

Compare fixed synthetic cases against current `V4_TEST.hybridEvaluate` from Task 1.

- [ ] **Step 2: Add a synthetic future-poisoning test before implementation**

Create data where reading target/future outcome inside the predictor would make one axis perfectly rank the winning table. Assert evaluator input for target `D` contains only provenance/signals generated with `trainingCutoff < D`, and changing outcomes on `D` or later cannot change the previously captured axis-score bundle/hash for `D`.

Also reject:

```js
trainingCutoff >= targetDate
unsorted/duplicate target dates
non-finite actual outcomes
future-dated provenance
mutable shared sample objects if the evaluator exposes them to callbacks
```

- [ ] **Step 3: Run to verify RED**

```bash
node --test tests/axis-auto-selector-evaluator.mjs
```

- [ ] **Step 4: Implement immutable chronological validation**

Use `structuredClone` + deep freeze for callback-facing structures, following `research/store-optimization.mjs`. Never let outcome fields participate in score generation; the evaluator only receives already-frozen axis scores plus later outcomes for scoring.

- [ ] **Step 5: Implement exact utility and metrics**

Return at minimum:

```js
{
  score,
  mean,
  sd,
  winRate,
  n,
  top3:{es,p4},
  top5:{es,p4},
  top10:{es,p4}
}
```

Use the same stability penalty and win-rate adjustment as current `v4HybridEvaluate` when producing the reference `score`:

```js
score = mean - .12 * sd / Math.sqrt(Math.max(1,n)) + .035 * (winRate - .5)
```

- [ ] **Step 6: Implement the default 50/25/25 chronological split**

For 24 eligible days, produce exactly 12 train / 6 validation / 6 holdout. For larger histories, preserve ordering and ensure every train date < every validation date < every holdout date. If any minimum cannot be met, return an explicit insufficient-history result; do not reshuffle.

- [ ] **Step 7: Run evaluator + legacy research chronology tests**

```bash
node --test tests/axis-auto-selector-evaluator.mjs
node tests/store-optimization-research.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add research/axis-auto-selector/evaluator.mjs tests/axis-auto-selector-evaluator.mjs
git commit -m "feat: add leakage-safe axis evaluator"
```

---

### Task 4: Implement bounded sparse ensemble search and adoption guards

**Files:**
- Create: `research/axis-auto-selector/selector.mjs`
- Create: `tests/axis-auto-selector-selector.mjs`

**Interfaces:**
- Consumes: registry + evaluator samples/splits.
- Produces: `generateWeightGrid(axisIds, config)`, `selectShadowEnsemble({samples,registry,control,fallback,config})`, `adoptionDecision(...)`.

- [ ] **Step 1: Write failing weight-grid tests**

Assert every generated candidate:

```js
weights.every(w => w >= 0)
Math.abs(sum(weights)-1) < 1e-12
activeAxes <= 4
candidateCount <= 25000
```

Tie breaking must be deterministic: higher train score, then fewer active axes, then lexicographic axis IDs/weights.

- [ ] **Step 2: Write failing approval/double-count tests**

- `approved:false` axis can never receive positive weight.
- Missing signal on more than 20% of eligible dates makes that axis ineligible under default config.
- Registry `correlationGroup` caps must be enforced if a group cap is declared.
- Duplicate axis IDs or duplicate aliases must not create extra voting weight.

For v1 defaults, practical/model/strict are distinct groups; `calendar-v1` remains disabled.

- [ ] **Step 3: Write adoption gate tests**

Use synthetic samples for all cases:

```js
// no adoption when current control wins
// no adoption when validation advantage < .005
// no adoption when holdout advantage < .002
// no adoption when holdout winRate < .55
// no adoption with <24 evaluated days
// adoption when candidate clearly beats control and fallback on validation + holdout
```

The returned decision must include machine-readable reasons, e.g.:

```js
{decision:'CONTROL', reasons:['validation_advantage_below_threshold']}
{decision:'SHADOW_CHAMPION', reasons:['all_gates_passed']}
```

- [ ] **Step 4: Run to verify RED**

```bash
node --test tests/axis-auto-selector-selector.mjs
```

- [ ] **Step 5: Implement bounded search**

With the initial three approved axes, `.10` simplex search is small. Keep the implementation general:

1. compute per-axis train availability/univariate audit,
2. deterministic prefilter if approved axes later exceed 8,
3. enumerate subsets up to 4,
4. enumerate `.10` normalized weights,
5. stop/trim deterministically before `maxCandidateEnsembles`,
6. choose on train only,
7. use validation for candidate acceptance/tuning gate,
8. inspect final holdout once for final shadow adoption.

Never use holdout to choose among candidate weights.

- [ ] **Step 6: Apply conservative shrinkage only after selection**

Shrink candidate weights toward `{practical:.55, model:.30, strict:.15}` according to support/advantage, but do not import the browser runtime function. If duplicating the current shrink formula, add exact parity cases from Task 1. If exact reuse is safely extractable without protected semantic changes, extraction is allowed only after the parity test is green before and after.

- [ ] **Step 7: Run selector/evaluator tests**

```bash
node --test tests/axis-auto-selector-selector.mjs tests/axis-auto-selector-evaluator.mjs tests/axis-auto-selector-registry.mjs
```

- [ ] **Step 8: Commit**

```bash
git add research/axis-auto-selector/selector.mjs tests/axis-auto-selector-selector.mjs
git commit -m "feat: select guarded sparse shadow ensembles"
```

---

### Task 5: Add shadow profile schema, stale invalidation, and file persistence

**Files:**
- Create: `research/axis-auto-selector/profile.mjs`
- Create: `tests/axis-auto-selector-profile.mjs`

**Interfaces:**
- Produces: `createShadowProfile(input)`, `validateShadowProfile(profile, {sourceSignature,registry})`, `readShadowProfiles(path)`, `writeShadowProfiles(path, profiles)`.

- [ ] **Step 1: Write failing schema tests**

Required profile shape:

```js
{
  schema:'jugest-axis-shadow-v1',
  id:'sha256...',
  store:'...',
  sourceSignature:'...',
  trainedThrough:'YYYY-MM-DD',
  trainedAt:'ISO timestamp',
  decision:'SHADOW_CHAMPION'|'CONTROL',
  selectedAxes:[{id,version,weight}],
  train:{...}, validation:{...}, holdout:{...},
  control:{validation:{...},holdout:{...}},
  fallback:{validation:{...},holdout:{...}},
  evaluationDates:{train:[],validation:[],holdout:[]},
  integrity:{futureLeakage:false,allAxesApproved:true,deterministic:true},
  reasons:[]
}
```

- [ ] **Step 2: Write stale/registry-version tests**

Reject/invalidate if:

```js
profile.sourceSignature !== currentSourceSignature
selected axis missing from registry
axis version differs
selected axis is no longer approved
weights do not sum to 1
```

Return a safe invalid result; never silently reuse stale profile.

- [ ] **Step 3: Run RED**

```bash
node --test tests/axis-auto-selector-profile.mjs
```

- [ ] **Step 4: Implement atomic file persistence for Phase 1**

Write to `path.tmp`, fsync/close, then rename to final path. JSON file storage is intentionally separate from existing browser `v4HybridProfiles`; do not modify browser save/restore or Device Sync in Phase 1.

- [ ] **Step 5: Run tests**

```bash
node --test tests/axis-auto-selector-profile.mjs
```

- [ ] **Step 6: Commit**

```bash
git add research/axis-auto-selector/profile.mjs tests/axis-auto-selector-profile.mjs
git commit -m "feat: persist isolated shadow champion profiles"
```

---

### Task 6: Add shadow orchestration and a headless CLI harness

**Files:**
- Create: `research/axis-auto-selector/shadow.mjs`
- Create: `scripts/axis-auto-selector.mjs`
- Create: `tests/fixtures/axis-auto-selector-sample.json`
- Create: `tests/axis-auto-selector-cli.mjs`

**Interfaces:**
- Produces: `runShadowEvaluation({store,samples,registry,config,profilePath})`, `rankShadowRows(rows, profile, registry)`.
- CLI contract:

```bash
node scripts/axis-auto-selector.mjs \
  --input tests/fixtures/axis-auto-selector-sample.json \
  --store A \
  --through 2026-09-01 \
  --profile /tmp/jugest-axis-profiles.json \
  --output /tmp/jugest-axis-audit.json \
  --shadow
```

- [ ] **Step 1: Write failing end-to-end shadow tests**

Assert output contains per row:

```js
{
  key,
  controlRank,
  shadowRank,
  controlScore,
  shadowScore,
  contributions:{'practical-v1':..., 'model-v1':..., 'strict-v1':...},
  weights:{...},
  disagreement,
  profileId
}
```

Also assert calling the shadow orchestrator does not mutate source rows/samples.

- [ ] **Step 2: Write CLI failure tests**

Reject missing `--shadow`, invalid date, missing store, malformed input, target/future provenance violation, and a profile path that cannot be safely written.

- [ ] **Step 3: Run RED**

```bash
node --test tests/axis-auto-selector-cli.mjs
```

- [ ] **Step 4: Implement orchestration**

Flow:

```js
validate samples
-> split chronologically
-> evaluate current control/fallback
-> select bounded candidate
-> run adoption gates
-> create isolated shadow profile
-> rank latest provided pre-outcome rows using shadow profile
-> write profile + audit output
```

Phase 1 input is a normalized sample bundle. Do not pretend that the current browser `index.html` is already a reusable server-side judgment engine. Full source-data-to-signal generation is a later VPS/core extraction task.

- [ ] **Step 5: Implement deterministic CLI**

No network calls. Print a one-line summary and write structured JSON audit. Exit nonzero on integrity failure.

- [ ] **Step 6: Run CLI tests and a manual sample command**

```bash
node --test tests/axis-auto-selector-cli.mjs
node scripts/axis-auto-selector.mjs --input tests/fixtures/axis-auto-selector-sample.json --store A --through 2026-09-01 --profile /tmp/jugest-axis-profiles.json --output /tmp/jugest-axis-audit.json --shadow
```

Expected: PASS / exit 0; audit explicitly says `shadowOnly:true`.

- [ ] **Step 7: Commit**

```bash
git add research/axis-auto-selector/shadow.mjs scripts/axis-auto-selector.mjs tests/fixtures/axis-auto-selector-sample.json tests/axis-auto-selector-cli.mjs
git commit -m "feat: add headless shadow selector harness"
```

---

### Task 7: Prove current JUGEST semantic parity and bounded runtime cost

**Files:**
- Modify: `tests/commands.json` to add the new focused test commands only after they pass independently.
- Create: `tests/axis-auto-selector-runtime-parity.mjs`
- Create: `docs/axis-auto-selector/PHASE1-REPORT.md`
- Create: `docs/axis-auto-selector/performance.json`
- Do not modify `index.html`, `app-v510.js`, `core-v510.js`, Collector runtime, or Device Sync merely to expose Phase 1 UI.

**Interfaces:**
- Consumes all new modules/tests.
- Produces final Phase 1 evidence and an Astra handoff/report suitable for Sol review.

- [ ] **Step 1: Write runtime parity test against current VM runtime**

Boot with `tests/helpers/runtime.mjs`. For deterministic store fixtures, call current `V4_TEST.predictStore` before any shadow calculation, run shadow modules on copied row signals, then call `V4_TEST.predictStore` again. Assert current visible fields are unchanged byte-for-byte/plain-JSON-equivalent:

```js
['rank','aimScore','hybridScore','predP4','predES','practicalSignal','modelSignal','strictSignal']
```

Assert existing `v4HybridProfiles` storage is not modified by Phase 1 shadow execution.

- [ ] **Step 2: Run focused new tests**

```bash
node --test \
  tests/axis-auto-selector-parity.mjs \
  tests/axis-auto-selector-registry.mjs \
  tests/axis-auto-selector-evaluator.mjs \
  tests/axis-auto-selector-selector.mjs \
  tests/axis-auto-selector-profile.mjs \
  tests/axis-auto-selector-cli.mjs \
  tests/axis-auto-selector-runtime-parity.mjs
```

Expected: all PASS.

- [ ] **Step 3: Add new test commands to `tests/commands.json`**

Prefer one combined command for the Node test files plus one CLI/syntax command if necessary; do not inflate the suite with redundant commands.

- [ ] **Step 4: Run the full existing regression suite**

```bash
npm test
```

The pre-feature checkpoint had 64/64 commands PASS, 33 Collector tests, 20 protected hashes, and 5 jitter exact files. The total command count may increase only by the newly added selector command(s); every existing command must still pass.

Also run explicitly:

```bash
node --test tests/production-preservation.mjs
node --test tests/collector-batch-v3.mjs
node tests/collector-preservation.mjs
node tests/store-analysis-evidence-view.mjs
node tests/store-optimization-research.mjs
node --test tests/ui-home-jobs.mjs
```

- [ ] **Step 5: Measure bounded performance**

On the deterministic fixture and a larger synthetic 180-day fixture, record:

```json
{
  "evaluatedDates": 0,
  "axisCount": 0,
  "candidateEnsembles": 0,
  "elapsedMs": 0,
  "rssBefore": 0,
  "rssAfter": 0,
  "heapUsedPeakApprox": 0
}
```

Fail the test/harness if candidate count exceeds `25000`. Do not invent a hard latency pass/fail threshold in Phase 1; report measured values for Phase 2/VPS sizing.

- [ ] **Step 6: Write `PHASE1-REPORT.md`**

Document:

1. changed files,
2. exact initial axis registry and approval status,
3. leakage tests and poisoning result,
4. train/validation/holdout behavior,
5. selector/adoption thresholds,
6. control/fallback comparison,
7. shadow profile schema,
8. runtime parity proof,
9. full test results,
10. performance measurements,
11. whether `calendar-v1` was proven safe enough to remain a candidate or should be removed,
12. risks and Phase 2 historical-evidence plan.

- [ ] **Step 7: Verify diff scope**

```bash
git diff --name-status 61fd208f6134429ddc135c20f12140e695b740ee...HEAD
git status --short
```

Expected: only Axis Auto-Selector research/shadow modules, tests/fixtures, commands, and docs. Any protected/runtime file change requires explicit explanation and parity evidence; unnecessary protected changes must be reverted.

- [ ] **Step 8: Commit final evidence**

```bash
git add tests/commands.json tests/axis-auto-selector-runtime-parity.mjs docs/axis-auto-selector
git commit -m "test: verify shadow axis selector parity and performance"
```

---

## Astra stop conditions

Stop and report instead of proceeding if any of these occur:

- Current visible ranking must change to make shadow evaluation work.
- A target/future outcome is required to generate an axis signal.
- `calendar-v1` cannot be separated from already-counted model/context evidence without double counting.
- Protected math tests require weakening or deleting assertions.
- Collector V3 tests regress.
- Existing `research/store-optimization.mjs` chronology/poisoning guarantees regress.
- Shadow profile cannot be kept separate from existing `v4HybridProfiles` in Phase 1.
- Production/main promotion would be required.

## Phase 1 completion definition

Phase 1 is complete only when:

- the core runs headlessly in Node,
- only approved axes may be selected,
- future/target leakage poisoning tests pass,
- candidate search is bounded and deterministic,
- train/validation/final-holdout are chronologically isolated,
- a superior synthetic candidate can become a `SHADOW_CHAMPION`, while weak/control-losing candidates abstain,
- stale profiles invalidate safely,
- current JUGEST prediction outputs remain semantically unchanged,
- all existing regressions pass,
- a performance/audit report is committed,
- no Production deployment occurred.
