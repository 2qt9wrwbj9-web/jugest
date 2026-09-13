import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {buildStoreFeatureRows,persistStoreFeatureRows} from '../src/research/feature-builder.mjs';
import {requestFeatureRefresh,getFeatureRefreshState,completeFeatureRefresh} from '../src/analysis/feature-refresh-state.mjs';
import {requestStoreAnalysisRefresh} from '../src/analysis/refresh-state.mjs';
import {Coordinator} from '../src/coordinator.mjs';
import {loadResourcePolicy} from '../src/config.mjs';
import {spawnJobChild} from '../src/child-runner.mjs';

const NOW='2026-09-13T00:00:00.000Z';
const FEATURE_VERSION='store-features-v1';

function day(date,rows){return {date,machines:rows}}
function machine(tableNo,{name='マイジャグラーV',games=5000,bb=20,rb=18,diff=0}={}){return {tableNo,sourceMachineName:name,machine:name.includes('ファンキー')?'fk':'my',games,bb,rb,diff}}
function memory(){return {hostTotalMiB:2048,hostAvailableMiB:1400,cgroupLimitMiB:2048,cgroupCurrentMiB:648,effectiveLimitMiB:2048,effectiveAvailableMiB:1400,usedRatio:.316,swapUsedMiB:0}}

