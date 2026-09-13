# Historical Shadow Walk-Forward Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replay every eligible historical store-day in chronological order so PRE research and the current JUGEST Today Plan can be compared fairly without future leakage, while keeping LIVE shadow validation separate.

**Architecture:** Add a durable historical replay ledger and an isolated PRE simulator that starts from `baselineModel()` and advances only with data available before each target date. A new low-priority `HISTORICAL_COMPARE` child processes one store target date per job, persists its cursor, scores both engines against the same canonical outcome, and re-enqueues itself. The existing authenticated comparison endpoint returns the historical summary alongside LIVE results, and Settings gains `LIVE / 過去検証` modes.

**Tech Stack:** Node.js ESM, SQLite, existing JUGEST headless runtime adapter, existing research `backtest` / `axis-discovery` / `model-search` modules, existing VPS queue/Coordinator/resource controls, browser ES modules, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-13-historical-shadow-walk-forward-design.md`

## Global Constraints

- For target date `D`, neither engine may receive canonical store data dated `D` or later before prediction.
- Historical PRE must start from `baselineModel()` and must never read the live `research_champion` or `active_store_models` as its initial state.
- Use `canonical-diff-proxy-v1` only as an evaluation proxy; do not claim it is the hidden setting label.
- Historical rows must remain separate from LIVE `store_prediction_snapshots` / `store_prediction_scores`.
- A minimum of 7 prior canonical days is only an eligibility floor; a day scores only when both engines produce valid rankings.
- Reuse the real current JUGEST Today Plan through `runExistingStorePlan()`; do not duplicate or port current prediction math.
- Historical work is lower priority than ingest, `DAILY_ANALYSIS`, live feature refresh, live PRE research, live shadow prediction, and live comparison scoring.
- Process at most one store target date per historical job execution and use the existing one-heavy-research-worker lane.
- `main`, `deploy/vps`, and production must not change during implementation. Production requires a separate explicit Hiro approval immediately before deployment.
- Protected Juggler/HANA judgment math, `externalJudge`, strict Champion, Calibration, store-share constraints, HANA hard constraints, raw-retention semantics, Collector contract, and existing `DAILY_ANALYSIS` output semantics remain unchanged.

---

### Task 1: Durable historical run/day ledger and run identity

**Files:**
- Modify: `vps/src/schema.mjs`
- Create: `vps/src/research/historical-comparison.mjs`
- Create: `vps/tests/historical-comparison-state.test.mjs`

**Interfaces:**
- Consumes: canonical store-day metadata from `store_days`; `canonicalJson()` / `hashCanonical()` from `vps/src/canonical-json.mjs`.
- Produces:
  - `HISTORICAL_REPLAY_VERSION = 'historical-shadow-v1'`
  - `computeHistoricalHistoryIdentity(days) -> string`
  - `ensureHistoricalComparisonRun(db,{storeId,days,nowIso}) -> HistoricalRun`
  - `getHistoricalComparisonRun(db,{storeId,runId?}) -> HistoricalRun|null`
  - `persistHistoricalComparisonDay(db,{runId,storeId,targetDate,...}) -> {inserted:boolean,row}`
  - `advanceHistoricalCursor(db,{runId,nextTargetDate,processedDelta,scoredDelta,excludedDelta,preState,nowIso}) -> HistoricalRun`
  - `markHistoricalRunComplete(db,{runId,nowIso})`
  - `markHistoricalRunStale(db,{runId,nowIso,reason})`

- [ ] **Step 1: Write the failing schema/state tests**

Create `vps/tests/historical-comparison-state.test.mjs` with tests equivalent to:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {migrate} from '../src/schema.mjs';
import {
  HISTORICAL_REPLAY_VERSION,
  ensureHistoricalComparisonRun,
  persistHistoricalComparisonDay,
  getHistoricalComparisonRun
} from '../src/research/historical-comparison.mjs';

function db(){const x=new Database(':memory:');migrate(x);x.prepare("INSERT INTO stores(id,name,created_at,updated_at) VALUES('s','S','2026-09-13T00:00:00Z','2026-09-13T00:00:00Z')").run();return x}
const days=[
  {date:'2026-01-01',machines:[{tableNo:'1',diff:10}]},
  {date:'2026-01-02',machines:[{tableNo:'1',diff:20}]}
];

test('run identity is deterministic and changed history creates a new run',()=>{
  const x=db(),a=ensureHistoricalComparisonRun(x,{storeId:'s',days,nowIso:'2026-09-13T00:00:00Z'});
  const same=ensureHistoricalComparisonRun(x,{storeId:'s',days,nowIso:'2026-09-13T00:01:00Z'});
  assert.equal(a.id,same.id);
  const changed=ensureHistoricalComparisonRun(x,{storeId:'s',days:[...days,{date:'2026-01-03',machines:[{tableNo:'1',diff:30}]}],nowIso:'2026-09-13T00:02:00Z'});
  assert.notEqual(changed.id,a.id);
  assert.equal(getHistoricalComparisonRun(x,{storeId:'s',runId:a.id}).state,'stale');
  assert.equal(changed.replayVersion,HISTORICAL_REPLAY_VERSION);
});

test('historical day rows are append-once per run and target date',()=>{
  const x=db(),run=ensureHistoricalComparisonRun(x,{storeId:'s',days,nowIso:'2026-09-13T00:00:00Z'});
  const input={runId:run.id,storeId:'s',targetDate:'2026-01-02',prePrediction:{rankings:[{machineKey:'1',tableNo:'1',machineName:'A',rank:1,score:1}]},currentPrediction:{rankings:[{machineKey:'1',tableNo:'1',machineName:'A',rank:1,score:1}]},outcomeInputHash:'h',preMetrics:{quality:1},currentMetrics:{quality:1},winner:'tie',excludedReason:null,preState:{fingerprint:'fp',frontierDate:'2026-01-01'},createdAt:'2026-09-13T00:00:00Z'};
  assert.equal(persistHistoricalComparisonDay(x,input).inserted,true);
  assert.equal(persistHistoricalComparisonDay(x,input).inserted,false);
  assert.equal(x.prepare('SELECT COUNT(*) n FROM historical_comparison_days').get().n,1);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run the repository VPS test command used by CI, or minimally:

```bash
node --test vps/tests/historical-comparison-state.test.mjs
```

Expected: FAIL because historical tables/module do not exist.

- [ ] **Step 3: Add schema tables**

Add tables to `migrate()`:

```sql
CREATE TABLE IF NOT EXISTS historical_comparison_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  replay_version TEXT NOT NULL,
  history_identity TEXT NOT NULL,
  first_date TEXT,
  last_date TEXT,
  next_target_date TEXT,
  state TEXT NOT NULL CHECK(state IN ('queued','running','complete','failed','stale')),
  total_candidates INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  scored_count INTEGER NOT NULL DEFAULT 0,
  excluded_count INTEGER NOT NULL DEFAULT 0,
  pre_state_json TEXT NOT NULL,
  pre_fingerprint TEXT NOT NULL,
  pre_frontier_date TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(store_id,replay_version,history_identity),
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS historical_comparison_runs_store_idx
  ON historical_comparison_runs(store_id,state,updated_at DESC);

