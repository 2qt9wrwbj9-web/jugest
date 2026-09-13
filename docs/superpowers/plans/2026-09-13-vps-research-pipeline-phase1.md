# VPS Research Pipeline Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存 `DAILY_ANALYSIS` を壊さずに、1店舗1処理単位の詳細リソース計測、低優先度 `FEATURE_BUILD`、研究用 `store_feature_snapshots`、VPSリソース画面の処理実績表示を実装する。

**Architecture:** 既存Coordinator/SQLite/job queueをそのまま中核にし、重処理は子プロセスで実行する。共通のtask telemetry protocolを子→Coordinatorへ送り、Coordinatorが `analysis_task_metrics` を永続化する。通常解析完了後に同店舗の特徴量frontierが古い場合だけ `FEATURE_BUILD` をcoalesceし、通常解析が待機・実行中なら研究ジョブを新規開始しない。

**Tech Stack:** Node.js >=22.13, ESM, node:test, better-sqlite3系既存DB wrapper, SQLite,既存Coordinator/job queue, Shadow DOM resource UI.

**Spec:** `docs/superpowers/specs/2026-09-13-vps-research-pipeline-design.md`

## Global Constraints

- 既存のJuggler/HANA確率テーブル、`externalJudge`、単一根拠数学、strict Champion、Calibration、store-share constraint、HANA hard constraintsを変更しない。
- 自己改善対象は店舗読み・投入傾向予測レイヤーのみ。Phase 1では既存店舗解析の表示・判定結果を変更しない。
- canonical ingest、保存、通常 `DAILY_ANALYSIS` は `FEATURE_BUILD` より常に優先する。
- immutable raw retentionを変更しない。
- iPhone取得フロー/Collector契約を変更しない。
- 研究系同時実行数はPhase 1では1固定。
- Production deployは実装完了後もヒロの明示許可を必要とする。
- root/public相当の既存保護対象や現行ホームアイコン、FOUC対策を変更しない。

---

## File Structure

### Create
- `vps/src/analysis/task-metrics.mjs` — 共通task metric正規化・永続化・店舗台数算出。
- `vps/src/analysis/feature-refresh-state.mjs` — `FEATURE_BUILD` のcoalescing/frontier管理。
- `vps/src/research/feature-builder.mjs` — canonical store daysからversioned feature rowsを生成。
- `vps/src/jobs/feature-build.mjs` — `FEATURE_BUILD` child worker。
- `vps/tests/task-metrics.test.mjs`
- `vps/tests/feature-builder.test.mjs`
- `vps/tests/feature-build-worker.test.mjs`
- `vps/tests/research-priority.test.mjs`
- `tests/vps-resource-task-history.mjs`

### Modify
- `vps/src/schema.mjs` — `analysis_task_metrics`, `store_feature_snapshots`, `feature_refresh_state`。
- `vps/src/analysis/daily-analysis.mjs` — feature refresh予約に必要な完了metadata返却。数学/出力payloadは不変。
- `vps/src/jobs/daily-analysis.mjs` — standard telemetry envelopeを送信。
- `vps/src/coordinator.mjs` — `FEATURE_BUILD` worker routing、研究優先度gate、task metric persistence。
- `vps/src/resource-telemetry.mjs` — 直近task historyをread-onlyで返す。
- `vps-resource-ui.mjs` — 「処理実績」カード表示。
- `vps/tests/daily-analysis-child.test.mjs`
- `vps/tests/daily-analysis-worker.test.mjs`
- `vps/tests/coordinator.test.mjs`
- `vps/tests/resource-telemetry.test.mjs`
- `vps/tests/resource-api.test.mjs`
- `tests/commands.json` — root static regression追加。
- `docs/vps/VPS-RESOURCE-TELEMETRY.md` — task historyの意味と測定限界。

---

### Task 1: Add durable per-store task metrics schema and helpers

**Files:**
- Modify: `vps/src/schema.mjs`
- Create: `vps/src/analysis/task-metrics.mjs`
- Test: `vps/tests/task-metrics.test.mjs`

