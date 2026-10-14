import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {requestPredictionEvaluation,bootstrapPredictionEvaluations} from '../src/analysis/prediction-refresh-state.mjs';
import {persistLivePrediction} from '../src/research/live-comparison.mjs';
import {Worker} from 'node:worker_threads';
import {executePredictionEvaluation} from '../src/analysis/prediction-evaluation.mjs';
import {activateStoreModel} from '../src/research/store-read-output.mjs';
import {baselineModel} from '../src/research/model-search.mjs';
import {loadStoreDays} from '../src/analysis/store-data.mjs';
import {claimNextJob,markJobRunning,completeJob,failJob,recoverStaleJobs,getJob} from '../src/queue.mjs';
import {__test as coordinator} from '../src/coordinator.mjs';
const NOW='2026-10-09T02:00:00Z';
test('startup initializes legacy predictions once without reopening exhausted jobs',()=>{
 const db=openDatabase(':memory:');try{
  migrate(db);db.prepare('INSERT INTO stores VALUES(?,?,?,?,?)').run('a','店','{}',NOW,NOW);
  persistLivePrediction(db,{storeId:'a',targetDate:'2026-10-10',sourceFrontierDate:'2026-10-08',engine:'current_shadow',engineVersion:'v1',inputHash:'h',createdAt:NOW,rankings:[{tableNo:'1',machineName:'my',rank:1,score:1}]});
  db.exec('DELETE FROM prediction_refresh_state;DELETE FROM jobs');
  assert.equal(bootstrapPredictionEvaluations(db,{nowIso:NOW}).initialized,1);
  assert.equal(bootstrapPredictionEvaluations(db,{nowIso:NOW}).initialized,0);
  db.exec("UPDATE jobs SET state='failed'");assert.equal(bootstrapPredictionEvaluations(db,{nowIso:NOW}).initialized,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM jobs').get().n,1);
 }finally{db.close()}
});
test('two database writers atomically coalesce evaluation requests into one job',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'jugest-eval-race-')),file=join(dir,'db.sqlite'),db=openDatabase(file);
 try{
  migrate(db);db.prepare('INSERT INTO stores VALUES(?,?,?,?,?)').run('a','店','{}',NOW,NOW);
  const code=`const {parentPort,workerData}=require('node:worker_threads');(async()=>{const {openDatabase}=await import(workerData.dbModule);const {requestPredictionEvaluation}=await import(workerData.refreshModule);const db=openDatabase(workerData.file);parentPort.postMessage('ready');parentPort.once('message',()=>{try{for(let i=0;i<40;i++)requestPredictionEvaluation(db,{storeId:'a',nowIso:workerData.now});db.close();parentPort.postMessage('done')}catch(error){parentPort.postMessage({error:error.message})}finally{parentPort.close()}})})()`;
  const workers=[0,1].map(()=>new Worker(code,{eval:true,workerData:{file,now:NOW,dbModule:new URL('../src/db.mjs',import.meta.url).href,refreshModule:new URL('../src/analysis/prediction-refresh-state.mjs',import.meta.url).href}}));
  const exits=workers.map(w=>new Promise((resolve,reject)=>{w.once('exit',code=>code===0?resolve():reject(new Error(`worker exit ${code}`)))}));
  await Promise.all(workers.map(w=>new Promise((resolve,reject)=>{w.once('error',reject);w.once('message',resolve)})));
  const done=workers.map(w=>new Promise((resolve,reject)=>{w.once('error',reject);w.once('message',msg=>msg==='done'?resolve():reject(new Error(JSON.stringify(msg))));w.postMessage('start')}));
  await Promise.all(done);await Promise.all(exits);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM jobs').get().n,1);assert.equal(db.prepare('SELECT generation FROM prediction_refresh_state').get().generation,80);
 }finally{db.close();rmSync(dir,{recursive:true,force:true})}
});
test('failed ownership publication leaves neither a stray job nor a dirty refresh state',()=>{
 const db=openDatabase(':memory:');try{
  migrate(db);db.prepare('INSERT INTO stores VALUES(?,?,?,?,?)').run('a','店','{}',NOW,NOW);
  db.exec("CREATE TRIGGER fixture_owner_failure BEFORE UPDATE ON prediction_refresh_state WHEN NEW.active_job_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'fixture_owner_failed'); END");
  assert.throws(()=>requestPredictionEvaluation(db,{storeId:'a',nowIso:NOW}),/fixture_owner_failed/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM jobs').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM prediction_refresh_state').get().n,0);
 }finally{db.close()}
});
test('evaluation uses the existing bounded queue, coalesces requests and recovers after restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'jugest-eval-')),file=join(dir,'db.sqlite');let db=openDatabase(file);
 try{
  migrate(db);db.prepare('INSERT INTO stores VALUES(?,?,?,?,?)').run('a','店','{}',NOW,NOW);
  for(let i=0;i<100;i++)requestPredictionEvaluation(db,{storeId:'a',nowIso:NOW});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM jobs').get().n,1);
  let job=claimNextJob(db,{owner:'before-restart',nowIso:NOW});markJobRunning(db,{jobId:job.id,owner:'before-restart',nowIso:NOW});
  db.close();db=openDatabase(file);migrate(db);
  assert.equal(recoverStaleJobs(db,{staleBeforeIso:'2026-10-09T03:00:00Z',nowIso:'2026-10-09T04:00:00Z'}),1);
  job=claimNextJob(db,{owner:'after',nowIso:'2026-10-09T04:00:00Z'});job=markJobRunning(db,{jobId:job.id,owner:'after',nowIso:NOW});
  assert.equal(job.type,'PREDICTION_EVALUATE');assert.match(coordinator.defaultWorkerPathForJob(job).pathname,/prediction-evaluate/);
  await executePredictionEvaluation({db,job,rootDir:'/unused',nowIso:NOW});
  assert.equal(db.prepare('SELECT generation=completed_generation done FROM prediction_refresh_state').get().done,1);
  assert.equal(requestPredictionEvaluation(db,{storeId:'a',dirty:false,nowIso:NOW}).job,null);
 }finally{db.close();rmSync(dir,{recursive:true,force:true})}
});
test('evaluation errors stay retryable and exhaust at the existing three-attempt bound',async()=>{
 const db=openDatabase(':memory:');try{
  migrate(db);db.prepare('INSERT INTO stores VALUES(?,?,?,?,?)').run('a','店','{}',NOW,NOW);
  requestPredictionEvaluation(db,{storeId:'a',nowIso:NOW});
  for(let i=0;i<3;i++){
   const job=claimNextJob(db,{owner:'w',nowIso:NOW});markJobRunning(db,{jobId:job.id,owner:'w',nowIso:NOW});
   failJob(db,{jobId:job.id,owner:'w',nowIso:NOW,retryAtIso:NOW,errorClass:'evaluation_failed',message:'fixture'});
  }
  assert.equal(getJob(db,1).state,'failed');assert.equal(claimNextJob(db,{owner:'w',nowIso:NOW}),null);
  assert.equal(db.prepare('SELECT completed_generation FROM prediction_refresh_state').get().completed_generation,0);
 }finally{db.close()}
});
test('a frozen forecast conflict does not prevent evaluation completion or formal progression',async()=>{
 const db=openDatabase(':memory:');try{
  migrate(db);db.prepare('INSERT INTO stores VALUES(?,?,?,?,?)').run('a','店','{}',NOW,NOW);
  const row={tableNo:'1',sourceMachineName:'マイジャグラーV',machine:'my',games:6000,bb:25,rb:20,diff:100};
  db.prepare("INSERT INTO store_days VALUES('a','2026-10-08','v1','raw','first','valid','fixture',?,?)").run(NOW,NOW);
  db.prepare("INSERT INTO machine_day_data VALUES('a','2026-10-08','0',?)").run(JSON.stringify(row));
  const model=baselineModel();activateStoreModel(db,{storeId:'a',fingerprint:model.fingerprint,model,featureVersion:'v1',frontierDate:'2026-10-08',days:loadStoreDays(db,'a').days,nowIso:NOW});
  const frozen=db.prepare('SELECT * FROM store_prediction_snapshots').all();let formalRuns=0;const formalRunner=async()=>{formalRuns++;return{reason:'fixture'}};
  let job=claimNextJob(db,{owner:'w',nowIso:NOW});markJobRunning(db,{jobId:job.id,owner:'w',nowIso:NOW});
  await executePredictionEvaluation({db,job,nowIso:NOW,formalRunner});completeJob(db,{jobId:job.id,owner:'w',nowIso:NOW});
  db.exec("UPDATE store_days SET normalized_payload_hash='corrected'");db.prepare('UPDATE machine_day_data SET payload_json=?').run(JSON.stringify({...row,diff:999}));requestPredictionEvaluation(db,{storeId:'a',nowIso:NOW});
  job=claimNextJob(db,{owner:'w',nowIso:NOW});markJobRunning(db,{jobId:job.id,owner:'w',nowIso:NOW});const out=await executePredictionEvaluation({db,job,nowIso:NOW,formalRunner});
  assert.equal(out.forecast.state,'conflict');assert.equal(formalRuns,2);assert.deepEqual(db.prepare('SELECT * FROM store_prediction_snapshots').all(),frozen);
  assert.equal(db.prepare('SELECT generation=completed_generation done FROM prediction_refresh_state').get().done,1);
  assert.equal(db.prepare("SELECT state FROM prediction_evaluation_state WHERE series='forecast:pre_research'").get().state,'conflict');
 }finally{db.close()}
});