CREATE TABLE IF NOT EXISTS historical_comparison_days (
  run_id INTEGER NOT NULL,
  store_id TEXT NOT NULL,
  target_date TEXT NOT NULL,
  pre_prediction_json TEXT,
  current_prediction_json TEXT,
  pre_prediction_hash TEXT,
  current_prediction_hash TEXT,
  outcome_input_hash TEXT,
  pre_metrics_json TEXT,
  current_metrics_json TEXT,
  winner TEXT CHECK(winner IN ('pre_research','current_shadow','tie') OR winner IS NULL),
  excluded_reason TEXT,
  pre_fingerprint TEXT,
  pre_feature_version TEXT,
  pre_frontier_date TEXT,
  scorer_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(run_id,target_date),
  FOREIGN KEY(run_id) REFERENCES historical_comparison_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS historical_comparison_days_store_date_idx
  ON historical_comparison_days(store_id,target_date DESC);
```

- [ ] **Step 4: Implement deterministic identity and append-only state helpers**

Use canonical history identity based on ordered valid canonical day content, not wall-clock timestamps:

```js
export const HISTORICAL_REPLAY_VERSION='historical-shadow-v1';
export function computeHistoricalHistoryIdentity(days){
  const normalized=[...(days||[])].map(day=>({date:String(day.date||''),machines:[...(day.machines||[])].map(m=>({tableNo:String(m.tableNo??m.machineKey??''),machineName:String(m.sourceMachineName??m.machineName??''),games:Number(m.games)||0,bb:Number(m.bb)||0,rb:Number(m.rb)||0,diff:Number.isFinite(Number(m.diff))?Number(m.diff):null})).sort((a,b)=>a.tableNo.localeCompare(b.tableNo))})).sort((a,b)=>a.date.localeCompare(b.date));
  return hashCanonical({replayVersion:HISTORICAL_REPLAY_VERSION,days:normalized});
}
```

Initialize `pre_state_json` with the baseline fingerprint and no live-table reads. If a different active non-stale run exists for the same store/history range, mark it `stale` before creating the new identity.

- [ ] **Step 5: Run tests and verify GREEN**

```bash
node --test vps/tests/historical-comparison-state.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add vps/src/schema.mjs vps/src/research/historical-comparison.mjs vps/tests/historical-comparison-state.test.mjs
git commit -m "feat: add historical comparison ledger"
```

---

### Task 2: Pure isolated PRE replay and fair per-day comparison

**Files:**
- Create: `vps/src/research/historical-pre-simulator.mjs`
- Modify: `vps/src/research/historical-comparison.mjs`
- Reuse without semantic changes: `vps/src/research/backtest.mjs`, `vps/src/research/axis-discovery.mjs`, `vps/src/research/model-search.mjs`, `vps/src/analysis/runtime-adapter.mjs`, `vps/src/research/live-comparison.mjs`
- Create: `vps/tests/historical-walk-forward.test.mjs`

**Interfaces:**
- Consumes:
  - `buildWalkForwardDataset({storeId,days,minHistoryDays:7})`
  - `splitChronologicalSamples(samples)`
  - `discoverAxes(train)`
  - `baselineModel()`, `fingerprintModel()`, `scoreSample()`, `searchModels()`, `shouldConverge()`
  - `runExistingStorePlan({rootDir,shop,sourceStoreId,days,targetDate})`
  - `scorePredictionRows({predictionRows,outcomeRows})`
- Produces:
  - `initialHistoricalPreState() -> {model,fingerprint,generation,noImproveCount,seenFingerprints,replayVersion}`
  - `evolveHistoricalPreState({storeId,historyDays,state,maxRounds:6}) -> {state,datasetHash}`
  - `predictHistoricalPre({storeId,historyDays,targetDate,state}) -> {available,sourceFrontierDate,modelFingerprint,featureVersion,rankings,inputHash}`
  - `compareHistoricalTarget({rootDir,storeId,shop,days,targetDate,preState}) -> HistoricalTargetResult`

- [ ] **Step 1: Write future-leak and baseline RED tests**

Add tests equivalent to:

```js
test('future poisoning cannot change an earlier historical PRE prediction',async()=>{
  const base=makeDays(60),target=base[50].date;
  const a=await compareHistoricalTarget({rootDir:ROOT,storeId:'s',shop:'S',days:base,targetDate:target,preState:initialHistoricalPreState()});
  const poisoned=structuredClone(base);for(const day of poisoned.filter(d=>d.date>target))for(const m of day.machines)m.diff=999999;
  const b=await compareHistoricalTarget({rootDir:ROOT,storeId:'s',shop:'S',days:poisoned,targetDate:target,preState:initialHistoricalPreState()});
  assert.deepEqual(a.prePrediction.rankings,b.prePrediction.rankings);
  assert.equal(a.prePrediction.inputHash,b.prePrediction.inputHash);
});

test('historical PRE always starts from baseline and cannot consume a live champion',()=>{
  const state=initialHistoricalPreState();
  assert.equal(state.generation,0);
  assert.equal(state.fingerprint,baselineModel().fingerprint);
});
```

- [ ] **Step 2: Write current-engine cutoff and shared-outcome RED tests**

```js
test('historical current adapter receives only days before target and both scores share one outcome hash',async()=>{
  const result=await compareHistoricalTarget({rootDir:ROOT,storeId:'s',shop:'S',days:makeDays(70),targetDate:'2026-03-01',preState:initialHistoricalPreState()});
  assert.ok(result.currentPrediction.sourceFrontierDate < result.targetDate);
  assert.ok(result.prePrediction.sourceFrontierDate < result.targetDate);
  if(!result.excludedReason){
    assert.equal(result.preScore.outcomeInputHash,result.currentScore.outcomeInputHash);
  }
});
```

- [ ] **Step 3: Run tests and verify RED**

```bash
node --test vps/tests/historical-walk-forward.test.mjs
```

Expected: FAIL because simulator/comparison functions do not exist.

- [ ] **Step 4: Implement isolated PRE state evolution**

`historical-pre-simulator.mjs` must be pure with no database reads. Use exactly the existing research primitives. For each frontier, rebuild the walk-forward dataset from history available at that frontier, discover axes from chronological train data, then run model search rounds starting from the state model until one of these happens: an improved candidate is promoted and search continues from that candidate, or `shouldConverge()` returns a reason, or the hard safety cap `maxRounds=6` is reached. State contains the model itself so future steps do not need the live registry.

Core shape:

```js
export function initialHistoricalPreState(){
  const model=baselineModel();
  return Object.freeze({replayVersion:HISTORICAL_REPLAY_VERSION,model,fingerprint:model.fingerprint,generation:0,noImproveCount:0,seenFingerprints:Object.freeze([model.fingerprint])});
}

export function evolveHistoricalPreState({storeId,historyDays,state=initialHistoricalPreState(),maxRounds=6}={}){
  const dataset=buildWalkForwardDataset({storeId,days:historyDays,minHistoryDays:7});
  const split=splitChronologicalSamples(dataset.samples);
  let current=state.model, generation=state.generation, noImprove=state.noImproveCount;
  const seen=new Set(state.seenFingerprints||[fingerprintModel(current)]);
  for(let round=0;round<maxRounds;round+=1){
    const axes=discoverAxes(split.train);
    const search=searchModels({champion:current,axes,train:split.train,validation:split.validation,round});
    if(search.improved&&search.best?.model&&!seen.has(search.best.model.fingerprint)){
      current=search.best.model;generation+=1;noImprove=0;seen.add(current.fingerprint);continue;
    }
    noImprove+=1;
    const stop=shouldConverge({seenFingerprints:seen,proposedFingerprint:search.best?.model?.fingerprint,noImproveCount:noImprove});
    if(stop)break;
  }
  return Object.freeze({state:Object.freeze({replayVersion:HISTORICAL_REPLAY_VERSION,model:current,fingerprint:fingerprintModel(current),generation,noImproveCount:noImprove,seenFingerprints:Object.freeze([...seen])}),datasetHash:dataset.inputHash});
}
```

If the exact repeat semantics require checking the proposed fingerprint before adding it to `seen`, preserve the live `shouldConverge()` behavior rather than mechanically copying the pseudocode ordering above.

- [ ] **Step 5: Implement PRE prediction and fair target comparison**

PRE prediction must use `buildLivePredictionRows()` over `historyDays` only and rank with `scoreSample()`:

```js
const rows=buildLivePredictionRows({storeId,days:historyDays,targetDate});
const rankings=rows.map(row=>({...row,score:scoreSample(row,state.model)}))
  .sort((a,b)=>b.score-a.score||a.machineKey.localeCompare(b.machineKey))
  .map((row,index)=>({machineKey:row.machineKey,tableNo:row.tableNo,machineName:row.machineName,rank:index+1,score:row.score}));
```

For target outcome, take only the canonical target day's finite `diff` machine rows, create one canonical `outcomeInputHash`, score both rankings with `scorePredictionRows()`, and choose winner using the same `WIN_EPSILON` as LIVE. If either engine is unavailable, persist an exclusion and do not create a win/loss/tie.

- [ ] **Step 6: Add first-valid-day behavior test**

```js
test('day 7 is only a warmup floor; scoring starts when both engines are valid',async()=>{
  const results=await replayFixtureChronologically(makeDays(70));
  const firstScored=results.find(row=>!row.excludedReason);
  assert.ok(firstScored);
  assert.ok(results.indexOf(firstScored)>=7);
  for(const row of results.slice(7,results.indexOf(firstScored)))assert.ok(row.excludedReason);
});
```

- [ ] **Step 7: Run Task 2 tests and commit**

```bash
node --test vps/tests/historical-walk-forward.test.mjs
git add vps/src/research/historical-pre-simulator.mjs vps/src/research/historical-comparison.mjs vps/tests/historical-walk-forward.test.mjs
git commit -m "feat: add isolated historical walk-forward comparison"
```

---

### Task 3: One-day resumable historical worker and low-priority scheduling

**Files:**
- Create: `vps/src/analysis/historical-refresh-state.mjs`
- Create: `vps/src/jobs/historical-compare.mjs`
- Modify: `vps/src/coordinator.mjs`
- Modify: the existing post-ingest / daily-analysis scheduling path that already queues feature/shadow work
- Create: `vps/tests/historical-worker.test.mjs`
- Create: `vps/tests/historical-coordinator.test.mjs`

**Interfaces:**
- Produces:
  - `requestHistoricalComparisonRefresh(db,{storeId,nowIso}) -> {job,run}`
  - child job type `HISTORICAL_COMPARE`
- Worker contract: one invocation processes exactly one persisted `next_target_date`, persists the day/cursor, then queues the next idempotent historical job if more candidates remain.

- [ ] **Step 1: Write RED tests for scheduling/coalescing**

```js
test('historical refresh coalesces by store and active run',()=>{
  const first=requestHistoricalComparisonRefresh(db,{storeId:'s',nowIso:T0});
  const second=requestHistoricalComparisonRefresh(db,{storeId:'s',nowIso:T1});
  assert.equal(first.job.id,second.job.id);
  assert.equal(first.job.type,'HISTORICAL_COMPARE');
});

test('HISTORICAL_COMPARE uses the real worker and research lane',()=>{
  assert.match(String(__test.defaultWorkerPathForJob({type:'HISTORICAL_COMPARE'})),/historical-compare\.mjs/);
  assert.equal(__test.RESEARCH_JOB_TYPES.has('HISTORICAL_COMPARE'),true);
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
node --test vps/tests/historical-worker.test.mjs vps/tests/historical-coordinator.test.mjs
```

- [ ] **Step 3: Implement refresh state with lower priority than existing research**

Use an idempotency key including store + run identity + cursor, for example:

```js
historical-compare:${storeId}:${run.id}:${run.nextTargetDate}
```

Set priority numerically *after* current live research priorities; use a large job size/lease consistent with the research worker and never exceed the current heavy-child concurrency.

- [ ] **Step 4: Implement child worker**

The worker must:

1. open/migrate canonical DB,
2. load the active run and current cursor,
3. load valid canonical days for that store,
4. verify current history identity still matches the run,
5. process only `nextTargetDate`,
6. append one day row,
7. advance/persist PRE state and cursor transactionally,
8. mark complete if no targets remain; otherwise enqueue the next cursor job,
9. report task telemetry / result hash through the existing child protocol.

A restart between steps 6 and 8 must be idempotent: append-once day storage plus persisted cursor must allow a safe re-run.

- [ ] **Step 5: Add interruption/resume test**

```js
test('worker resumes exactly from persisted cursor and never duplicates days',async()=>{
  await executeHistoricalCompare({dbPath,job:{payload:{storeId:'s'}}});
  const first=db.prepare('SELECT processed_count,next_target_date FROM historical_comparison_runs WHERE store_id=? AND state<>\'stale\' ORDER BY id DESC LIMIT 1').get('s');
  const count1=db.prepare('SELECT COUNT(*) n FROM historical_comparison_days').get().n;
  await executeHistoricalCompare({dbPath,job:{payload:{storeId:'s'}}});
  const count2=db.prepare('SELECT COUNT(*) n FROM historical_comparison_days').get().n;
  assert.equal(count2,count1+1);
  assert.ok(first.next_target_date);
});
```

- [ ] **Step 6: Wire Coordinator and automatic request**

Add:

```js
const HISTORICAL_COMPARE_WORKER=new URL('./jobs/historical-compare.mjs',import.meta.url);
const RESEARCH_JOB_TYPES=new Set([...existing,'HISTORICAL_COMPARE']);
```

and route `HISTORICAL_COMPARE` to the new worker. Request historical refresh after successful canonical/live processing, but make request failure non-fatal to `DAILY_ANALYSIS` just like auxiliary comparison refresh behavior.

- [ ] **Step 7: Run tests and commit**

```bash
node --test vps/tests/historical-worker.test.mjs vps/tests/historical-coordinator.test.mjs
git add vps/src/analysis/historical-refresh-state.mjs vps/src/jobs/historical-compare.mjs vps/src/coordinator.mjs vps/src/analysis/daily-analysis.mjs vps/tests/historical-worker.test.mjs vps/tests/historical-coordinator.test.mjs
git commit -m "feat: schedule resumable historical comparison"
```

---

### Task 4: Historical summary and authenticated comparison API

**Files:**
- Modify: `vps/src/research/historical-comparison.mjs`
- Modify: `vps/src/research/live-comparison.mjs`
- Modify: `vps/src/analytics-handler.mjs`
- Modify: `vps/tests/comparison-api.test.mjs`
- Create: `vps/tests/historical-summary.test.mjs`

**Interfaces:**
- Produces `buildHistoricalComparisonSummary(db,{storeId,limit=90})`.
- `buildComparisonSummary()` continues returning `{live,historical}`; `live` shape remains backward compatible.

- [ ] **Step 1: Write historical aggregation RED test**

```js
test('historical summary keeps scored and excluded counts separate',()=>{
  seedHistoricalDays(db,[
    {targetDate:'2026-01-10',winner:'pre_research'},
    {targetDate:'2026-01-11',winner:'current_shadow'},
    {targetDate:'2026-01-12',winner:null,excludedReason:'missing_current_shadow'}
  ]);
  const s=buildHistoricalComparisonSummary(db,{storeId:'s'});
  assert.equal(s.scored,2);
  assert.equal(s.excluded,1);
  assert.equal(s.newWins,1);
  assert.equal(s.currentWins,1);
});
```

- [ ] **Step 2: Implement aggregation**

Return at minimum:

```js
{
  state,runId,replayVersion,dateRange:{first,last},
  totalCandidates,processed,scored,excluded,
  newWins,currentWins,ties,
  newEngine,currentEngine,
  recent30:{days,newEngine,currentEngine,delta},
  exclusionBreakdown,
  preFingerprint,preFrontierDate,
  rows,lastError
}
```

Reuse the same metric averaging/winner semantics as LIVE; do not merge LIVE rows into historical counts.

- [ ] **Step 3: Make existing comparison endpoint include historical data**

Keep the same route and auth:

```text
GET /api/vps/stores/:storeId/research/comparison?limit=90
```

`buildComparisonSummary()` should call the historical summary builder and populate `comparison.historical` instead of `null`.

- [ ] **Step 4: Verify authentication/store isolation**

Extend `comparison-api.test.mjs` so unauthorized remains `401`, another channel's store remains `403`, and the authorized response exposes `comparison.live` and `comparison.historical`.

- [ ] **Step 5: Run tests and commit**

```bash
node --test vps/tests/historical-summary.test.mjs vps/tests/comparison-api.test.mjs
git add vps/src/research/historical-comparison.mjs vps/src/research/live-comparison.mjs vps/src/analytics-handler.mjs vps/tests/historical-summary.test.mjs vps/tests/comparison-api.test.mjs
git commit -m "feat: expose historical comparison results"
```

---

### Task 5: Settings `LIVE / 過去検証` view and target-aware pending copy

**Files:**
- Modify: `vps-ui-enhancements.mjs`
- Modify: `vps/tests/pre-shadow-settings-ui.test.mjs`

**Interfaces:**
- No new endpoint.
- Add local UI mode state: `comparisonMode = 'live' | 'historical'`.
- Existing comparison refresh fetches both modes from one authenticated response.

- [ ] **Step 1: Write UI RED tests**

Require these static/render contracts:

```js
assert.match(source,/LIVE/);
assert.match(source,/過去検証/);
assert.match(source,/data-vps-comparison-mode/);
assert.match(source,/実績データ待ち/);
```

Add a renderer-level test where `live.rows` contains one `unscored` target `2026-09-14` and verify output contains:

```text
9/14予測を固定済み
9/14の実績データ待ち
```

- [ ] **Step 2: Implement mode selector**

In `comparisonSettingsHtml()`, render a compact two-button selector and choose content by `comparisonMode`. Keep one Settings entry only; do not add a bottom-nav workspace.

- [ ] **Step 3: Implement historical progress/results view**

When `historical.state==='running'`, show `processed / totalCandidates`, scored/excluded, W/L/T, metric table, quality delta, date range, and recent daily results. For `queued`, `complete`, `failed`, or no eligible history, display explicit state copy rather than a generic error.

- [ ] **Step 4: Improve LIVE pending copy**

Find the newest `live.rows` entry whose `excludedReason==='unscored'`; if present, format its `targetDate` in Japanese month/day and show target-aware text. Fall back to the old count-only message only when no target date is available.

- [ ] **Step 5: Run UI tests and commit**

```bash
node --test vps/tests/pre-shadow-settings-ui.test.mjs
git add vps-ui-enhancements.mjs vps/tests/pre-shadow-settings-ui.test.mjs
git commit -m "feat: show historical PRE comparison in settings"
```

---

### Task 6: Staleness, backfill, and multi-store safety

**Files:**
- Modify: `vps/src/research/historical-comparison.mjs`
- Modify: `vps/src/analysis/historical-refresh-state.mjs`
- Modify: `vps/src/jobs/historical-compare.mjs`
- Create: `vps/tests/historical-staleness.test.mjs`

**Interfaces:**
- Existing history identity becomes the authority for stale detection.
- A stale run is audit-retained and never mutated again; a new identity gets a new run.

- [ ] **Step 1: Write RED test for old-history backfill**

```js
test('backfilling an old canonical day stales the old replay instead of rewriting it',()=>{
  const old=ensureHistoricalComparisonRun(db,{storeId:'s',days:daysA,nowIso:T0});
  persistHistoricalComparisonDay(db,dayResult(old.id));
  const next=ensureHistoricalComparisonRun(db,{storeId:'s',days:daysWithBackfilledOldDate,nowIso:T1});
  assert.notEqual(next.id,old.id);
  assert.equal(getHistoricalComparisonRun(db,{storeId:'s',runId:old.id}).state,'stale');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM historical_comparison_days WHERE run_id=?').get(old.id).n,1);
});
```

- [ ] **Step 2: Write multi-store isolation test**

Verify two stores maintain independent runs, cursors, historical jobs, and results; completing one must not advance the other.

- [ ] **Step 3: Implement stale detection before every worker target**

Recompute current canonical identity at worker start. On mismatch: mark old run stale, create/request new run, do not append a day to the stale run, and complete the current job successfully with a stale/restart result so the queue does not retry the obsolete cursor forever.

- [ ] **Step 4: Run tests and commit**

```bash
node --test vps/tests/historical-staleness.test.mjs vps/tests/historical-worker.test.mjs
git add vps/src/research/historical-comparison.mjs vps/src/analysis/historical-refresh-state.mjs vps/src/jobs/historical-compare.mjs vps/tests/historical-staleness.test.mjs
git commit -m "fix: restart historical replay after canonical backfill"
```

---

### Task 7: Full verification and protected-surface audit

**Files:**
- Test only unless verification exposes a defect.
- Update: `docs/vps/VPS-RESEARCH-PHASE1-PREDEPLOY-CHECKPOINT.md` with the historical replay checkpoint after all tests pass.

**Interfaces:** none.

- [ ] **Step 1: Run targeted historical suites**

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

Expected: all PASS.

- [ ] **Step 2: Run the repository's complete CI-equivalent suites**

Run the same commands used in the existing GitHub Actions workflow for:

- VPS suite,
- root regression suite,
- Collector suite,
- production-preservation suite.

Expected: all PASS. Do not report success from targeted tests alone.

- [ ] **Step 3: Audit protected files against the pre-feature checkpoint**

Compare the implementation head against `f47f1698ba407ed97ef0caee4b82b0172d3467fd` and verify no unintended changes to:

```text
hanahana-judge.js
core-v510.js
Juggler judgment probability tables
protected externalJudge / Calibration / strict Champion logic
Collector request/response contract
```

`index.html` and `app-v510.js` should remain unchanged unless a failing preservation test proves an unavoidable need; if that happens, stop and ask Hiro before broadening scope.

- [ ] **Step 4: Verify no production ref moved**

Confirm `main` and `deploy/vps` still point to their pre-implementation SHAs. The feature branch may advance; production must not.

- [ ] **Step 5: Write checkpoint and commit**

Record final feature-branch SHA, tests/counts, protected-file audit, and deployment status (`not deployed`) in the checkpoint document, then commit:

```bash
git add docs/vps/VPS-RESEARCH-PHASE1-PREDEPLOY-CHECKPOINT.md
git commit -m "docs: checkpoint historical PRE validation"
```

- [ ] **Step 6: Stop at production boundary**

Report implementation/test evidence to Hiro and ask for separate explicit production deployment approval. Do not move `deploy/vps` in this task.
