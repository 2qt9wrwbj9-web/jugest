# Historical Shadow Walk-Forward Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replay every eligible stored store-day chronologically so PRE research and the current JUGEST Today Plan can be compared fairly without future leakage, while keeping LIVE shadow validation separate.

**Architecture:** Freeze one historical snapshot range per store, persist an isolated PRE simulation state that starts from `baselineModel()`, and advance it one target date per low-priority `HISTORICAL_COMPARE` child. The current engine runs through `runExistingStorePlan()` with the same target cutoff, both predictions are scored against one canonical target-day outcome, and the authenticated comparison endpoint exposes a separate historical summary used by a `LIVE / 過去検証` Settings view.

**Tech Stack:** Node.js ESM, SQLite, existing JUGEST headless runtime adapter, existing research `backtest` / `axis-discovery` / `model-search` modules, VPS queue/Coordinator/resource controls, browser ES modules, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-13-historical-shadow-walk-forward-design.md`

## Global Constraints

- For target date `D`, neither engine may receive canonical store data dated `D` or later before prediction.
- Historical PRE starts from `baselineModel()` and never reads live `research_champion` or `active_store_models` as its initial state.
- `canonical-diff-proxy-v1` remains an evaluation proxy, not a hidden-setting label.
- Historical rows remain separate from LIVE `store_prediction_snapshots` / `store_prediction_scores`.
- Seven prior canonical days is only a warm-up floor; official scoring begins on the first date where both engines produce valid rankings.
- Current JUGEST prediction math is invoked through `runExistingStorePlan()`; it is not duplicated.
- Historical work is lower priority than ingest, `DAILY_ANALYSIS`, live feature refresh, live PRE research, live shadow prediction, and live comparison scoring.
- One historical child processes exactly one store target date, and historical work shares the existing one-heavy-research-worker lane.
- A historical run has a fixed `snapshot_last_date` captured at creation. Newer LIVE days do not stale or restart it. Only a canonical change/backfill on or before that fixed snapshot boundary invalidates the run.
- The current headless adapter may receive at most the most recent 400 days before a target because that is its existing safety contract; the target/future cutoff remains strict.
- `main`, `deploy/vps`, and production do not change during implementation. Production requires a separate explicit Hiro approval immediately before deployment.
- Protected Juggler/HANA math, `externalJudge`, strict Champion, Calibration, store-share constraints, HANA hard constraints, raw retention, Collector contract, and existing `DAILY_ANALYSIS` output semantics remain unchanged.

---

### Task 1: Durable historical run/day ledger with fixed snapshot identity

**Files:**
- Modify: `vps/src/schema.mjs`
- Create: `vps/src/research/historical-comparison.mjs`
- Create: `vps/tests/historical-comparison-state.test.mjs`

**Interfaces:**
- Produces:
  - `HISTORICAL_REPLAY_VERSION = 'historical-shadow-v1'`
  - `computeHistoricalSnapshotIdentity(days,{snapshotLastDate}) -> string`
  - `ensureHistoricalComparisonRun(db,{storeId,days,nowIso}) -> HistoricalRun`
  - `getHistoricalComparisonRun(db,{storeId,runId?}) -> HistoricalRun|null`
  - `persistHistoricalComparisonDay(db,input) -> {inserted,row}`
  - `advanceHistoricalCursor(db,input) -> HistoricalRun`
  - `markHistoricalRunComplete(db,input)` / `markHistoricalRunStale(db,input)`

The test file defines deterministic local fixture helpers `makeDays(count)`, `replaceDay(days,date)`, `fixtureResult(runId)`, and fixed `T0/T1/T2` ISO timestamps.

- [ ] **Step 1: Write RED tests for deterministic run identity and append-once day rows**

```js
const days60=makeDays(60),newerDay=makeDays(61).at(-1);
const a=ensureHistoricalComparisonRun(db,{storeId:'s',days:days60,nowIso:T0});
const same=ensureHistoricalComparisonRun(db,{storeId:'s',days:[...days60,newerDay],nowIso:T1});
assert.equal(a.id,same.id,'newer live day must not restart fixed historical snapshot');
const changed=ensureHistoricalComparisonRun(db,{storeId:'s',days:replaceDay(days60,days60[10].date),nowIso:T2});
assert.notEqual(changed.id,a.id);
assert.equal(getHistoricalComparisonRun(db,{storeId:'s',runId:a.id}).state,'stale');

