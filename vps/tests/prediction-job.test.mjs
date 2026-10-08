import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {requestPredictionEvaluation} from '../src/analysis/prediction-refresh-state.mjs';
import {executePredictionEvaluation} from '../src/analysis/prediction-evaluation.mjs';
import {claimNextJob,markJobRunning,failJob,recoverStaleJobs,getJob} from '../src/queue.mjs';
import {__test as coordinator} from '../src/coordinator.mjs';
const NOW='2026-10-09T02:00:00Z';
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
