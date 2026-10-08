import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {persistLivePrediction,listLivePredictions,buildComparisonSummary} from '../src/research/live-comparison.mjs';
import {scoreAvailableComparisonDays} from '../src/analysis/comparison-refresh.mjs';
import {inspectDay,saveDayIntegrity} from '../src/ingest/day-integrity.mjs';
import {operationalTargetDate,isProspectivePrediction} from '../src/research/prediction-policy.mjs';
import {buildPredictionPerformance} from '../src/research/prediction-performance.mjs';
import {buildStoreReadPayload,persistStoreReadSnapshot} from '../src/research/store-read-output.mjs';
const NOW='2026-10-09T02:00:00.000Z';
const rows=[1,2,3].map((i)=>({tableNo:String(i),machine:'my',sourceMachineName:'マイジャグラーV',games:6000,bb:30,rb:20,diff:[1000,0,-1000][i-1]}));
function setup(){const db=openDatabase(':memory:');migrate(db);for(const id of ['a','b'])db.prepare('INSERT INTO stores VALUES(?,?,?,?,?)').run(id,id,'{}',NOW,NOW);return db}
function prediction(engine='current_shadow',extra={}){return{storeId:'a',targetDate:'2026-10-08',sourceFrontierDate:'2026-10-07',engine,engineVersion:'test-v1',inputHash:'input',createdAt:'2026-10-07T12:00:00.000Z',rankings:rows.map((r,i)=>({machineKey:r.tableNo,tableNo:r.tableNo,machineName:r.sourceMachineName,rank:i+1,score:3-i})),...extra}}
function day(db,{date='2026-10-08',machines=rows,hash='h1'}={}){
 db.prepare("INSERT INTO store_days VALUES(?,?,?, ?,?,'valid',?,?,?) ON CONFLICT(store_id,business_date) DO UPDATE SET normalized_payload_hash=excluded.normalized_payload_hash,updated_at=excluded.updated_at").run('a',date,'v1','raw',hash,'fixture',NOW,NOW);
 db.prepare('DELETE FROM machine_day_data WHERE store_id=? AND business_date=?').run('a',date);
 machines.forEach((r,i)=>db.prepare('INSERT INTO machine_day_data VALUES(?,?,?,?)').run('a',date,String(i),JSON.stringify(r)));
 const check=inspectDay(db,{storeId:'a',date,day:{machines,quality:{expectedMachineKeys:['1','2','3']}},nowIso:NOW});
 saveDayIntegrity(db,{storeId:'a',date,normalizedHash:hash,check,nowIso:NOW});
}
test('operational forecast always chooses a future JST day even with delayed history',()=>{
 assert.equal(operationalTargetDate({frontierDate:'2026-10-07',nowIso:'2026-10-08T15:30:00Z'}),'2026-10-10');
 assert.equal(isProspectivePrediction({targetDate:'2026-10-09',sourceFrontierDate:'2026-10-08',createdAt:'2026-10-08T15:00:00Z'}),false);
 assert.equal(isProspectivePrediction(prediction()),true);
});
test('explicit forecast target still reads only the declared history frontier',()=>{
 const model={version:'store-read-model-v1',axes:[]};
 const args={storeId:'a',modelFingerprint:'fp',model,featureVersion:'v1',frontierDate:'2026-10-07',targetDate:'2026-10-10',days:[{date:'2026-10-07',machines:rows}]};
 const a=buildStoreReadPayload(args),b=buildStoreReadPayload({...args,days:[...args.days,{date:'2026-10-09',machines:[{...rows[0],tableNo:'99',diff:99999}]}]});
 assert.equal(a.targetDate,'2026-10-10');assert.deepEqual(a.rankings,b.rankings);
});
test('duplicate snapshot is immutable and differing resend reports a conflict',()=>{
 const db=setup();try{const first=persistLivePrediction(db,prediction());const repeated=persistLivePrediction(db,prediction());
 const changed=persistLivePrediction(db,prediction('current_shadow',{inputHash:'changed',rankings:[{...prediction().rankings[0],score:999}]}));
 assert.equal(repeated.conflict,false);assert.equal(changed.conflict,true);assert.equal(changed.row.payloadHash,first.row.payloadHash);
 assert.throws(()=>persistLivePrediction(db,prediction('pre_research',{rankings:[prediction().rankings[0],prediction().rankings[0]]})),/duplicate/);
 }finally{db.close()}
});
test('a corrected history cannot rewrite the forecast displayed for an already frozen target',()=>{
 const db=setup();try{
  const args={storeId:'a',modelFingerprint:'fp',model:{version:'store-read-model-v1',axes:[]},featureVersion:'v1',frontierDate:'2026-10-07',days:[{date:'2026-10-07',machines:rows}],nowIso:'2026-10-08T02:00:00Z'};
  persistStoreReadSnapshot(db,args);const before=db.prepare('SELECT * FROM client_snapshots').get();
  assert.throws(()=>persistStoreReadSnapshot(db,{...args,days:[{date:'2026-10-07',machines:rows.map(r=>({...r,diff:r.diff+100}))}]}),/prediction_snapshot_conflict/);
  assert.deepEqual(db.prepare('SELECT * FROM client_snapshots').get(),before);
 }finally{db.close()}
});
test('observation/check timestamps do not turn the same history resend into a conflicting forecast',()=>{
 const db=setup();try{
  const args={storeId:'a',modelFingerprint:'fp',model:{version:'store-read-model-v1',axes:[]},featureVersion:'v1',frontierDate:'2026-10-07',days:[{date:'2026-10-07',machines:rows,updatedAt:'2026-10-07T00:00:00Z',integrity:{checkedAt:'2026-10-07T00:00:00Z'}}],nowIso:'2026-10-08T02:00:00Z'};
  persistStoreReadSnapshot(db,args);const before=listLivePredictions(db,{storeId:'a'})[0];
  persistStoreReadSnapshot(db,{...args,days:args.days.map(d=>({...d,updatedAt:'2026-10-08T01:00:00Z',integrity:{checkedAt:'2026-10-08T01:00:00Z'}}))});
  assert.equal(listLivePredictions(db,{storeId:'a'})[0].inputHash,before.inputHash);
 }finally{db.close()}
});
test('prediction and evaluation registration roll back together when registration fails',()=>{
 const db=setup();try{
  db.exec("CREATE TRIGGER fixture_eval_failure BEFORE INSERT ON prediction_refresh_state BEGIN SELECT RAISE(ABORT,'fixture_register_failed'); END");
  assert.throws(()=>persistLivePrediction(db,prediction()),/fixture_register_failed/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM store_prediction_snapshots').get().n,0);
 }finally{db.close()}
});
test('partial outcome is held without promoting a lower ranked available machine',()=>{
 const db=setup();try{persistLivePrediction(db,prediction());day(db,{machines:[{...rows[0],diff:null},...rows.slice(1)]});
 const result=scoreAvailableComparisonDays(db,{storeId:'a',throughDate:'2026-10-08',nowIso:NOW});
 assert.equal(result.scored,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM store_prediction_scores').get().n,0);
 const p=buildPredictionPerformance(db,{storeId:'a',nowIso:NOW});assert.equal(p.periods.all.evaluatedDays,0);assert.equal(p.periods.all.engines.current_shadow.top['1'].meanDiff,null);
 assert.equal(p.rows[0].state,'data_insufficient');
 }finally{db.close()}
});
test('delayed arrival automatically evaluates saved predictions once; zero remains an outcome',()=>{
 const db=setup();try{persistLivePrediction(db,prediction());persistLivePrediction(db,prediction('pre_research'));
 scoreAvailableComparisonDays(db,{storeId:'a',throughDate:'2026-10-08',nowIso:NOW});day(db);
 scoreAvailableComparisonDays(db,{storeId:'a',throughDate:'2026-10-08',nowIso:NOW});const first=db.prepare('SELECT score_hash FROM store_prediction_scores').all();
 scoreAvailableComparisonDays(db,{storeId:'a',throughDate:'2026-10-08',nowIso:NOW});assert.deepEqual(db.prepare('SELECT score_hash FROM store_prediction_scores').all(),first);
 const p=buildPredictionPerformance(db,{storeId:'a',nowIso:NOW});assert.equal(p.periods.all.evaluatedDays,1);assert.equal(p.periods.all.evaluatedMachines,3);assert.equal(p.periods.all.engines.current_shadow.top['3'].meanDiff,0);assert.equal(p.periods.all.engines.current_shadow.top['1'].randomDelta,1000);
 assert.equal(buildPredictionPerformance(db,{storeId:'b',nowIso:NOW}).periods.all.evaluatedDays,0);
 }finally{db.close()}
});
test('late historical predictions and mismatched candidate sets are never prospective results',()=>{
 const db=setup();try{persistLivePrediction(db,prediction('current_shadow',{createdAt:'2026-10-08T12:00:00Z'}));day(db);
 scoreAvailableComparisonDays(db,{storeId:'a',throughDate:'2026-10-08',nowIso:NOW});assert.equal(buildPredictionPerformance(db,{storeId:'a',nowIso:NOW}).periods.all.evaluatedDays,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM store_prediction_scores').get().n,0);
 }finally{db.close()}
});
test('machine replacement is held instead of matching only the table number',()=>{
 const db=setup();try{persistLivePrediction(db,prediction());day(db,{machines:[{...rows[0],sourceMachineName:'キングハナハナ',machine:'king'},...rows.slice(1)]});
 scoreAvailableComparisonDays(db,{storeId:'a',throughDate:'2026-10-08',nowIso:NOW});assert.equal(db.prepare('SELECT COUNT(*) n FROM store_prediction_scores').get().n,0);
 assert.equal(buildPredictionPerformance(db,{storeId:'a',nowIso:NOW}).rows[0].reason,'machine_identity_changed');
 }finally{db.close()}
});
test('corrected data retains original evaluation but excludes it from current performance and comparison',()=>{
 const db=setup();try{persistLivePrediction(db,prediction());persistLivePrediction(db,prediction('pre_research'));day(db);
 scoreAvailableComparisonDays(db,{storeId:'a',throughDate:'2026-10-08',nowIso:NOW});const first=db.prepare('SELECT * FROM store_prediction_scores').all();day(db,{hash:'corrected',machines:rows.map(r=>({...r,diff:r.diff+1}))});
 scoreAvailableComparisonDays(db,{storeId:'a',throughDate:'2026-10-08',nowIso:NOW});assert.deepEqual(db.prepare('SELECT * FROM store_prediction_scores').all(),first);
 assert.equal(buildPredictionPerformance(db,{storeId:'a',nowIso:NOW}).periods.all.evaluatedDays,0);assert.equal(buildComparisonSummary(db,{storeId:'a'}).live.days,0);
 assert.equal(listLivePredictions(db,{storeId:'a'}).length,2);
 }finally{db.close()}
});
test('a changed raw source invalidates cached results while preserving original scores',()=>{
 const db=setup();try{
  persistLivePrediction(db,prediction());persistLivePrediction(db,prediction('pre_research'));day(db);scoreAvailableComparisonDays(db,{storeId:'a',throughDate:'2026-10-08',nowIso:NOW});
  const original=db.prepare('SELECT * FROM store_prediction_scores').all();db.exec("UPDATE store_days SET source_hash='corrected-source'");
  assert.equal(buildPredictionPerformance(db,{storeId:'a',nowIso:NOW}).periods.all.evaluatedDays,0);
  assert.equal(buildComparisonSummary(db,{storeId:'a'}).live.days,0);
  scoreAvailableComparisonDays(db,{storeId:'a',throughDate:'2026-10-08',nowIso:NOW});assert.deepEqual(db.prepare('SELECT * FROM store_prediction_scores').all(),original);
  assert.equal(buildPredictionPerformance(db,{storeId:'a',nowIso:NOW}).rows[0].state,'corrected');
 }finally{db.close()}
});
test('business-day windows include observed days without predictions and disclose their actual dates',()=>{
 const db=setup();try{
  persistLivePrediction(db,prediction());day(db);scoreAvailableComparisonDays(db,{storeId:'a',throughDate:'2026-10-08',nowIso:NOW});
  for(const date of ['2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07'])day(db,{date});
  const result=buildPredictionPerformance(db,{storeId:'a',nowIso:NOW});assert.equal(result.periods['7'].businessDays,7);assert.equal(result.periods['7'].predictedDays,1);
  assert.equal(result.periods['7'].fromDate,'2026-10-02');assert.equal(result.periods['7'].throughDate,'2026-10-08');assert.equal(result.periods.all.businessDays,8);
 }finally{db.close()}
});
