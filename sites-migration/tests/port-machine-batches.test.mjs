import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{fixture,args}from'./v9-fixture.mjs';
import{enqueueAnalysisJob,advanceAnalysisJob,readAnalysisJobResult}from'../lib/analysis/jobs.mjs';
import{runCompiledStoreModelStream,runCompiledStoreModelPrefixStream,runCompiledStoreModelResumeStream,runCompiledMachineBatchStream}from'../lib/analysis/compiled-worker.mjs';
import{encodeGraph,decodeGraph}from'../lib/analysis/graph-codec.mjs';import{hashCanonical}from'../upstream/vps/src/canonical-json.mjs';
const data=JSON.parse(readFileSync(new URL('../dev/fixture-data.json',import.meta.url))),input={shop:'SYNTHETIC',sourceStoreId:'synthetic',days:data.days,targetDate:args.targetDate};
test('machine-only feature partition retains full common history, row indices, all stages and final model exactly',async()=>{
 const normalStages={},splitStages={},original=await runCompiledStoreModelStream({...input,onStage:(k,v)=>{if(v)normalStages[k]=hashCanonical(JSON.parse(JSON.stringify(v)))}}),prefix=await runCompiledStoreModelPrefixStream(input),keys=await runCompiledMachineBatchStream(input),rows=[];
 for(let n=0;n<keys.length;n+=3){const part=await runCompiledMachineBatchStream({...input,keys:keys.slice(n,n+3)});rows.push(...decodeGraph(JSON.parse(JSON.stringify(encodeGraph(part)))).rows)}
 const actual=await runCompiledStoreModelResumeStream({...input,prefixState:prefix,machineRows:rows,onStage:(k,v)=>{if(v)splitStages[k]=hashCanonical(JSON.parse(JSON.stringify(v)))}});
 assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(original)));
 for(const key of ['brutePrepare','v4ModelTraining','v4SettingDistributionModel','v4CalendarLongMemory','bruteSingleGenerate','v4PredictStore'])if(normalStages[key]&&splitStages[key])assert.equal(splitStages[key],normalStages[key],key);
});
test('durable machine batches resume after a unit, reject idempotency mismatch and preserve previous completed result on corrupted part',async()=>{
 const f=await fixture();try{const j=await enqueueAnalysisJob({...f,...args,kind:'current-model',machineBatchSize:3,requestKey:'partition'});await assert.rejects(enqueueAnalysisJob({...f,...args,kind:'current-model',machineBatchSize:4,requestKey:'partition'}),{code:'idempotency_conflict'});
 await advanceAnalysisJob({...f,jobId:j.id});await advanceAnalysisJob({...f,jobId:j.id});
 let checkpoints=(await f.db.prepare("SELECT * FROM sites_analysis_stages WHERE job_id=? AND stage LIKE 'machine-rows:%'").bind(j.id).all()).results;assert.equal(checkpoints.length,1);const key=checkpoints[0].object_key;
 for(let i=0;i<20;i++){const r=await advanceAnalysisJob({...f,jobId:j.id});assert.equal(r.last_error_class,null,JSON.stringify(r));if(r.state==='succeeded')break}
 assert.ok(await readAnalysisJobResult({...f,jobId:j.id}));assert.equal((await f.db.prepare("SELECT object_key FROM sites_analysis_stages WHERE job_id=? AND stage='machine-rows:0'").bind(j.id).first()).object_key,key);
 const bad=await enqueueAnalysisJob({...f,...args,kind:'current-model',machineBatchSize:3,requestKey:'corrupt'});await advanceAnalysisJob({...f,jobId:bad.id});await advanceAnalysisJob({...f,jobId:bad.id});const saved=await f.db.prepare("SELECT * FROM sites_analysis_stages WHERE job_id=? AND stage='machine-rows:0'").bind(bad.id).first();await f.bucket.put(saved.object_key,'corrupted');
 let state;for(let i=0;i<12;i++){state=await advanceAnalysisJob({...f,jobId:bad.id});if(state.state==='retry_wait')break}assert.equal(state.last_error_class,'machine_batch_hash_mismatch');assert.equal((await f.db.prepare("SELECT completed_job_id FROM sites_analysis_heads WHERE store_id=? AND kind='current-model'").bind(args.storeId).first()).completed_job_id,j.id);
 }finally{await f.mf.dispose()}
});
test('compact machine row codec preserves every number/feature and rejects contract drift',async()=>{const{encodeMachineRows,decodeMachineRows}=await import('../lib/analysis/machine-row-codec.mjs');const row={date:'2026-01-01',machine:'my',tableNo:'001',games:0,diff:NaN,bb:-0,rb:Infinity,es:-Infinity,p4:.2,p5:.1,features:['same',null,NaN,-0],_bid:1};assert.deepEqual(decodeMachineRows(JSON.parse(JSON.stringify(encodeMachineRows([row])))),[row]);assert.throws(()=>encodeMachineRows([{...row,newUnknownField:1}]),/contract_changed/)});
