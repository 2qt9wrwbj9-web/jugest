import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {spawnJobChild} from '../src/child-runner.mjs';
import {ensureResearchCycle,getResearchChampion,getResearchLoop} from '../src/analysis/research-cycle.mjs';
import {requestFeatureRefresh} from '../src/analysis/feature-refresh-state.mjs';
import {Coordinator} from '../src/coordinator.mjs';
import {loadResourcePolicy} from '../src/config.mjs';

const NOW='2026-09-13T00:00:00.000Z';
const FEATURE_VERSION='store-features-v1';
function machine(tableNo,{diff=0}={}){const strong=String(tableNo).endsWith('7');return {tableNo,sourceMachineName:'マイジャグラーV',games:5000,bb:18+(strong?5:0),rb:16+(strong?6:0),diff}}
function seed(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-research-workers-')),dbPath=join(dir,'jugest.sqlite'),db=openDatabase(dbPath);migrate(db);
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','研究統合店','{}',NOW,NOW);
  for(let d=1;d<=24;d+=1){
    const date=`2026-08-${String(d).padStart(2,'0')}`;
    db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at) VALUES(?,?,?,?,?,'valid',?,?,?)`).run('s1',date,'fixture','raw'+d,'norm'+d,'/tmp/'+date+'.gz',NOW,NOW);
    for(let n=101;n<=110;n+=1){const strong=String(n).endsWith('7'),row=machine(String(n),{diff:(strong?1400:-150)+((d%3)-1)*30});db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)').run('s1',date,String(n),JSON.stringify(row))}
  }
  return {dir,dbPath,db,cleanup(){try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}};
}
function spawnAndWait({job,workerPath,dbPath}){return new Promise((resolve,reject)=>{const messages=[],timer=setTimeout(()=>reject(new Error(`${job.type} timeout`)),15000);spawnJobChild({job,leaseMiB:896,heapMiB:512,workerPath,childEnv:{JUGEST_DB_PATH:dbPath},onMessage:message=>{messages.push(message);if(message.type==='complete'){clearTimeout(timer);resolve(messages)}},onExit:code=>{if(code!==0&&messages.every(x=>x.type!=='complete')){clearTimeout(timer);reject(Object.assign(new Error(`${job.type} exited ${code}`),{messages}))}}})})}

test('FEATURE_BUILD completion starts the self-improvement loop with a BACKTEST job',async()=>{
  const f=seed();try{
    const requested=requestFeatureRefresh(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,frontierDate:'2026-08-24',nowIso:NOW,dirty:true});
    const messages=await spawnAndWait({job:requested.job,workerPath:new URL('../src/jobs/feature-build.mjs',import.meta.url),dbPath:f.dbPath});
    const done=messages.find(x=>x.type==='complete');
    assert.ok(done.researchJobId,'feature completion must schedule research');
    const research=f.db.prepare('SELECT * FROM jobs WHERE id=?').get(done.researchJobId);
    assert.equal(research.type,'BACKTEST');assert.equal(research.priority,50);
    assert.ok(getResearchChampion(f.db,{storeId:'s1'}));
  }finally{f.cleanup()}
});

test('BACKTEST worker persists train/validation only, never sealed holdout, and queues MODEL_SEARCH',async()=>{
  const f=seed();try{
    const {job}=ensureResearchCycle(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,frontierDate:'2026-08-24',nowIso:NOW});
    const messages=await spawnAndWait({job,workerPath:new URL('../src/jobs/backtest.mjs',import.meta.url),dbPath:f.dbPath});
    const start=messages.find(x=>x.type==='task_start'),done=messages.find(x=>x.type==='complete');
    assert.equal(start.taskMeta.phase,2);assert.equal(start.taskMeta.taskKind,'backtest');assert.equal(start.taskMeta.storeMachineCount,10);
    assert.equal(done.status,'backtested');assert.ok(Number.isFinite(done.taskMetrics.peakRssMiB));assert.ok(done.nextJobId);
    const splits=f.db.prepare('SELECT split_kind FROM backtest_runs ORDER BY id').all().map(x=>x.split_kind);
    assert.deepEqual(splits,['train','validation'],'holdout must remain sealed before convergence');
    assert.equal(f.db.prepare('SELECT type FROM jobs WHERE id=?').get(done.nextJobId).type,'MODEL_SEARCH');
  }finally{f.cleanup()}
});

test('MODEL_SEARCH worker discovers axes, promotes a stronger research champion, and queues the next BACKTEST',async()=>{
  const f=seed();try{
    const started=ensureResearchCycle(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,frontierDate:'2026-08-24',nowIso:NOW});
    const backtestMessages=await spawnAndWait({job:started.job,workerPath:new URL('../src/jobs/backtest.mjs',import.meta.url),dbPath:f.dbPath});
    const searchId=backtestMessages.find(x=>x.type==='complete').nextJobId,searchJobRow=f.db.prepare('SELECT * FROM jobs WHERE id=?').get(searchId);
    const searchJob={id:searchJobRow.id,type:searchJobRow.type,payload:JSON.parse(searchJobRow.payload_json),sizeClass:searchJobRow.size_class,estimatedLeaseMiB:searchJobRow.estimated_lease_mib};
    const before=getResearchChampion(f.db,{storeId:'s1'}).fingerprint;
    const messages=await spawnAndWait({job:searchJob,workerPath:new URL('../src/jobs/model-search.mjs',import.meta.url),dbPath:f.dbPath});
    const start=messages.find(x=>x.type==='task_start'),done=messages.find(x=>x.type==='complete');
    assert.equal(start.taskMeta.phase,3);assert.equal(start.taskMeta.taskKind,'model_search');
    assert.equal(done.status,'searched');assert.ok(done.axesDiscovered>0);assert.ok(done.candidatesEvaluated>0);assert.equal(done.promoted,true);
    const after=getResearchChampion(f.db,{storeId:'s1'}).fingerprint;assert.notEqual(after,before);
    assert.equal(getResearchLoop(f.db,{storeId:'s1'}).generation,1);
    assert.equal(f.db.prepare('SELECT type FROM jobs WHERE id=?').get(done.nextJobId).type,'BACKTEST');
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM backtest_runs WHERE split_kind='holdout'").get().n,0,'holdout is still sealed after an ordinary promotion');
  }finally{f.cleanup()}
});

test('Coordinator routes BACKTEST and MODEL_SEARCH to real measured workers and keeps one research child',async()=>{
  const f=seed();try{
    const {job}=ensureResearchCycle(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,frontierDate:'2026-08-24',nowIso:NOW});
    const calls=[];const coordinator=new Coordinator({db:f.db,memoryReader:async()=>({hostTotalMiB:2048,hostAvailableMiB:1500,cgroupLimitMiB:2048,cgroupCurrentMiB:548,effectiveLimitMiB:2048,effectiveAvailableMiB:1500,usedRatio:.268,swapUsedMiB:0}),spawnChild:options=>{calls.push(options);return {kill(){}}},owner:'research-route',policy:loadResourcePolicy({maxAnalysisChildren:3}),clock:()=>new Date('2026-09-13T00:00:02.000Z')});
    await coordinator.tick();assert.equal(calls.length,1);assert.equal(calls[0].job.id,job.id);assert.match(String(calls[0].workerPath),/backtest\.mjs$/);
  }finally{f.cleanup()}
});
