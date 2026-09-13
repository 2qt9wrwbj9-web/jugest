import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {requestShadowPrediction,getShadowRefreshState,completeShadowPrediction} from '../src/analysis/shadow-refresh-state.mjs';
import {listLivePredictions} from '../src/research/live-comparison.mjs';

function setup(){
  const db=openDatabase(':memory:');migrate(db);
  const now='2026-09-13T00:00:00.000Z';
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','研究店','{}',now,now);
  return db;
}
function dayAt(base,offset){return new Date(base+offset*86400000).toISOString().slice(0,10)}
function insertCanonicalDay(db,storeId,date,offset){
  const now='2026-09-13T00:00:00.000Z';
  db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at)
    VALUES(?,?,?,?,?,'valid',?,?,?)`).run(storeId,date,'fixture',`raw-${date}`,`norm-${date}`,`/tmp/${date}.gz`,now,now);
  const machines=[];
  for(let table=101;table<=110;table+=1){
    const strong=table%10===7;
    machines.push({machine:'my',category:'juggler',sourceMachineName:'マイジャグラーV',tableNo:String(table),games:5000+offset*7+(table-100)*3,bb:18+(strong?5:0)+(offset%3),rb:16+(strong?6:0)+(offset%2),diff:(strong?1200:-120)+offset*8});
  }
  machines.forEach((row,index)=>db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)').run(storeId,date,String(index).padStart(6,'0'),JSON.stringify(row)));
}
function runWorker(job,dbPath){
  return new Promise((resolve,reject)=>{
    const descriptor=Buffer.from(JSON.stringify({id:job.id,type:job.type,payload:job.payload}),'utf8').toString('base64url');
    const child=fork(new URL('../src/jobs/shadow-predict.mjs',import.meta.url),[descriptor],{stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,JUGEST_DB_PATH:dbPath}});
    let complete=null,error=null;
    const timer=setTimeout(()=>{try{child.kill('SIGKILL')}catch{}reject(new Error('shadow worker timeout'))},15000);
    child.on('message',message=>{if(message?.type==='complete')complete=message;if(message?.type==='error')error=message});
    child.on('exit',code=>{clearTimeout(timer);if(code===0&&complete)return resolve(complete);reject(new Error(error?.message||`shadow worker exited ${code}`))});
  });
}

test('shadow refresh coalesces behind one active low-priority job and advances to newest frontier',()=>{
  const db=setup();
  try{
    const a=requestShadowPrediction(db,{storeId:'s1',frontierDate:'2026-09-12',nowIso:'2026-09-13T00:00:00.000Z'});
    assert.equal(a.job.type,'SHADOW_PREDICT');
    assert.equal(a.job.priority,70);
    assert.equal(a.job.sizeClass,'medium');
    assert.equal(a.job.estimatedLeaseMiB,512);
    const b=requestShadowPrediction(db,{storeId:'s1',frontierDate:'2026-09-13',nowIso:'2026-09-13T00:00:01.000Z'});
    assert.equal(b.job.id,a.job.id);
    assert.equal(getShadowRefreshState(db,{storeId:'s1'}).requestedFrontierDate,'2026-09-13');
    const completion=completeShadowPrediction(db,{storeId:'s1',jobId:a.job.id,completedFrontierDate:'2026-09-12',nowIso:'2026-09-13T00:00:02.000Z'});
    assert.ok(completion.job);
    assert.notEqual(completion.job.id,a.job.id);
    assert.equal(completion.job.payload.targetFrontierDate,'2026-09-13');
  }finally{db.close()}
});

test('real SHADOW_PREDICT worker persists the current JUGEST ranking for the next day',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'jugest-shadow-predict-')),dbPath=join(dir,'jugest.sqlite'),db=openDatabase(dbPath);
  try{
    migrate(db);
    const now='2026-09-13T00:00:00.000Z',storeId='shadow-store';
    db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run(storeId,'Shadow実店','{}',now,now);
    const base=Date.UTC(2026,6,1);
    for(let offset=0;offset<50;offset+=1)insertCanonicalDay(db,storeId,dayAt(base,offset),offset);
    const frontier=dayAt(base,49),target=dayAt(base,50);
    const requested=requestShadowPrediction(db,{storeId,frontierDate:frontier,nowIso:now});
    db.close();
    const complete=await runWorker(requested.job,dbPath);
    assert.equal(complete.status,'predicted');
    const verify=openDatabase(dbPath);migrate(verify);
    try{
      const rows=listLivePredictions(verify,{storeId,targetDate:target,engine:'current_shadow'});
      assert.equal(rows.length,1);
      assert.equal(rows[0].sourceFrontierDate,frontier);
      assert.ok(rows[0].rankings.length>0);
      assert.equal(getShadowRefreshState(verify,{storeId}).completedFrontierDate,frontier);
    }finally{verify.close()}
  }finally{try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}
});
