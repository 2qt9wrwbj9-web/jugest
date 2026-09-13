import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {buildStoreFeatureRows,persistStoreFeatureRows} from '../src/research/feature-builder.mjs';
import {requestStoreFeatureRefresh,getFeatureRefreshState} from '../src/analysis/feature-refresh-state.mjs';
import {requestStoreAnalysisRefresh} from '../src/analysis/refresh-state.mjs';
import {Coordinator} from '../src/coordinator.mjs';
import {loadResourcePolicy} from '../src/config.mjs';
import {spawnJobChild} from '../src/child-runner.mjs';

const NOW='2026-09-13T00:00:00.000Z';
const FEATURE_VERSION='store-features-v1';

function day(date,rows){return {date,machines:rows}}
function machine(tableNo,{name='マイジャグラーV',games=5000,diff=0}={}){return {tableNo,sourceMachineName:name,machine:name.includes('ファンキー')?'fk':'my',games,diff}}
function memory(){return {hostTotalMiB:2048,hostAvailableMiB:1400,cgroupLimitMiB:2048,cgroupCurrentMiB:648,effectiveLimitMiB:2048,effectiveAvailableMiB:1400,usedRatio:.316,swapUsedMiB:0}}

function seedDb(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-research-p1-'));
  const dbPath=join(dir,'jugest.sqlite');
  const db=openDatabase(dbPath);migrate(db);
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','研究店','{}',NOW,NOW);
  const days=[
    day('2026-09-01',[machine('101',{diff:-500}),machine('102',{name:'ファンキージャグラー2',diff:300})]),
    day('2026-09-02',[machine('101',{diff:900}),machine('102',{name:'ファンキージャグラー2',diff:-100})]),
    day('2026-09-03',[machine('101',{diff:200}),machine('102',{name:'ファンキージャグラー2',diff:700})]),
    day('2026-09-04',[machine('101',{diff:99999}),machine('102',{name:'ファンキージャグラー2',diff:99999})])
  ];
  for(const d of days){
    db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at)
      VALUES(?,?,?,?,?,'valid',?,?,?)`).run('s1',d.date,'fixture','raw-'+d.date,'norm-'+d.date,'/tmp/'+d.date+'.gz',NOW,NOW);
    d.machines.forEach((row,index)=>db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)').run('s1',d.date,String(index).padStart(6,'0'),JSON.stringify(row)));
  }
  return {dir,dbPath,db,days,cleanup(){try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}};
}

test('feature rows are deterministic and never read beyond asOfDate',()=>{
  const f=seedDb();
  try{
    const rows=buildStoreFeatureRows({storeId:'s1',days:f.days,featureVersion:FEATURE_VERSION,asOfDate:'2026-09-03'});
    const all30=rows.find(row=>row.dimensionKey==='all'&&row.dimensionValue==='all'&&row.windowDays===30);
    assert.ok(all30);
    assert.equal(all30.dayCount,3);
    assert.equal(all30.rowCount,6);
    assert.equal(all30.metrics.totalDiff,1500);
    assert.match(all30.inputHash,/^[a-f0-9]{64}$/);
    const again=buildStoreFeatureRows({storeId:'s1',days:f.days.map(d=>d.date==='2026-09-04'?day(d.date,d.machines.map(m=>({...m,diff:-99999}))):d),featureVersion:FEATURE_VERSION,asOfDate:'2026-09-03'});
    assert.deepEqual(rows,again,'future-day mutations must not affect an earlier feature snapshot');
    assert.ok(rows.some(row=>row.dimensionKey==='weekday'));
    assert.ok(rows.some(row=>row.dimensionKey==='date_tail'));
    assert.ok(rows.some(row=>row.dimensionKey==='machine'));
    assert.ok(rows.some(row=>row.dimensionKey==='table_tail'));
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

test('feature refresh coalesces generations behind one low-priority job',()=>{
  const f=seedDb();
  try{
    const first=requestStoreFeatureRefresh(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,nowIso:NOW,dirty:true});
    const second=requestStoreFeatureRefresh(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,nowIso:'2026-09-13T00:00:01.000Z',dirty:true});
    assert.equal(first.job.type,'FEATURE_BUILD');
    assert.equal(first.job.priority,60);
    assert.equal(second.job.id,first.job.id);
    const state=getFeatureRefreshState(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION});
    assert.equal(state.generation,2);
    assert.equal(state.completedGeneration,0);
    assert.equal(state.activeJobId,first.job.id);
  }finally{f.cleanup()}
});

test('Coordinator never starts FEATURE_BUILD while daily analysis is active and runs only one research child',async()=>{
  const f=seedDb();
  try{
    requestStoreAnalysisRefresh(f.db,{storeId:'s1',analysisVersion:'vps-runtime-v1',nowIso:NOW,dirty:true});
    requestStoreFeatureRefresh(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,nowIso:NOW,dirty:true});
    const calls=[];
    const coordinator=new Coordinator({db:f.db,memoryReader:async()=>memory(),spawnChild:options=>{calls.push(options);return {kill(){}}},owner:'research-gate',policy:loadResourcePolicy({maxAnalysisChildren:3}),clock:()=>new Date('2026-09-13T00:00:02.000Z')});
    await coordinator.tick();
    assert.deepEqual(calls.map(x=>x.job.type),['DAILY_ANALYSIS']);
  }finally{f.cleanup()}
});

test('Coordinator routes one FEATURE_BUILD child when ordinary analysis is idle',async()=>{
  const f=seedDb();
  try{
    requestStoreFeatureRefresh(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,nowIso:NOW,dirty:true});
    f.db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s2','研究店2','{}',NOW,NOW);
    requestStoreFeatureRefresh(f.db,{storeId:'s2',featureVersion:FEATURE_VERSION,nowIso:NOW,dirty:true});
    const calls=[];
    const coordinator=new Coordinator({db:f.db,memoryReader:async()=>memory(),spawnChild:options=>{calls.push(options);return {kill(){}}},owner:'research-one',policy:loadResourcePolicy({maxAnalysisChildren:3}),clock:()=>new Date('2026-09-13T00:00:02.000Z')});
    await coordinator.tick();
    assert.equal(calls.length,1,'Phase 1 research concurrency must stay at one child');
    assert.equal(calls[0].job.type,'FEATURE_BUILD');
    assert.match(String(calls[0].workerPath),/feature-build\.mjs$/);
  }finally{f.cleanup()}
});

test('real FEATURE_BUILD child persists snapshots and reports one-store task telemetry',async()=>{
  const f=seedDb();
  try{
    const {job}=requestStoreFeatureRefresh(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,nowIso:NOW,dirty:true});
    const messages=[];
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('feature child timeout')),10000);
      spawnJobChild({job,leaseMiB:640,heapMiB:384,workerPath:new URL('../src/jobs/feature-build.mjs',import.meta.url),childEnv:{JUGEST_DB_PATH:f.dbPath},onMessage:message=>{messages.push(message);if(message.type==='complete'){clearTimeout(timeout);resolve()}},onExit:code=>{if(code!==0&&messages.every(x=>x.type!=='complete')){clearTimeout(timeout);reject(new Error(`feature child exited ${code}`))}}});
    });
    const start=messages.find(x=>x.type==='task_start');
    const done=messages.find(x=>x.type==='complete');
    assert.equal(start.taskMeta.taskKind,'feature_build');
    assert.equal(start.taskMeta.storeMachineCount,2);
    assert.equal(done.status,'built');
    assert.ok(done.rowCount>0);
    assert.ok(Number.isFinite(done.taskMetrics.peakRssMiB));
    assert.ok(f.db.prepare('SELECT COUNT(*) AS n FROM store_feature_snapshots WHERE store_id=?').get('s1').n>0);
    const state=getFeatureRefreshState(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION});
    assert.equal(state.completedGeneration,1);
    assert.equal(state.activeJobId,null);
  }finally{f.cleanup()}
});

test('Coordinator persists exactly one per-store metric row from task_start through completion',async()=>{
  const f=seedDb();
  try{
    requestStoreFeatureRefresh(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,nowIso:NOW,dirty:true});
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
