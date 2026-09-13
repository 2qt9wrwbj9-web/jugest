# PRE Shadow Accuracy Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the new research store-read as PRE primary output, keep the current JUGEST store-reading path as a shadow baseline, score both on identical future data, and expose the live comparison under the existing top-left settings entry.

**Architecture:** Persist immutable per-engine prediction snapshots before the target day, score them later against the same canonical target-day `diff` outcome proxy, and expose deterministic aggregates through the authenticated VPS analytics API. The browser consumes `store-read-v1` first for Today Plan, falls back to the current path when unavailable, and adds `設定 > PRE版 精度比較` without changing protected setting-judgment math.

**Tech Stack:** Node.js ESM, built-in `node:test`, SQLite, existing JUGEST headless runtime adapter, existing VPS coordinator/job queue, Shadow DOM browser UI.

**Spec:** `docs/superpowers/specs/2026-09-13-pre-shadow-accuracy-comparison-design.md`

## Global Constraints

- Do not change Juggler or HANA probability tables.
- Do not change `externalJudge`, reverse judgment, posterior setting math, HANA hard constraints, strict Champion, Calibration, or store-share constraint.
- Do not change canonical raw-data retention, Collector contracts, or existing `DAILY_ANALYSIS` result semantics.
- The current JUGEST store-reading engine is the shadow source of truth; do not rewrite a simplified proxy for it.
- Backfilled walk-forward metrics and live PRE shadow metrics must remain separate.
- A prediction used for live evaluation must be immutable once target-day data can exist.
- PRE primary output may fall back to the current engine, but fallback days are excluded from new-vs-current wins/losses.
- Production deployment remains out of scope until Hiro gives separate explicit approval.

---

### Task 1: Immutable live prediction persistence and deterministic scorer

**Files:**
- Modify: `vps/src/schema.mjs`
- Create: `vps/src/research/live-comparison.mjs`
- Create: `vps/tests/live-comparison.test.mjs`

**Interfaces:**
- Produces: `persistLivePrediction(db, prediction) -> {inserted:boolean,row:object}`
- Produces: `listLivePredictions(db,{storeId,targetDate?,engine?}) -> object[]`
- Produces: `scorePredictionRows({predictionRows,outcomeRows}) -> metrics`
- Produces: `scoreLiveComparisonDay(db,{storeId,targetDate,outcomeRows,outcomeInputHash,nowIso}) -> comparison|null`
- Produces: `buildComparisonSummary(db,{storeId,limit=90}) -> payload`

- [ ] **Step 1: Write the failing persistence test**

Create an in-memory DB, insert one `pre_research` live prediction, repeat the same insert, then attempt a conflicting insert for the same live identity. Assert identical writes are idempotent and the first payload is preserved.

```js
const first=persistLivePrediction(db,{storeId:'s1',targetDate:'2026-09-14',engine:'pre_research',engineVersion:'store-read-v1',modelFingerprint:'fp-a',featureVersion:'store-features-v1',sourceFrontierDate:'2026-09-13',inputHash:'in-a',rankings:[{machineKey:'107',tableNo:'107',machineName:'マイジャグラーV',score:1,rank:1}],createdAt:'2026-09-13T12:00:00.000Z'});
assert.equal(first.inserted,true);
assert.equal(persistLivePrediction(db,{...first.input}).inserted,false);
```

Run: `cd vps && node --test tests/live-comparison.test.mjs`
Expected: FAIL because the schema/module are missing.

- [ ] **Step 2: Add prediction/score tables**

Add `store_prediction_snapshots` with a unique live identity and immutable payload/hash/frontier fields, plus `store_prediction_scores` keyed by `prediction_id`. Use `ON CONFLICT DO NOTHING`, never update an existing live prediction.

- [ ] **Step 3: Implement persistence helpers**

Use `canonicalJson/hashCanonical`, validate dates, normalize rankings to `{machineKey,tableNo,machineName,rank,score}`, and return the original row on a duplicate identity.

