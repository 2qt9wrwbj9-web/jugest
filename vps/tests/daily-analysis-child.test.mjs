import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {requestStoreAnalysisRefresh} from '../src/analysis/refresh-state.mjs';
import {spawnJobChild} from '../src/child-runner.mjs';
import {Coordinator} from '../src/coordinator.mjs';
import {loadResourcePolicy} from '../src/config.mjs';

const REPO_ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const VERSION='vps-runtime-v1';

function seed(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-daily-child-'));
  const dbPath=join(dir,'jugest.sqlite');
  const db=openDatabase(dbPath);migrate(db);
  const now='2026-09-11T09:00:00.000Z';
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('store-child','子プロセス店','{}',now,now);
  for(let i=0;i<4;i+=1){
    const date=`2026-09-0${i+1}`;
    db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at)
      VALUES(?,?,?,?,?,'valid',?,?,?)`).run('store-child',date,'fixture','raw'+i,'norm'+i,'/tmp/'+date+'.gz',now,now);
    for(let m=0;m<2;m+=1){
      const row=m===0
        ? {machine:'my',category:'juggler',sourceMachineName:'マイジャグラーV',tableNo:'101',games:5000+i*100,bb:20+i,rb:18+i,diff:100+i*50}
        : {machine:'fk',category:'juggler',sourceMachineName:'ファンキージャグラー2',tableNo:'102',games:5200+i*100,bb:21+i,rb:16+i,diff:80+i*40};
      db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)').run('store-child',date,String(m).padStart(6,'0'),JSON.stringify(row));
    }
  }
  const {job}=requestStoreAnalysisRefresh(db,{storeId:'store-child',analysisVersion:VERSION,nowIso:now,dirty:true});
  return {dir,dbPath,db,job,cleanup(){try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}};
}

test('real DAILY_ANALYSIS child emits task workload telemetry once and persists snapshots',async()=>{
  const f=seed();
  try{
    const messages=[];
    await new Promise((resolvePromise,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('daily analysis child timeout')),10000);
      spawnJobChild({
        job:f.job,leaseMiB:512,heapMiB:384,
        workerPath:new URL('../src/jobs/daily-analysis.mjs',import.meta.url),
        childEnv:{JUGEST_DB_PATH:f.dbPath,JUGEST_WEB_ROOT:REPO_ROOT},
        onMessage:message=>{messages.push(message);if(message.type==='complete'){clearTimeout(timeout);resolvePromise()}},
        onExit:code=>{if(code!==0&&messages.every(x=>x.type!=='complete')){clearTimeout(timeout);reject(new Error(`daily child exited ${code}`))}}
      });
    });
    const starts=messages.filter(x=>x.type==='task_start');
    const start=starts[0];
    const done=messages.find(x=>x.type==='complete');
    assert.equal(starts.length,1,'daily child must emit task_start exactly once');
    assert.ok(start,'daily child must announce task metadata before completion');
    assert.equal(start.taskMeta.taskKind,'daily_analysis');
    assert.equal(start.taskMeta.phase,1);
    assert.equal(start.taskMeta.storeId,'store-child');
    assert.equal(start.taskMeta.storeMachineCount,2);
    assert.equal(start.taskMeta.dayCount,4);
    assert.equal(start.taskMeta.rowCount,8);
    assert.ok(done);
    assert.equal(done.status,'analyzed');
    assert.match(done.resultHash,/^[a-f0-9]{64}$/);
    assert.equal(done.taskMetrics.taskKind,'daily_analysis');
    assert.equal(done.taskMetrics.storeMachineCount,2);
    assert.equal(done.taskMetrics.dayCount,4);
    assert.equal(done.taskMetrics.rowCount,8);
    assert.ok(Number.isFinite(done.taskMetrics.peakRssMiB));
    assert.ok(Number.isFinite(done.taskMetrics.cpuMs));
    assert.ok(done.taskMetrics.durationMs>=0);
    const snap=f.db.prepare("SELECT payload_json FROM client_snapshots WHERE store_id='store-child' AND snapshot_type='store-analysis-default'").get();
    assert.ok(snap);
    const payload=JSON.parse(snap.payload_json);
    assert.equal(payload.shop,'子プロセス店');
    assert.equal(payload.rowCount,8);
  }finally{f.cleanup()}
});

test('Coordinator routes DAILY_ANALYSIS to the real worker path by default',async()=>{
  const f=seed();
  try{
    const calls=[];
    const coordinator=new Coordinator({
      db:f.db,
      memoryReader:async()=>({hostTotalMiB:2048,hostAvailableMiB:1400,cgroupLimitMiB:2048,cgroupCurrentMiB:648,effectiveLimitMiB:2048,effectiveAvailableMiB:1400,usedRatio:.316,swapUsedMiB:0}),
      spawnChild:options=>{calls.push(options);return {kill(){}}},
      owner:'route-test',
      policy:loadResourcePolicy({maxAnalysisChildren:1}),
      clock:()=>new Date('2026-09-11T09:00:10.000Z')
    });
    await coordinator.tick();
    assert.equal(calls.length,1);
    assert.equal(calls[0].job.type,'DAILY_ANALYSIS');
    assert.match(String(calls[0].workerPath),/daily-analysis\.mjs$/);
  }finally{f.cleanup()}
});