const run=ensureHistoricalComparisonRun(db,{storeId:'s',days:days60,nowIso:T0});
assert.equal(persistHistoricalComparisonDay(db,fixtureResult(run.id)).inserted,true);
assert.equal(persistHistoricalComparisonDay(db,fixtureResult(run.id)).inserted,false);
assert.equal(db.prepare('SELECT COUNT(*) n FROM historical_comparison_days').get().n,1);
```

- [ ] **Step 2: Run RED**

```bash
node --test vps/tests/historical-comparison-state.test.mjs
```

Expected: module/table missing failure.

- [ ] **Step 3: Add schema**

Add `historical_comparison_runs` with `id`, `store_id`, `replay_version`, `history_identity`, `snapshot_first_date`, `snapshot_last_date`, `next_target_date`, state (`queued|running|complete|failed|stale`), total/processed/scored/excluded counts, `pre_state_json`, `pre_fingerprint`, `pre_frontier_date`, error/timestamps, and unique `(store_id,replay_version,history_identity)`.

Add `historical_comparison_days` with append-once `(run_id,target_date)` PK plus PRE/current prediction JSON+hashes, shared `outcome_input_hash`, PRE/current metrics, winner/exclusion, PRE fingerprint/feature/frontier, scorer version, and created timestamp.

- [ ] **Step 4: Implement fixed-snapshot identity**

At first creation, `snapshot_last_date` is the newest valid canonical date then present. `computeHistoricalSnapshotIdentity()` hashes only ordered canonical data with `date <= snapshot_last_date`. The helper flow is:

```js
const active=getLatestNonStaleRun(db,storeId);
if(active){
  const prefix=days.filter(day=>day.date<=active.snapshotLastDate);
  const currentIdentity=computeHistoricalSnapshotIdentity(prefix,{snapshotLastDate:active.snapshotLastDate});
  if(currentIdentity===active.historyIdentity)return active;
  markHistoricalRunStale(db,{runId:active.id,nowIso,reason:'history_identity_changed'});
}
return createHistoricalRun(db,{storeId,days,nowIso});
```

`createHistoricalRun()` is private to the module and initializes `pre_state_json` from `baselineModel()` only.

- [ ] **Step 5: Run GREEN and commit**

```bash
node --test vps/tests/historical-comparison-state.test.mjs
git add vps/src/schema.mjs vps/src/research/historical-comparison.mjs vps/tests/historical-comparison-state.test.mjs
git commit -m "feat: add historical comparison ledger"
```

---

### Task 2: Isolated PRE simulator and fair per-target comparison

**Files:**
- Create: `vps/src/research/historical-pre-simulator.mjs`
- Modify: `vps/src/research/historical-comparison.mjs`
- Reuse unchanged: `vps/src/research/backtest.mjs`, `vps/src/research/axis-discovery.mjs`, `vps/src/research/model-search.mjs`, `vps/src/analysis/runtime-adapter.mjs`, `vps/src/research/live-comparison.mjs`
- Create: `vps/tests/historical-walk-forward.test.mjs`

**Interfaces:**
- `initialHistoricalPreState() -> {model,fingerprint,generation,seenFingerprints,replayVersion}`
- `evolveHistoricalPreState({storeId,historyDays,state,maxSearchRounds=64}) -> {state,datasetHash,converged}`
- `predictHistoricalPre({storeId,historyDays,targetDate,state}) -> Prediction`
- `compareHistoricalTarget({rootDir,storeId,shop,days,targetDate,preState}) -> HistoricalTargetResult`

The test file defines local `makeDays(count)`, `poisonOnlyDatesAfter(days,targetDate)`, and `replayFixtureChronologically(days)` helpers.

- [ ] **Step 1: Write RED tests for future poisoning and live-model isolation**

```js
const days70=makeDays(70),target=days70[50].date;
const a=await compareHistoricalTarget({rootDir:ROOT,storeId:'s',shop:'S',days:days70,targetDate:target,preState:initialHistoricalPreState()});
const b=await compareHistoricalTarget({rootDir:ROOT,storeId:'s',shop:'S',days:poisonOnlyDatesAfter(days70,target),targetDate:target,preState:initialHistoricalPreState()});
assert.deepEqual(a.prePrediction.rankings,b.prePrediction.rankings);
assert.equal(a.prePrediction.inputHash,b.prePrediction.inputHash);
const initial=initialHistoricalPreState();
assert.equal(initial.generation,0);
assert.equal(initial.fingerprint,baselineModel().fingerprint);
```

- [ ] **Step 2: Write RED test for strict cutoff and shared outcome hash**

```js
const days70=makeDays(70),targetDate=days70[55].date;
const r=await compareHistoricalTarget({rootDir:ROOT,storeId:'s',shop:'S',days:days70,targetDate,preState:initialHistoricalPreState()});
assert.ok(r.prePrediction.sourceFrontierDate<r.targetDate);
assert.ok(r.currentPrediction.sourceFrontierDate<r.targetDate);
if(!r.excludedReason)assert.equal(r.preScore.outcomeInputHash,r.currentScore.outcomeInputHash);
```

- [ ] **Step 3: Run RED**

```bash
node --test vps/tests/historical-walk-forward.test.mjs
```

- [ ] **Step 4: Implement isolated chronological PRE evolution**

For every new simulated frontier, rebuild `buildWalkForwardDataset({minHistoryDays:7})`, split chronologically, discover axes from training data, then run `searchModels()` using the carried champion model. Reset frontier-local `noImproveCount` to zero whenever the simulated frontier advances, matching live `research-cycle` behavior. Keep historical `seenFingerprints` across frontiers because live registry history is persistent.

```js
const dataset=buildWalkForwardDataset({storeId,days:historyDays,minHistoryDays:7});
const split=splitChronologicalSamples(dataset.samples);
let model=state.model,generation=state.generation,noImproveCount=0;
const seen=new Set(state.seenFingerprints||[fingerprintModel(model)]);
for(let round=0;round<maxSearchRounds;round+=1){
  const axes=discoverAxes(split.train);
  const result=searchModels({champion:model,axes,train:split.train,validation:split.validation,round});
  const proposed=result.best?.model?.fingerprint??null;
  const currentFingerprint=fingerprintModel(model);
  const repeated=Boolean(proposed&&seen.has(proposed)&&proposed!==currentFingerprint);
  if(result.improved&&result.best?.model&&!repeated&&proposed!==currentFingerprint){
    model=result.best.model;generation+=1;seen.add(proposed);noImproveCount=0;continue;
  }
  noImproveCount+=1;
  const convergence=shouldConverge({seenFingerprints:repeated?new Set([proposed]):new Set(),proposedFingerprint:proposed,noImproveCount});
  if(convergence){
    const nextState=Object.freeze({...state,model,fingerprint:fingerprintModel(model),generation,seenFingerprints:Object.freeze([...seen])});
    return Object.freeze({state:nextState,datasetHash:dataset.inputHash,converged:true});
  }
}
const nextState=Object.freeze({...state,model,fingerprint:fingerprintModel(model),generation,seenFingerprints:Object.freeze([...seen])});
return Object.freeze({state:nextState,datasetHash:dataset.inputHash,converged:false});
```

If the 64-round safety cap is reached without convergence, target date is excluded as `pre_cycle_incomplete`; do not count it as a PRE prediction win/loss.

- [ ] **Step 5: Implement PRE prediction and current plan**

PRE ranking uses `buildLivePredictionRows()` plus `scoreSample()` and deterministic score/machine-key ordering. Current ranking calls:

```js
runExistingStorePlan({rootDir,shop,sourceStoreId:storeId,days:historyDays.slice(-400),targetDate})
```

Only days `< targetDate` enter either path. Target outcome is finite `diff` rows from the canonical target day. Build exactly one `outcomeInputHash`, score both with existing `scorePredictionRows()`, and choose winner using LIVE `WIN_EPSILON` semantics. Missing engine output, missing outcome, or incomplete PRE cycle is excluded.

- [ ] **Step 6: Add warm-up/first-valid-day test**

```js
const rows=await replayFixtureChronologically(makeDays(70));
const first=rows.findIndex(row=>!row.excludedReason);
assert.ok(first>=7);
for(const row of rows.slice(7,first))assert.ok(row.excludedReason);
```

- [ ] **Step 7: Run GREEN and commit**

```bash
node --test vps/tests/historical-walk-forward.test.mjs
git add vps/src/research/historical-pre-simulator.mjs vps/src/research/historical-comparison.mjs vps/tests/historical-walk-forward.test.mjs
git commit -m "feat: add isolated historical walk-forward comparison"
```

---

### Task 3: Resumable one-day worker, bootstrap, and low-priority Coordinator lane

**Files:**
- Create: `vps/src/analysis/historical-refresh-state.mjs`
- Create: `vps/src/jobs/historical-compare.mjs`
- Modify: `vps/src/coordinator.mjs`
- Modify: `vps/src/analysis/daily-analysis.mjs`
- Create: `vps/tests/historical-worker.test.mjs`
- Create: `vps/tests/historical-coordinator.test.mjs`

**Interfaces:**
- `HISTORICAL_JOB_PRIORITY = 80`
- `HISTORICAL_JOB_LEASE_MIB = 768`
- `requestHistoricalComparisonRefresh(db,{storeId,nowIso}) -> {run,job}`
- `bootstrapHistoricalComparisonRuns(db,{nowIso}) -> {requested,skipped}`
- Job type: `HISTORICAL_COMPARE`.

- [ ] **Step 1: Write RED tests for coalescing and Coordinator routing**

```js
const a=requestHistoricalComparisonRefresh(db,{storeId:'s',nowIso:T0});
const b=requestHistoricalComparisonRefresh(db,{storeId:'s',nowIso:T1});
assert.equal(a.job.id,b.job.id);
assert.equal(a.job.type,'HISTORICAL_COMPARE');
assert.equal(a.job.priority,80);
assert.match(String(__test.defaultWorkerPathForJob({type:'HISTORICAL_COMPARE'})),/historical-compare\.mjs/);
assert.equal(__test.RESEARCH_JOB_TYPES.has('HISTORICAL_COMPARE'),true);
```

- [ ] **Step 2: Run RED**

```bash
node --test vps/tests/historical-worker.test.mjs vps/tests/historical-coordinator.test.mjs
```

- [ ] **Step 3: Implement refresh/bootstrap**

Use idempotency key `historical-compare:<storeId>:<runId>:<nextTargetDate>`, priority `80`, size class `large`, estimated lease `768 MiB`, max attempts `3`.

`bootstrapHistoricalComparisonRuns()` scans registered stores once on the Coordinator's first tick and requests a run only when the store has at least 8 valid canonical days and no active/complete fixed-snapshot run. Newer live dates after a completed snapshot do not cause a full historical rerun; LIVE shadow covers those dates.

After successful `DAILY_ANALYSIS`, request historical refresh only if no historical snapshot exists yet or a backfill/change inside the fixed snapshot boundary invalidated it. Failure to request historical work must not fail `DAILY_ANALYSIS`.

- [ ] **Step 4: Implement one-target worker**

Export `executeHistoricalCompare({dbPath,job,rootDir})`. One invocation loads/migrates DB; loads run/cursor; reloads valid canonical days; verifies identity only through `snapshot_last_date`; on stale input marks old run stale and requests one replacement; otherwise compares exactly `next_target_date`; appends one day row; persists PRE state/cursor transactionally; marks complete at snapshot end or enqueues exactly one next cursor job; emits existing task telemetry/result hash.

- [ ] **Step 5: Add resume/idempotency test**

```js
await executeHistoricalCompare({dbPath,job:job1,rootDir:ROOT});
const firstCount=countDays(db),cursor=activeRun(db).nextTargetDate;
await executeHistoricalCompare({dbPath,job:job2,rootDir:ROOT});
assert.equal(countDays(db),firstCount+1);
assert.notEqual(activeRun(db).nextTargetDate,cursor);
await executeHistoricalCompare({dbPath,job:job2,rootDir:ROOT});
assert.equal(countDistinctRunDates(db),countDays(db));
```

- [ ] **Step 6: Wire Coordinator**

Add `HISTORICAL_COMPARE_WORKER`, route it in `defaultWorkerPathForJob`, add `HISTORICAL_COMPARE` to `RESEARCH_JOB_TYPES`, keep `maxResearchChildren=1`, and run bootstrap once per Coordinator process before normal admission.

- [ ] **Step 7: Run GREEN and commit**

```bash
node --test vps/tests/historical-worker.test.mjs vps/tests/historical-coordinator.test.mjs
git add vps/src/analysis/historical-refresh-state.mjs vps/src/jobs/historical-compare.mjs vps/src/coordinator.mjs vps/src/analysis/daily-analysis.mjs vps/tests/historical-worker.test.mjs vps/tests/historical-coordinator.test.mjs
git commit -m "feat: schedule resumable historical comparison"
```

---

### Task 4: Historical aggregation through the existing authenticated comparison API

**Files:**
- Modify: `vps/src/research/historical-comparison.mjs`
- Modify: `vps/src/research/live-comparison.mjs`
- Modify: `vps/tests/comparison-api.test.mjs`
- Create: `vps/tests/historical-summary.test.mjs`

**Interfaces:**
- `buildHistoricalComparisonSummary(db,{storeId,limit=90}) -> HistoricalSummary|null`
- Existing `buildComparisonSummary()` keeps `live` backward-compatible and replaces `historical:null` with the new summary.

The test file defines `seedHistoricalFixture()` locally and returns a migrated in-memory DB with two scored days and one excluded day.

- [ ] **Step 1: Write aggregation RED test**

```js
const db=seedHistoricalFixture();
const s=buildHistoricalComparisonSummary(db,{storeId:'s'});
assert.equal(s.scored,2);
assert.equal(s.excluded,1);
assert.equal(s.newWins,1);
assert.equal(s.currentWins,1);
```

- [ ] **Step 2: Implement summary**

Return state/progress, store/run/replay version, fixed date range, processed/scored/excluded, W/L/T, PRE/current average metrics, recent-30 quality delta, exclusion breakdown, simulated fingerprint/frontier, bounded recent day rows, and last error. Reuse LIVE metric/winner semantics and never merge historical rows into LIVE counts.

- [ ] **Step 3: Keep endpoint/auth unchanged**

`GET /api/vps/stores/:storeId/research/comparison?limit=90` remains the only comparison endpoint. Extend `comparison-api.test.mjs` so unauthorized remains `401`, another channel's store remains `403`, and an authorized response contains both `comparison.live` and `comparison.historical`.

- [ ] **Step 4: Run API/summary tests and commit**

```bash
node --test vps/tests/historical-summary.test.mjs vps/tests/comparison-api.test.mjs
git add vps/src/research/historical-comparison.mjs vps/src/research/live-comparison.mjs vps/tests/historical-summary.test.mjs vps/tests/comparison-api.test.mjs
git commit -m "feat: expose historical comparison results"
```

---

### Task 5: Settings `LIVE / 過去検証` and target-aware LIVE pending copy

**Files:**
- Modify: `vps-ui-enhancements.mjs`
- Modify: `vps/tests/pre-shadow-settings-ui.test.mjs`

**Interfaces:**
- Add local `comparisonMode = 'live' | 'historical'`; no new API/client call.

- [ ] **Step 1: Write UI RED tests**

Require `data-vps-comparison-mode`, `LIVE`, `過去検証`, and target-aware pending rendering. Given an unscored LIVE row for `2026-09-14`, rendered output must include `9/14予測を固定済み` and `9/14の実績データ待ち`.

- [ ] **Step 2: Implement two-mode comparison UI**

Keep one Settings entry. `LIVE` renders existing forward-only scores. `過去検証` renders replay state/progress, fixed date range, scored/excluded counts, W/L/T, Top1/3/5, rank correlation, quality delta, recent days, and expandable fingerprint/frontier/outcome-hash/exclusion metadata.

- [ ] **Step 3: Improve empty/pending states**

Historical `queued/running/complete/failed/not-eligible` states get explicit copy. LIVE uses the newest `unscored` row's target date when available; count-only wording is fallback only.

- [ ] **Step 4: Run UI test and commit**

```bash
node --test vps/tests/pre-shadow-settings-ui.test.mjs
git add vps-ui-enhancements.mjs vps/tests/pre-shadow-settings-ui.test.mjs
git commit -m "feat: show historical PRE comparison in settings"
```

---

### Task 6: Staleness/backfill and multi-store isolation

**Files:**
- Modify: `vps/src/research/historical-comparison.mjs`
- Modify: `vps/src/analysis/historical-refresh-state.mjs`
- Modify: `vps/src/jobs/historical-compare.mjs`
- Create: `vps/tests/historical-staleness.test.mjs`

The test file defines `insertOldMissingDay(days)` and two-store fixtures locally.

- [ ] **Step 1: Write RED test for changed old history but unchanged new LIVE tail**

```js
const run=ensureHistoricalComparisonRun(db,{storeId:'s',days:days60,nowIso:T0});
const withNewTail=ensureHistoricalComparisonRun(db,{storeId:'s',days:[...days60,newerDay],nowIso:T1});
assert.equal(withNewTail.id,run.id);
const withBackfill=ensureHistoricalComparisonRun(db,{storeId:'s',days:insertOldMissingDay(days60),nowIso:T2});
assert.notEqual(withBackfill.id,run.id);
assert.equal(getHistoricalComparisonRun(db,{storeId:'s',runId:run.id}).state,'stale');
```

- [ ] **Step 2: Write multi-store isolation test**

Create runs for stores `s1` and `s2`, process one target for `s1`, then assert `s2` run ID, cursor, processed count, and day-row count are unchanged.

- [ ] **Step 3: Implement stale restart**

Before each target, recompute identity only for canonical dates `<= snapshot_last_date`. On mismatch, retain old rows for audit, mark old run stale, create/request one replacement fixed snapshot, and complete the obsolete job without retry looping.

- [ ] **Step 4: Run tests and commit**

```bash
node --test vps/tests/historical-staleness.test.mjs vps/tests/historical-worker.test.mjs
git add vps/src/research/historical-comparison.mjs vps/src/analysis/historical-refresh-state.mjs vps/src/jobs/historical-compare.mjs vps/tests/historical-staleness.test.mjs
git commit -m "fix: restart historical replay after canonical backfill"
```

---

### Task 7: Full verification and production boundary

**Files:**
- Update after successful verification only: `docs/vps/VPS-RESEARCH-PHASE1-PREDEPLOY-CHECKPOINT.md`

- [ ] **Step 1: Run all targeted historical tests**

```bash
node --test \
  vps/tests/historical-comparison-state.test.mjs \
  vps/tests/historical-walk-forward.test.mjs \
  vps/tests/historical-worker.test.mjs \
  vps/tests/historical-coordinator.test.mjs \
  vps/tests/historical-summary.test.mjs \
  vps/tests/historical-staleness.test.mjs \
  vps/tests/comparison-api.test.mjs \
  vps/tests/pre-shadow-settings-ui.test.mjs
```

- [ ] **Step 2: Run complete CI-equivalent suites**

Run the exact workflow commands for VPS, root regressions, Collector, and production-preservation. All must pass before completion is claimed.

- [ ] **Step 3: Protected-surface diff audit**

Compare implementation HEAD against checkpoint `78a7c362cb249e3dc2d46ca6df8ff007ffd21f58` and verify no unintended changes to `hanahana-judge.js`, `core-v510.js`, Juggler probability tables, protected `externalJudge` / Calibration / strict Champion logic, or Collector contract. `index.html` and `app-v510.js` remain unchanged; if implementation would require broadening into them, stop and ask Hiro first.

- [ ] **Step 4: Verify production refs are unchanged**

`main` and `deploy/vps` must still point to their pre-implementation production refs. Only `sol/vps-research-pipeline-phase1-impl` advances.

- [ ] **Step 5: Checkpoint and commit**

Record feature-branch SHA, test counts, protected-file audit, historical replay version, and `not deployed` status in `docs/vps/VPS-RESEARCH-PHASE1-PREDEPLOY-CHECKPOINT.md`.

- [ ] **Step 6: Stop at production boundary**

Report evidence to Hiro and ask for a fresh explicit production-deploy approval. Do not move `deploy/vps` in this plan.