- [ ] **Step 4: Write failing metric tests**

Assert exact Top1/3/5 overlap, lift, Spearman, coverage, and that changing later-day data cannot change an already-targeted day.

- [ ] **Step 5: Implement scoring**

Return:

```js
{machineCount,coverage,top1:{overlap,rate,lift},top3:{overlap,rate,lift},top5:{overlap,rate,lift},rankCorrelation,quality}
```

with `quality = top3.lift*100 + top5.lift*10 + rankCorrelation` and `WIN_EPSILON=1e-6`. If an existing score has a different `outcome_input_hash`, keep the first score and expose `outcome_hash_conflict`.

- [ ] **Step 6: Implement aggregate summary**

`buildComparisonSummary()` returns live totals, recent-30 metrics, per-day rows, exclusions, and `historical:null`. Win/tie counts require both valid engines for the same date.

- [ ] **Step 7: Verify and commit**

Run: `cd vps && node --test tests/live-comparison.test.mjs`
Expected: PASS.

Commit: `feat: persist and score PRE shadow predictions`

---

### Task 2: Capture immutable PRE research predictions

**Files:**
- Modify: `vps/src/research/store-read-output.mjs`
- Create: `vps/tests/store-read-live.test.mjs`

**Interfaces:**
- Consumes: `persistLivePrediction()` from Task 1.
- Produces: every valid `store-read-v1` refresh records the first immutable `pre_research` prediction for the target date.

- [ ] **Step 1: Write the failing capture test**

Activate/refresh an active research model for frontier `2026-09-13`; assert the client snapshot targets `2026-09-14` and exactly one `pre_research` live prediction is stored. Refresh the same target with changed scores and assert the live evaluation row remains the first one.

- [ ] **Step 2: Implement capture**

After the existing `client_snapshots` upsert in `persistStoreReadSnapshot()`, call `persistLivePrediction()` with `engine:'pre_research'`, `engineVersion:STORE_READ_VERSION`, the model fingerprint, feature version, frontier, deterministic input hash, and rankings. Do not change the existing client snapshot contract.

- [ ] **Step 3: Verify research/feature flow**

Run:

`cd vps && node --test tests/store-read-live.test.mjs tests/research-loop.test.mjs`

Expected: PASS.

- [ ] **Step 4: Commit**

Commit: `feat: capture live PRE research predictions`

---

### Task 3: Run the current JUGEST store-reading path as a low-priority shadow job

**Files:**
- Modify: `vps/src/analysis/runtime-adapter.mjs`
- Create: `vps/src/analysis/shadow-refresh-state.mjs`
- Create: `vps/src/jobs/shadow-predict.mjs`
- Modify: `vps/src/analysis/daily-analysis.mjs`
- Modify: `vps/src/coordinator.mjs`
- Modify: `vps/src/schema.mjs`
- Create: `vps/tests/shadow-predict.test.mjs`
- Modify: `vps/tests/analysis-runtime.test.mjs`
- Modify: `vps/tests/coordinator.test.mjs`
- Modify: `vps/tests/daily-analysis-worker.test.mjs`

**Interfaces:**
- Produces: `runExistingStorePlan({rootDir,shop,sourceStoreId,days,targetDate}) -> normalized ranking`
- Produces: `requestShadowPrediction(db,{storeId,frontierDate,nowIso}) -> {state,job}`
- New job type: `SHADOW_PREDICT`, priority `70`, size class `medium`, estimated lease `512 MiB`, max attempts `3`.

- [ ] **Step 1: Write failing runtime-adapter test**

Boot the real current runtime with canonical days ending `2026-09-13`, call `runExistingStorePlan(... targetDate:'2026-09-14')`, and assert imported days are strictly earlier than target and output rows are ordered `{machineKey,tableNo,machineName,rank,score}`.

- [ ] **Step 2: Extend runtime adapter**