**Interfaces:**
- Produces: `deriveStoreMachineCount(days) -> {count:number, method:'latest'|'median7'}`
- Produces: `sizeBucket(machineCount) -> '1-100'|'101-200'|'201-300'|'301-500'|'501+'`
- Produces: `persistTaskMetric(db, metric) -> id:number`
- Produces table `analysis_task_metrics` consumed by Task 5 and Task 6.

- [ ] **Step 1: Write failing schema/helper tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {deriveStoreMachineCount,sizeBucket,persistTaskMetric} from '../src/analysis/task-metrics.mjs';

test('machine count uses latest valid day and falls back to median of last seven non-empty days',()=>{
  assert.deepEqual(deriveStoreMachineCount([
    {date:'2026-09-01',machines:[{tableNo:'1'},{tableNo:'2'}]},
    {date:'2026-09-02',machines:[{tableNo:'1'},{tableNo:'2'},{tableNo:'3'}]}
  ]),{count:3,method:'latest'});
  assert.deepEqual(deriveStoreMachineCount([
    {date:'2026-09-01',machines:Array.from({length:100},(_,i)=>({tableNo:String(i)}))},
    {date:'2026-09-02',machines:[]},
    {date:'2026-09-03',machines:[]}
  ]),{count:100,method:'median7'});
});

test('task metric persists store scale and peak rss',()=>{
  const db=openDatabase(':memory:');migrate(db);
  const id=persistTaskMetric(db,{
    jobId:7,storeId:'s1',phase:1,taskKind:'daily_analysis',taskVersion:'v1',modelFingerprint:null,
    storeMachineCount:241,dayCount:180,rowCount:42000,workloadUnits:42000,
    startedAt:'2026-09-13T00:00:00.000Z',endedAt:'2026-09-13T00:00:05.600Z',durationMs:5600,
    startRssMiB:72,endRssMiB:81,peakRssMiB:207,cpuMs:1100,status:'succeeded',errorClass:null,details:{machineCountMethod:'latest'}
  });
  const row=db.prepare('SELECT * FROM analysis_task_metrics WHERE id=?').get(id);
  assert.equal(row.store_size_bucket,'201-300');
  assert.equal(row.peak_rss_mib,207);
});
```

- [ ] **Step 2: Run RED test**

Run: `cd vps && node --test tests/task-metrics.test.mjs`

Expected: FAIL because table/module does not exist.

- [ ] **Step 3: Add schema**

Add to `migrate()`:

```sql
CREATE TABLE IF NOT EXISTS analysis_task_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER,
  store_id TEXT NOT NULL,
  phase INTEGER NOT NULL CHECK (phase IN (1,2,3)),
  task_kind TEXT NOT NULL,
  task_version TEXT NOT NULL,
  model_fingerprint TEXT,
  store_machine_count INTEGER NOT NULL,
  store_size_bucket TEXT NOT NULL,
  day_count INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  workload_units INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  start_rss_mib REAL,
  end_rss_mib REAL,
  peak_rss_mib REAL,
  cpu_ms REAL,
  status TEXT NOT NULL CHECK (status IN ('succeeded','failed','cancelled')),
  error_class TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE SET NULL,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS analysis_task_metrics_store_time_idx
  ON analysis_task_metrics(store_id,started_at DESC);
CREATE INDEX IF NOT EXISTS analysis_task_metrics_kind_time_idx
  ON analysis_task_metrics(task_kind,started_at DESC);
```

- [ ] **Step 4: Implement helpers**

Core normalization rules in `task-metrics.mjs`:

```js
export function sizeBucket(n){
  const v=Math.max(0,Math.trunc(Number(n)||0));
  if(v<=100)return '1-100';
  if(v<=200)return '101-200';
  if(v<=300)return '201-300';
  if(v<=500)return '301-500';
  return '501+';
}

function uniqueMachineCount(day){
  const keys=new Set((day?.machines||[]).map((m,i)=>String(m?.tableNo??m?.machineKey??i)));
  return keys.size;
}