function seedDb(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-research-p1-'));
  const dbPath=join(dir,'jugest.sqlite');
  const db=openDatabase(dbPath);migrate(db);
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','研究店','{}',NOW,NOW);
  const days=[
    day('2026-09-01',[machine('101',{diff:-500}),machine('102',{name:'ファンキージャグラー2',bb:21,rb:16,diff:300})]),
    day('2026-09-02',[machine('101',{diff:900}),machine('102',{name:'ファンキージャグラー2',bb:21,rb:16,diff:-100})]),
    day('2026-09-03',[machine('101',{diff:200}),machine('102',{name:'ファンキージャグラー2',bb:21,rb:16,diff:700})]),
    day('2026-09-04',[machine('101',{diff:99999}),machine('102',{name:'ファンキージャグラー2',bb:99,rb:99,diff:99999})])
  ];
  for(const d of days){
    db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at)
      VALUES(?,?,?,?,?,'valid',?,?,?)`).run('s1',d.date,'fixture','raw-'+d.date,'norm-'+d.date,'/tmp/'+d.date+'.gz',NOW,NOW);
    d.machines.forEach((row,index)=>db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)').run('s1',d.date,String(index).padStart(6,'0'),JSON.stringify(row)));
  }
  return {dir,dbPath,db,days,cleanup(){try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}};
}

test('feature rows use every Phase 1 window, exact bounded dimensions, and never read beyond asOfDate',()=>{
  const f=seedDb();
  try{
    const rows=buildStoreFeatureRows({storeId:'s1',days:f.days,featureVersion:FEATURE_VERSION,asOfDate:'2026-09-03'});
    assert.ok(rows.length>0);
    assert.ok(rows.every(row=>row.asOfDate==='2026-09-03'));
    assert.deepEqual([...new Set(rows.map(row=>row.windowDays))],[1,3,7,14,30,90,180]);
    assert.deepEqual([...new Set(rows.map(row=>row.dimensionKey))].sort(),['date_last_digit','machine_name','table_last_digit','table_no','weekday']);
    const table101=rows.find(row=>row.dimensionKey==='table_no'&&row.dimensionValue==='101'&&row.windowDays===3);
    assert.ok(table101);
    assert.equal(table101.dayCount,3);
    assert.equal(table101.rowCount,3);
    assert.deepEqual(table101.metrics,{gamesSum:15000,gamesMean:5000,bbSum:60,rbSum:54,diffSum:600,positiveDiffRate:2/3,observedRows:3});
    assert.match(table101.inputHash,/^[a-f0-9]{64}$/);
    const changedFuture=f.days.map(d=>d.date==='2026-09-04'?day(d.date,d.machines.map(m=>({...m,games:999999,bb:999,rb:999,diff:-999999}))):d);
    const again=buildStoreFeatureRows({storeId:'s1',days:changedFuture,featureVersion:FEATURE_VERSION,asOfDate:'2026-09-03'});
    assert.deepEqual(rows,again,'future-day mutations must not affect an earlier feature snapshot');
  }finally{f.cleanup()}
});

test('feature snapshot rows persist versioned as-of aggregates',()=>{
  const f=seedDb();
  try{
    const rows=buildStoreFeatureRows({storeId:'s1',days:f.days,featureVersion:FEATURE_VERSION,asOfDate:'2026-09-03'});
    const count=persistStoreFeatureRows(f.db,rows,{updatedAt:NOW});
    assert.equal(count,rows.length);
    const stored=f.db.prepare('SELECT COUNT(*) AS n,MAX(as_of_date) AS max_date FROM store_feature_snapshots WHERE store_id=?').get('s1');
    assert.equal(stored.n,rows.length);
    assert.equal(stored.max_date,'2026-09-03');
  }finally{f.cleanup()}
});

test('feature refresh coalesces to the newest requested frontier behind one low-priority job',()=>{
  const f=seedDb();
  try{
    const first=requestFeatureRefresh(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,frontierDate:'2026-09-03',nowIso:NOW,dirty:true});
    const second=requestFeatureRefresh(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,frontierDate:'2026-09-04',nowIso:'2026-09-13T00:00:01.000Z',dirty:true});
    assert.equal(first.job.type,'FEATURE_BUILD');
    assert.equal(first.job.priority,40);
    assert.equal(first.job.estimatedLeaseMiB,512);
    assert.equal(second.job.id,first.job.id);
    const state=getFeatureRefreshState(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION});
    assert.equal(state.requestedFrontierDate,'2026-09-04');
    assert.equal(state.completedFrontierDate,null);
    assert.equal(state.activeJobId,first.job.id);
  }finally{f.cleanup()}
});

test('feature completion enqueues exactly one follow-up when requested frontier advances during a run',()=>{
  const f=seedDb();
  try{
    const first=requestFeatureRefresh(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,frontierDate:'2026-09-03',nowIso:NOW,dirty:true});
    requestFeatureRefresh(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,frontierDate:'2026-09-04',nowIso:'2026-09-13T00:00:01.000Z',dirty:true});
    const completed=completeFeatureRefresh(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,jobId:first.job.id,completedFrontierDate:'2026-09-03',nowIso:'2026-09-13T00:00:02.000Z'});
    assert.ok(completed.job);
    assert.notEqual(completed.job.id,first.job.id);
    assert.equal(completed.job.payload.targetFrontierDate,'2026-09-04');
    const jobs=f.db.prepare("SELECT * FROM jobs WHERE type='FEATURE_BUILD' ORDER BY id").all();
    assert.equal(jobs.length,2);
    const state=getFeatureRefreshState(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION});
    assert.equal(state.completedFrontierDate,'2026-09-03');
    assert.equal(state.requestedFrontierDate,'2026-09-04');
    assert.equal(state.activeJobId,completed.job.id);
  }finally{f.cleanup()}
});

test('Coordinator never starts FEATURE_BUILD while any daily analysis is pending and runs only one research child',async()=>{
  const f=seedDb();
  try{
    requestStoreAnalysisRefresh(f.db,{storeId:'s1',analysisVersion:'vps-runtime-v1',nowIso:NOW,dirty:true});
    requestFeatureRefresh(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,frontierDate:'2026-09-04',nowIso:NOW,dirty:true});
    const calls=[];
    const coordinator=new Coordinator({db:f.db,memoryReader:async()=>memory(),spawnChild:options=>{calls.push(options);return {kill(){}}},owner:'research-gate',policy:loadResourcePolicy({maxAnalysisChildren:3}),clock:()=>new Date('2026-09-13T00:00:02.000Z')});
    await coordinator.tick();
    assert.deepEqual(calls.map(x=>x.job.type),['DAILY_ANALYSIS']);
  }finally{f.cleanup()}
});

test('Coordinator routes one FEATURE_BUILD child when ordinary analysis is idle',async()=>{
  const f=seedDb();
  try{
    requestFeatureRefresh(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,frontierDate:'2026-09-04',nowIso:NOW,dirty:true});
    f.db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s2','研究店2','{}',NOW,NOW);
    requestFeatureRefresh(f.db,{storeId:'s2',featureVersion:FEATURE_VERSION,frontierDate:'2026-09-04',nowIso:NOW,dirty:true});
    const calls=[];
    const coordinator=new Coordinator({db:f.db,memoryReader:async()=>memory(),spawnChild:options=>{calls.push(options);return {kill(){}}},owner:'research-one',policy:loadResourcePolicy({maxAnalysisChildren:3}),clock:()=>new Date('2026-09-13T00:00:02.000Z')});
    await coordinator.tick();
    assert.equal(calls.length,1,'Phase 1 research concurrency must stay at one child');
    assert.equal(calls[0].job.type,'FEATURE_BUILD');
    assert.match(String(calls[0].workerPath),/feature-build\.mjs$/);
  }finally{f.cleanup()}
});

test('real FEATURE_BUILD child replaces one as-of slice, advances frontier, and reports one-store task telemetry',async()=>{
  const f=seedDb();
  try{
    const {job}=requestFeatureRefresh(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,frontierDate:'2026-09-03',nowIso:NOW,dirty:true});
    f.db.prepare(`INSERT INTO store_feature_snapshots(store_id,feature_version,as_of_date,dimension_key,dimension_value,window_days,day_count,machine_count,row_count,metrics_json,input_hash,updated_at)
      VALUES('s1',?,'2026-09-03','stale_dimension','stale',30,1,1,1,'{}','stale',?)`).run(FEATURE_VERSION,NOW);
    const messages=[];
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('feature child timeout')),10000);
      spawnJobChild({job,leaseMiB:512,heapMiB:332,workerPath:new URL('../src/jobs/feature-build.mjs',import.meta.url),childEnv:{JUGEST_DB_PATH:f.dbPath},onMessage:message=>{messages.push(message);if(message.type==='complete'){clearTimeout(timeout);resolve()}},onExit:code=>{if(code!==0&&messages.every(x=>x.type!=='complete')){clearTimeout(timeout);reject(new Error(`feature child exited ${code}`))}}});
    });
    const starts=messages.filter(x=>x.type==='task_start');
    const done=messages.find(x=>x.type==='complete');
    assert.equal(starts.length,1);
    assert.equal(starts[0].taskMeta.taskKind,'feature_build');
    assert.equal(starts[0].taskMeta.storeMachineCount,2);
    assert.equal(starts[0].taskMeta.dayCount,3);
    assert.equal(starts[0].taskMeta.rowCount,6);
    assert.equal(done.status,'built');
    assert.equal(done.taskMetrics.taskKind,'feature_build');
    assert.equal(done.taskMetrics.storeMachineCount,2);
    assert.equal(done.taskMetrics.dayCount,3);
    assert.equal(done.taskMetrics.rowCount,6);
    assert.ok(done.featureRowCount>0);
    assert.ok(Number.isFinite(done.taskMetrics.peakRssMiB));
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM store_feature_snapshots WHERE store_id='s1' AND as_of_date='2026-09-03' AND dimension_key='stale_dimension'").get().n,0,'same as-of slice must be replaced atomically');
    const state=getFeatureRefreshState(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION});
    assert.equal(state.completedFrontierDate,'2026-09-03');
    assert.equal(state.activeJobId,null);
  }finally{f.cleanup()}
});

test('Coordinator persists exactly one per-store metric row from task_start through completion',async()=>{
  const f=seedDb();
  try{
    requestFeatureRefresh(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,frontierDate:'2026-09-04',nowIso:NOW,dirty:true});
    const calls=[];
    const coordinator=new Coordinator({
      db:f.db,
      memoryReader:async()=>memory(),
      spawnChild:options=>{calls.push(options);return {kill(){}}},
      owner:'metric-persist',
      policy:loadResourcePolicy({maxAnalysisChildren:1}),
      clock:(()=>{let i=0;const values=['2026-09-13T00:00:02.000Z','2026-09-13T00:00:03.500Z','2026-09-13T00:00:04.000Z'];return ()=>new Date(values[Math.min(i++,values.length-1)])})()
    });
    await coordinator.tick();
    assert.equal(calls.length,1);
    await calls[0].onMessage({type:'task_start',taskMeta:{phase:1,taskKind:'feature_build',taskVersion:FEATURE_VERSION,modelFingerprint:null,storeId:'s1',storeMachineCount:241,dayCount:180,rowCount:42000,workloadUnits:42000,startedAt:'2026-09-13T00:00:02.000Z',startRssMiB:80,details:{machineCountMethod:'latest'}}});
    await calls[0].onMessage({type:'complete',peakRssMiB:333,taskMetrics:{endedAt:'2026-09-13T00:00:03.500Z',durationMs:1500,endRssMiB:92,peakRssMiB:333,cpuMs:77},resultHash:'metric-hash'});
    const rows=f.db.prepare('SELECT * FROM analysis_task_metrics WHERE store_id=? ORDER BY id').all('s1');
    assert.equal(rows.length,1);
    assert.equal(rows[0].task_kind,'feature_build');
    assert.equal(rows[0].store_machine_count,241);
    assert.equal(rows[0].store_size_bucket,'201-300');
    assert.equal(rows[0].row_count,42000);
    assert.equal(rows[0].peak_rss_mib,333);
    assert.equal(rows[0].cpu_ms,77);
    assert.equal(rows[0].status,'succeeded');
  }finally{f.cleanup()}
});