Extract shared boot/import internals while preserving the public `runExistingStoreAnalysis()` output. `runExistingStorePlan()` calls the current bridge Today Plan path. Use current `aimScore` as score when available; otherwise use `-rank` only as an ordering value.

- [ ] **Step 3: Write failing coalescing test and add `shadow_refresh_state`**

Use one row per store with `requested_frontier_date`, `completed_frontier_date`, `active_job_id`, and `updated_at`. Assert one active job per store and newest frontier wins.

- [ ] **Step 4: Implement `shadow-refresh-state.mjs`**

Follow `feature-refresh-state.mjs`. Enqueue:

```js
{type:'SHADOW_PREDICT',priority:70,idempotencyKey:`shadow:${storeId}:current-v5:${frontierDate}`,payload:{storeId,targetFrontierDate:frontierDate,engineVersion:'current-v5'},sizeClass:'medium',estimatedLeaseMiB:512,maxAttempts:3}
```

- [ ] **Step 5: Write failing worker test**

Seed canonical data through `2026-09-13`, execute a shadow descriptor, and assert a `current_shadow` prediction for `2026-09-14` with frontier `2026-09-13`.

- [ ] **Step 6: Implement `shadow-predict.mjs`**

Copy the child telemetry/heartbeat pattern from `feature-build.mjs`, load max 180 valid days, trim to requested frontier, run `runExistingStorePlan()`, persist the live prediction, complete shadow refresh state, and emit task metrics.

- [ ] **Step 7: Schedule after operational analysis**

At successful `executeDailyAnalysis()` completion, request shadow work after the existing feature refresh request. Return additive `shadowJobId` only; do not change analysis snapshot semantics.

- [ ] **Step 8: Wire coordinator**

Add the worker mapping and include `SHADOW_PREDICT` in the bounded low-priority auxiliary/research concurrency set. A pending `DAILY_ANALYSIS` keeps precedence.

- [ ] **Step 9: Verify and commit**

Run:

`cd vps && node --test tests/analysis-runtime.test.mjs tests/shadow-predict.test.mjs tests/coordinator.test.mjs tests/daily-analysis-worker.test.mjs`

Expected: PASS.

Commit: `feat: run current store reading as PRE shadow`

---

### Task 4: Score completed target days and expose authenticated comparison API

**Files:**
- Create: `vps/src/analysis/comparison-refresh.mjs`
- Modify: `vps/src/analysis/daily-analysis.mjs`
- Modify: `vps/src/analytics-handler.mjs`
- Create: `vps/tests/comparison-refresh.test.mjs`
- Modify: `vps/tests/analytics-api.test.mjs`

**Interfaces:**
- Produces: `scoreAvailableComparisonDays(db,{storeId,throughDate,nowIso}) -> {scored,excluded}`
- API: `GET /api/vps/stores/:storeId/research/comparison?limit=90`

- [ ] **Step 1: Write failing comparison-refresh test**

Persist both engine predictions for `2026-09-14`, seed the canonical target day, and assert both scores use the exact same `outcomeInputHash`, future targets are untouched, and rerun is idempotent.

- [ ] **Step 2: Implement scoring refresh**

For each unscored prediction with `target_date <= throughDate`, load exactly that canonical target day, normalize `diff` into `outcomeScore`, hash one canonical scoring input, and score all available engines against that same object.

- [ ] **Step 3: Write failing API tests**

Assert unauthorized `401`, foreign store `403`, owner `200`, bounded `limit` 1..366, separate live/historical fields, model/version metadata, and per-day reason codes.

- [ ] **Step 4: Implement route**

Add the authenticated `research/comparison` handler using `buildComparisonSummary(db,{storeId,limit})`.

- [ ] **Step 5: Verify and commit**

Run: `cd vps && node --test tests/comparison-refresh.test.mjs tests/analytics-api.test.mjs`
Expected: PASS.

Commit: `feat: expose PRE shadow accuracy comparison`

---