export function deriveStoreMachineCount(days){
  const ordered=[...(days||[])].filter(Boolean);
  const latest=ordered.at(-1);
  const latestCount=uniqueMachineCount(latest);
  if(latestCount>0)return {count:latestCount,method:'latest'};
  const counts=ordered.slice(-7).map(uniqueMachineCount).filter(n=>n>0).sort((a,b)=>a-b);
  const mid=counts.length?counts[Math.floor((counts.length-1)/2)]:0;
  return {count:mid,method:'median7'};
}
```

`persistTaskMetric` validates required fields, canonical-JSON encodes details, derives bucket from machine count, inserts one row, returns `lastInsertRowid`.

- [ ] **Step 5: Run GREEN test and full VPS suite**

Run: `cd vps && node --test tests/task-metrics.test.mjs && npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add vps/src/schema.mjs vps/src/analysis/task-metrics.mjs vps/tests/task-metrics.test.mjs
git commit -m "feat: add per-store analysis task metrics"
```

---

### Task 2: Instrument existing DAILY_ANALYSIS without changing analysis semantics

**Files:**
- Modify: `vps/src/jobs/daily-analysis.mjs`
- Modify: `vps/src/analysis/daily-analysis.mjs`
- Modify: `vps/src/coordinator.mjs`
- Test: `vps/tests/daily-analysis-child.test.mjs`
- Test: `vps/tests/daily-analysis-worker.test.mjs`
- Test: `vps/tests/coordinator.test.mjs`

**Interfaces:**
- Child sends `task_start` once before heavy runner and includes `taskMetrics` in `complete`/`error`.
- Coordinator stores `entry.taskMeta` and persists one `daily_analysis` row on complete/error/cancel.
- `DAILY_ANALYSIS` business result hash/state/snapshots remain byte-semantically identical for same inputs.

- [ ] **Step 1: Write RED tests for telemetry protocol**

Add assertions that a daily child emits:

```js
assert.equal(start.type,'task_start');
assert.equal(start.taskMeta.taskKind,'daily_analysis');
assert.equal(start.taskMeta.phase,1);
assert.equal(start.taskMeta.storeMachineCount,1);
assert.equal(start.taskMeta.dayCount,4);
assert.equal(start.taskMeta.rowCount,4);
assert.ok(Number.isFinite(done.taskMetrics.peakRssMiB));
assert.ok(Number.isFinite(done.taskMetrics.cpuMs));
```

Add Coordinator test that `_finishComplete` persistence creates exactly one `analysis_task_metrics` row with `task_kind='daily_analysis'` and the same job/store.

- [ ] **Step 2: Run RED tests**

Run: `cd vps && node --test tests/daily-analysis-child.test.mjs tests/daily-analysis-worker.test.mjs tests/coordinator.test.mjs`

Expected: FAIL on missing task telemetry.

- [ ] **Step 3: Extend worker return metadata without touching result payload**

In `executeDailyAnalysis`, return existing fields plus:

```js
return {
  ...existing,
  storeMachineCount: deriveStoreMachineCount(loaded.days).count,
  machineCountMethod: deriveStoreMachineCount(loaded.days).method
};
```

Do not add these fields into `outputPayload`, `analysis_state.state_json`, or existing client snapshots.

- [ ] **Step 4: Add standard child measurement envelope**

At child start capture:

```js
const startedAt=new Date().toISOString();
const startRssMiB=process.memoryUsage().rss/MIB;
const cpuStart=process.cpuUsage();
const maxRssMiB=()=>process.resourceUsage().maxRSS/1024;
```

After canonical days are known, send:

```js
process.send?.({type:'task_start',taskMeta:{
  phase:1,taskKind:'daily_analysis',taskVersion:'vps-runtime-v1',storeId:descriptor.payload.storeId,
  storeMachineCount:out.storeMachineCount,dayCount:out.dayCount,rowCount:out.rowCount,
  workloadUnits:out.rowCount,startedAt,startRssMiB,details:{machineCountMethod:out.machineCountMethod}
}});
```

On completion/error, include `taskMetrics` containing `endedAt`, `durationMs`, `endRssMiB`, `peakRssMiB=max(heartbeat,maxRSS,endRSS)`, and CPU milliseconds from `process.cpuUsage(cpuStart)`.

- [ ] **Step 5: Persist task metric in Coordinator**

Coordinator message handling:

```js
if(message.type==='task_start'){
  entry.taskMeta=Object.freeze({...message.taskMeta});
  return;
}
```

On complete/error/cancel call a single helper such as:

```js
persistTaskMetric(this.db,{
  jobId:entry.job.id,
  ...entry.taskMeta,
  ...message.taskMetrics,
  peakRssMiB:Math.max(entry.peakRssMiB,Number(message.taskMetrics?.peakRssMiB)||0),
  status:'succeeded'
});
```

For emergency cancel, synthesize `endedAt=at`, `durationMs=Date.parse(at)-Date.parse(startedAt)`, `endRssMiB=null`, `cpuMs=null`, `status='cancelled'`, `errorClass='memory_emergency'`.

- [ ] **Step 6: Verify semantic parity**

Run: `cd vps && node --test tests/daily-analysis-child.test.mjs tests/daily-analysis-worker.test.mjs tests/coordinator.test.mjs && npm test`

Expected: PASS; existing snapshot/hash assertions unchanged.

- [ ] **Step 7: Commit**

```bash
git add vps/src/jobs/daily-analysis.mjs vps/src/analysis/daily-analysis.mjs vps/src/coordinator.mjs vps/tests/daily-analysis-child.test.mjs vps/tests/daily-analysis-worker.test.mjs vps/tests/coordinator.test.mjs
git commit -m "feat: record daily analysis workload metrics"
```

---

### Task 3: Build deterministic research feature snapshots

**Files:**
- Modify: `vps/src/schema.mjs`
- Create: `vps/src/research/feature-builder.mjs`
- Test: `vps/tests/feature-builder.test.mjs`

**Interfaces:**
- Produces: `buildStoreFeatureRows({storeId,days,featureVersion,asOfDate}) -> FeatureRow[]`
- Feature rows are deterministic and derived only from `business_date <= asOfDate`.
- Phase 1 stores descriptive/count/trend inputs only; no protected setting-judgment math is modified.

- [ ] **Step 1: Write RED tests for no-future and deterministic features**

Use machine payload shape already used by canonical tests (`tableNo`, `sourceMachineName`, `games`, `bb`, `rb`, `diff`). Assert:

```js
const rows=buildStoreFeatureRows({storeId:'s1',featureVersion:'feature-v1',asOfDate:'2026-09-10',days});
assert.ok(rows.every(r=>r.asOfDate==='2026-09-10'));
assert.ok(rows.every(r=>!JSON.stringify(r).includes('2026-09-11')));
assert.deepEqual(rows,buildStoreFeatureRows({storeId:'s1',featureVersion:'feature-v1',asOfDate:'2026-09-10',days}));
assert.ok(rows.some(r=>r.dimensionKey==='weekday'));
assert.ok(rows.some(r=>r.dimensionKey==='date_last_digit'));
assert.ok(rows.some(r=>r.dimensionKey==='machine_name'));
assert.ok(rows.some(r=>r.dimensionKey==='table_no'));
assert.ok(rows.some(r=>r.dimensionKey==='table_last_digit'));
```

- [ ] **Step 2: Run RED**

Run: `cd vps && node --test tests/feature-builder.test.mjs`

- [ ] **Step 3: Add `store_feature_snapshots` schema**

```sql
CREATE TABLE IF NOT EXISTS store_feature_snapshots (
  store_id TEXT NOT NULL,
  feature_version TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  dimension_key TEXT NOT NULL,
  dimension_value TEXT NOT NULL,
  window_days INTEGER NOT NULL,
  day_count INTEGER NOT NULL,
  machine_count INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  metrics_json TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(store_id,feature_version,as_of_date,dimension_key,dimension_value,window_days),
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS store_feature_snapshots_lookup_idx
  ON store_feature_snapshots(store_id,feature_version,as_of_date,dimension_key,window_days);
```

- [ ] **Step 4: Implement bounded feature families**

Implement windows `[1,3,7,14,30,90,180]` and only these Phase 1 dimension families:

```js
const DIMENSIONS=['weekday','date_last_digit','machine_name','table_no','table_last_digit'];
```

For each dimension/window persist canonical descriptive metrics only:

```js
{
  gamesSum,
  gamesMean,
  bbSum,
  rbSum,
  diffSum,
  positiveDiffRate,
  observedRows
}
```

Missing numeric source values are excluded from that metric denominator, not coerced to wins/losses. No Cartesian interaction generation in Phase 1.

- [ ] **Step 5: Verify deterministic hashing and no future leakage**

`inputHash=hashCanonical({storeId,featureVersion,asOfDate,windowDays,dimensionKey,dimensionValue,inputRows})`.

Run: `cd vps && node --test tests/feature-builder.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add vps/src/schema.mjs vps/src/research/feature-builder.mjs vps/tests/feature-builder.test.mjs
git commit -m "feat: add deterministic store feature snapshots"
```

---

### Task 4: Add coalesced FEATURE_BUILD scheduling and low-priority admission

**Files:**
- Modify: `vps/src/schema.mjs`
- Create: `vps/src/analysis/feature-refresh-state.mjs`
- Modify: `vps/src/analysis/daily-analysis.mjs`
- Modify: `vps/src/coordinator.mjs`
- Test: `vps/tests/feature-build-worker.test.mjs`
- Test: `vps/tests/research-priority.test.mjs`
- Test: `vps/tests/daily-analysis-worker.test.mjs`

**Interfaces:**
- Produces: `requestFeatureRefresh(db,{storeId,featureVersion,frontierDate,nowIso,dirty}) -> {state,job}`
- `FEATURE_BUILD` priority is `40`; `DAILY_ANALYSIS` remains `20`.
- Only one active feature job exists per store/version.

- [ ] **Step 1: Write RED scheduling tests**

```js
const a=requestFeatureRefresh(db,{storeId:'s1',featureVersion:'feature-v1',frontierDate:'2026-09-10',nowIso:NOW,dirty:true});
const b=requestFeatureRefresh(db,{storeId:'s1',featureVersion:'feature-v1',frontierDate:'2026-09-11',nowIso:LATER,dirty:true});
assert.equal(a.job.id,b.job.id,'dirty events coalesce while one feature job is active');
assert.equal(a.job.priority,40);
```

Coordinator test:

```js
// FEATURE_BUILD is queued, then DAILY_ANALYSIS arrives before next admission.
// Coordinator must start DAILY_ANALYSIS first and not start a new research child while daily is queued/running.
assert.deepEqual(result.started.map(x=>x.type),['DAILY_ANALYSIS']);
```

- [ ] **Step 2: Run RED**

Run: `cd vps && node --test tests/feature-build-worker.test.mjs tests/research-priority.test.mjs tests/daily-analysis-worker.test.mjs`

- [ ] **Step 3: Add feature refresh state schema**

```sql
CREATE TABLE IF NOT EXISTS feature_refresh_state (
  store_id TEXT NOT NULL,
  feature_version TEXT NOT NULL,
  requested_frontier_date TEXT NOT NULL,
  completed_frontier_date TEXT,
  active_job_id INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(store_id,feature_version),
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY(active_job_id) REFERENCES jobs(id) ON DELETE SET NULL
);
```

- [ ] **Step 4: Implement coalescing**

`requestFeatureRefresh` mirrors the proven `analysis_refresh_state` pattern, but coalesces on latest requested frontier and enqueues:

```js
enqueueJob(db,{
  type:'FEATURE_BUILD',
  priority:40,
  idempotencyKey:`feature:${storeId}:${featureVersion}:${requestedFrontierDate}`,
  payload:{storeId,featureVersion,targetFrontierDate:requestedFrontierDate},
  sizeClass:'medium',estimatedLeaseMiB:512,maxAttempts:3,createdAtIso:nowIso
});
```

- [ ] **Step 5: Hook daily completion to feature refresh**

After `DAILY_ANALYSIS` commits its existing snapshots/state, call `requestFeatureRefresh(...dirty:true)` using its latest business date. This may create a feature job but must not alter daily output/hash.

- [ ] **Step 6: Add Scheduler research gate**

In Coordinator admission, before starting `FEATURE_BUILD`:

```js
const operationalPending=this.db.prepare(`SELECT 1 FROM jobs
  WHERE type='DAILY_ANALYSIS' AND state IN ('queued','leased','running','retry_wait') LIMIT 1`).get();
if(next.type==='FEATURE_BUILD'&&operationalPending)break;
const runningResearch=[...this.running.values()].filter(e=>e.job?.type==='FEATURE_BUILD'&&!e.finished&&!e.cancelled).length;
if(next.type==='FEATURE_BUILD'&&runningResearch>=1)break;
```

Do not preempt a healthy already-running feature child merely because a daily job arrived; it yields after the finite store job ends. Existing memory emergency cancellation still applies.

- [ ] **Step 7: Run GREEN/full suite**

Run: `cd vps && node --test tests/feature-build-worker.test.mjs tests/research-priority.test.mjs tests/daily-analysis-worker.test.mjs tests/coordinator.test.mjs && npm test`

- [ ] **Step 8: Commit**

```bash
git add vps/src/schema.mjs vps/src/analysis/feature-refresh-state.mjs vps/src/analysis/daily-analysis.mjs vps/src/coordinator.mjs vps/tests/feature-build-worker.test.mjs vps/tests/research-priority.test.mjs vps/tests/daily-analysis-worker.test.mjs
git commit -m "feat: schedule low-priority store feature builds"
```

---

### Task 5: Implement FEATURE_BUILD child worker and persistence

**Files:**
- Create: `vps/src/jobs/feature-build.mjs`
- Modify: `vps/src/coordinator.mjs`
- Test: `vps/tests/feature-build-worker.test.mjs`
- Test: `vps/tests/coordinator.test.mjs`

**Interfaces:**
- `FEATURE_BUILD` child loads max 180 valid days through `loadStoreDays`.
- It writes one as-of frontier atomically: delete/replace only same `(store,featureVersion,asOfDate)` slice inside a transaction.
- It sends the same `task_start` + `taskMetrics` protocol as daily analysis with `taskKind='feature_build'`.

- [ ] **Step 1: Extend RED worker test**

Assert one job creates rows for windows and dimensions, advances `completed_frontier_date`, and emits metrics:

```js
assert.equal(done.taskMetrics.taskKind,'feature_build');
assert.equal(done.taskMetrics.storeMachineCount,241);
assert.equal(done.taskMetrics.dayCount,180);
assert.ok(done.taskMetrics.rowCount>0);
assert.ok(done.taskMetrics.peakRssMiB>0);
assert.ok(db.prepare("SELECT COUNT(*) n FROM store_feature_snapshots WHERE store_id='s1'").get().n>0);
```

- [ ] **Step 2: Run RED**

Run: `cd vps && node --test tests/feature-build-worker.test.mjs`

- [ ] **Step 3: Implement child worker**

Worker flow:

```js
const descriptor=decodeDescriptor(process.argv[2]);
if(descriptor.type!=='FEATURE_BUILD')throw new Error('unsupported job type');
const loaded=loadStoreDays(db,descriptor.payload.storeId,{limit:180});
const asOfDate=String(descriptor.payload.targetFrontierDate||loaded.days.at(-1)?.date||'');
const eligible=loaded.days.filter(day=>day.date<=asOfDate);
const rows=buildStoreFeatureRows({storeId:descriptor.payload.storeId,days:eligible,featureVersion:descriptor.payload.featureVersion,asOfDate});
```

Within `BEGIN IMMEDIATE`:
1. Delete existing rows for same store/version/as-of.
2. Insert generated rows.
3. Set `completed_frontier_date=asOfDate`, clear `active_job_id` if this job still owns it.
4. If requested frontier moved while running, enqueue exactly one follow-up through `requestFeatureRefresh(...dirty:false)`.
5. Commit.

- [ ] **Step 4: Route worker in Coordinator**

Add:

```js
const FEATURE_BUILD_WORKER=new URL('./jobs/feature-build.mjs',import.meta.url);
```

Default routing becomes:

```js
job=>job.type==='DAILY_ANALYSIS'?DAILY_ANALYSIS_WORKER:
     job.type==='FEATURE_BUILD'?FEATURE_BUILD_WORKER:
     SYNTHETIC_WORKER
```

- [ ] **Step 5: Verify workload metrics and follow-up coalescing**

Run: `cd vps && node --test tests/feature-build-worker.test.mjs tests/coordinator.test.mjs && npm test`

Expected: PASS; feature jobs produce `analysis_task_metrics.task_kind='feature_build'`.

- [ ] **Step 6: Commit**

```bash
git add vps/src/jobs/feature-build.mjs vps/src/coordinator.mjs vps/tests/feature-build-worker.test.mjs vps/tests/coordinator.test.mjs
git commit -m "feat: execute feature builds in measured child jobs"
```

---

### Task 6: Expose bounded task history in VPS resource diagnostics

**Files:**
- Modify: `vps/src/resource-telemetry.mjs`
- Modify: `vps-resource-ui.mjs`
- Modify: `vps/tests/resource-telemetry.test.mjs`
- Modify: `vps/tests/resource-api.test.mjs`
- Create: `tests/vps-resource-task-history.mjs`
- Modify: `tests/commands.json`
- Modify: `docs/vps/VPS-RESOURCE-TELEMETRY.md`

**Interfaces:**
- `/api/vps/system/resources` gains `analysis.taskHistory`, max 20 entries by default and max 50 hard cap.
- No new write API.
- UI shows task kind, store, machine count, days, row count, peak RAM, CPU, duration, status.

- [ ] **Step 1: Write RED telemetry/API/UI tests**

Backend assertion:

```js
assert.deepEqual(status.analysis.taskHistory[0],{
  metricId:1,jobId:7,storeId:'s1',taskKind:'feature_build',phase:1,
  storeMachineCount:241,storeSizeBucket:'201-300',dayCount:180,rowCount:42000,
  workloadUnits:42000,startedAt:'...',endedAt:'...',durationMs:14200,
  startRssBytes:72*1024*1024,endRssBytes:81*1024*1024,peakRssBytes:380*1024*1024,
  cpuMs:2500,status:'succeeded',errorClass:null,modelFingerprint:null
});
```

Static UI regression must assert the source contains labels `処理実績`, `台数`, `Peak RAM`, `CPU` and renders `taskHistory`.

- [ ] **Step 2: Run RED**

Run:

```bash
cd vps && node --test tests/resource-telemetry.test.mjs tests/resource-api.test.mjs
cd .. && node tests/vps-resource-task-history.mjs
```

- [ ] **Step 3: Add bounded read model**

In `readRuntimeTelemetry`, query:

```sql
SELECT m.id,m.job_id,m.store_id,m.phase,m.task_kind,m.model_fingerprint,
       m.store_machine_count,m.store_size_bucket,m.day_count,m.row_count,m.workload_units,
       m.started_at,m.ended_at,m.duration_ms,m.start_rss_mib,m.end_rss_mib,m.peak_rss_mib,
       m.cpu_ms,m.status,m.error_class,s.name AS store_name
FROM analysis_task_metrics m
LEFT JOIN stores s ON s.id=m.store_id
ORDER BY m.id DESC LIMIT ?
```

Convert MiB to bytes consistently with existing telemetry.

- [ ] **Step 4: Render Process History card**

Add a card after Scheduler. Each row shows:

```html
<div class="vps-resource-task-row">
  <b>拡張解析 · 解析店</b>
  <small>241台 · 180日 · 42,000台日</small>
  <small>Peak RAM 380 MB · CPU 2.5秒 · 14.2秒 · 成功</small>
</div>
```

Labels:
- `daily_analysis` => `通常解析`
- `feature_build` => `拡張解析`

Keep existing JUGEST typography and Shadow Root behavior untouched.

- [ ] **Step 5: Document measurement semantics**

Add explicit notes:
- Peak RAM is max child RSS evidence, not exact incremental RAM attributable only to algorithm objects.
- Store machine count is latest valid day, median-of-last-seven fallback.
- Failed/cancelled runs can have null end RSS/CPU.
- UI history is bounded; durable truth remains SQLite.

- [ ] **Step 6: Run GREEN and root regressions**

Run:

```bash
cd vps && npm test
cd .. && node tests/vps-resource-task-history.mjs && node tests/run-regressions.mjs
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add vps/src/resource-telemetry.mjs vps-resource-ui.mjs vps/tests/resource-telemetry.test.mjs vps/tests/resource-api.test.mjs tests/vps-resource-task-history.mjs tests/commands.json docs/vps/VPS-RESOURCE-TELEMETRY.md
git commit -m "feat: show per-store analysis workload history"
```

---

### Task 7: Phase 1 integration verification and preservation gate

**Files:**
- Create: `docs/vps/VPS-RESEARCH-PHASE1-VERIFICATION.md`
- Test: existing full suites plus focused integration tests.

**Interfaces:**
- Phase 2 may rely on `analysis_task_metrics`, `store_feature_snapshots`, `feature_refresh_state`, standard child telemetry protocol, and `FEATURE_BUILD` priority semantics.

- [ ] **Step 1: Run focused integration sequence**

Create a temp DB with one store and >=4 canonical days, enqueue daily refresh, run Coordinator with real daily child, then real feature child. Assert:

```js
assert.equal(db.prepare("SELECT COUNT(*) n FROM analysis_task_metrics WHERE task_kind='daily_analysis'").get().n,1);
assert.equal(db.prepare("SELECT COUNT(*) n FROM analysis_task_metrics WHERE task_kind='feature_build'").get().n,1);
assert.ok(db.prepare("SELECT COUNT(*) n FROM store_feature_snapshots").get().n>0);
assert.equal(db.prepare("SELECT COUNT(*) n FROM jobs WHERE state='failed'").get().n,0);
```

- [ ] **Step 2: Run complete verification**

```bash
cd vps && npm test
cd .. && node tests/run-regressions.mjs
```

Also run any existing protected semantic/parity regressions listed by `tests/commands.json` that cover Juggler/HANA judgments, strict Champion, store analysis, and production preservation.

Expected: PASS with no intentional protected-output changes.

- [ ] **Step 3: Verify diff scope**

Required result: no modifications to Juggler/HANA probability tables, `externalJudge`, strict Champion, Calibration, store-share constraint, HANA hard constraints, Collector transport, raw retention, or deployment branch.

- [ ] **Step 4: Write verification report**

Record:
- branch/head SHA
- exact tests and results
- schema additions
- observed sample metric from fixture
- preservation statement
- known Phase 1 limits: no axis discovery/backtest/model search yet; research concurrency fixed at 1.

- [ ] **Step 5: Commit**

```bash
git add docs/vps/VPS-RESEARCH-PHASE1-VERIFICATION.md
git commit -m "docs: verify research pipeline phase 1"
```

---

## Self-review result

- Spec coverage: Phase 1 requirements are mapped to Tasks 1-7: common metrics, daily instrumentation, feature store, coalesced low-priority feature jobs, child memory/CPU measurement, resource UI, preservation verification.
- Placeholder scan: no TBD/TODO/"similar to" placeholders are allowed in execution; exact interfaces, schemas, commands and expected behavior are defined above.
- Type consistency: `taskKind` values used in code map to persisted `task_kind`; `FEATURE_BUILD` uses `featureVersion`/`targetFrontierDate`; telemetry API returns byte values while SQLite stores MiB, matching current resource telemetry convention.
- Deferred by design: Phase 2 backtest, Phase 3 axis discovery/model search, Phase 4 closed-loop promotion. Phase 1 must not alter active store predictions.