### Task 5: Browser client, PRE primary Today Plan, and Settings accuracy screen

**Files:**
- Modify: `vps-browser-analytics.mjs`
- Modify: `app-v510.js`
- Modify: `app-v510.css`
- Create: `tests/ui-v512-pre-shadow.mjs`
- Modify: `tests/commands.json`

**Interfaces:**
- Browser client: `getStoreRead(shop)` and `getResearchComparison(shop,{limit=90})`.
- UI state: `settingsOpen`, `settingsScreen`, `comparisonResult`, `comparisonLoading`, `comparisonScope`.
- UI route: top-left settings button -> `PRE版 精度比較`.

- [ ] **Step 1: Write failing browser-client test inside `tests/ui-v512-pre-shadow.mjs`**

Assert `getStoreRead()` requests `/stores/:id/research/store-read` and `getResearchComparison(...,{limit:30})` requests `/stores/:id/research/comparison?limit=30` with existing auth headers.

- [ ] **Step 2: Implement client methods**

Reuse `resolveStore()` and `request()`; do not change authentication behavior.

- [ ] **Step 3: Write failing UI structure test**

Assert top-left settings exists without a sixth bottom-nav item, settings contains `PRE版 精度比較`, PRE marker is present, comparison contains summary/Top1/3/5/Spearman/recent30/loss/exclusion/debug sections, and Today Plan has research-primary/current-fallback labels.

- [ ] **Step 4: Implement Settings entry and comparison screen**

Wire the existing top-left slot as a gear button and add the settings comparison route. Render live scored days, side-by-side quality, wins/losses/ties, recent-30 delta, Top1/3/5, Spearman, biggest PRE losses, excluded days, and collapsed fingerprint/frontier/hash diagnostics.

- [ ] **Step 5: Make Today Plan research-first**

`runTodayPlan()` first calls `getStoreRead(activeStore)`. Use it only when `status==='ready'` and `targetDate===planDate`; render rank/table/machine/research score without mapping score into P4+/expected-setting. Otherwise call the existing bridge `getTodayPlan()` and label `source:'current_fallback'`.

- [ ] **Step 6: Add CSS and regression command**

Reuse existing panel/grid tokens, add only settings/comparison/PRE classes, keep `repeat(5,1fr)`, and append `node tests/ui-v512-pre-shadow.mjs` to `tests/commands.json`.

- [ ] **Step 7: Verify and commit**

Run: `npm test`
Expected: PASS including the new UI regression.

Commit: `feat: add PRE primary read and shadow comparison UI`

---

### Task 6: Full regression, protection audit, and deployment checkpoint

**Files:**
- Create: `docs/vps/PRE-SHADOW-ACCURACY-VERIFICATION.md`
- Modify: `WORK-CHECKPOINT.md`

**Interfaces:**
- Produces: reproducible verification report and deployment-candidate SHA. Does not deploy.

- [ ] **Step 1: Run full VPS suite**

Run: `cd vps && npm test`
Expected: all tests pass.

- [ ] **Step 2: Run full root suite**

Run: `npm test`
Expected: all commands in `tests/commands.json` pass.

- [ ] **Step 3: Compare protected behavior/files with the pre-feature checkpoint**

Compare implementation HEAD with `17520e29d7460ffeef3ccd7e4273c5f4aba68cb5`. Verify no changes to protected probability tables/judgment math. Intentional client changes are limited to PRE UI/routing plus the new VPS research/shadow infrastructure.

- [ ] **Step 4: Write verification report**

Record implementation SHA, exact test counts, schema additions, shadow priority/resource limits, future-leak/immutability proof, fallback behavior, protected audit, and `Production not deployed; awaiting Hiro approval`.

- [ ] **Step 5: Update checkpoint and commit**

Commit: `docs: verify PRE shadow accuracy candidate`

Stop here. Ask Hiro for explicit production deployment approval before changing `deploy/vps`, `main`, Vercel production, or the live VPS.
