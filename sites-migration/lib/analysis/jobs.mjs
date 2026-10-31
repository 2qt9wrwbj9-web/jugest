import{dailyFenceStatements,isDailyFenceError}from'./daily-fence.mjs';
import{runFrozenFormalPre,formalPreWrites}from'./formal-pre-job.mjs';
import{prepareFeatureStoreRead,featureStoreReadWrites}from'./active-store-read.mjs';
import{advanceHoldoutModels,runFrozenHoldout,holdoutPublicationWrites}from'./research-holdout.mjs';
import{researchCycleWrites,featureCycleWrites}from'./research-cycle.mjs';
import{freezeResearchContext,successorStatements,searchContextCompletion}from'./research-transition.mjs';
import{advanceMachineBatches,readMachineRows}from'./machine-batches.mjs';
import{requireResearchBacktest,runFrozenModelSearch,modelSearchWrites}from'./research-model-search.mjs';
import{freezeResearchModel,runFrozenResearchBacktest,researchBacktestWrites,researchRequestStatements}from'./research-backtest.mjs';
import{prepareModelPrefix,readModelPrefix}from'./model-prefix.mjs';
import {WORKER_IMPLEMENTATION_HASH} from './compiled-worker.mjs';
import {runFrozenFeatureBuild} from './feature-build.mjs';
import {originalDailyInputHash} from './original-input-hash.mjs';
import {originalRetryAt} from './generated-job-policy.mjs';
import {canonicalDigest,putCanonical,payloadRange,digestObject,digestStoredCanonical,openCanonicalObject,composeCanonicalEnvelope} from './canonical-stream.mjs';
import {freezeStoreHistory,openFrozenStoreHistory} from './input-snapshot.mjs';
import {runFrozenWorkerModel,runFrozenWorkerAnalysis} from './run-frozen-worker.mjs';
import {sha256Text} from '../storage/recovery.mjs';
import {canonicalJson} from '../../upstream/vps/src/canonical-json.mjs';
export const ENGINE_VERSION='sites-original-1f8c29f-v7';
const OPTIONS={period:'180',minG:'2000',maxDims:'1',minDays:'4'};
const iso=n=>new Date(n).toISOString();
const fail=code=>Object.assign(Error(code),{code});
export async function getAnalysisJob(db,id){return db.prepare('SELECT j.*,c.child_job_id AS next_job_id,d.action AS research_action,d.reason AS convergence_reason,c.state AS research_state,m.enabled AS research_cycle FROM sites_analysis_jobs j LEFT JOIN sites_research_context c ON c.job_id=j.id LEFT JOIN sites_research_decisions d ON d.job_id=j.id AND d.applied_at IS NOT NULL LEFT JOIN sites_research_cycle_jobs m ON m.job_id=j.id WHERE j.id=?').bind(id).first()}
export function publicAnalysisJob(j){if(!j)return null;return{id:j.id,storeId:j.store_id,kind:j.kind,nextJobId:j.next_job_id??null,researchCycle:!!j.research_cycle,researchState:j.research_state??null,researchAction:j.research_action??null,convergenceReason:j.convergence_reason??null,targetDate:j.target_date,historyLimit:j.history_limit,state:j.state,phase:j.result_key?'verify':j.manifest_key?'analysis':'capture',attempts:j.attempts,failureCount:j.failure_count,maxAttempts:j.max_attempts,inputHash:j.input_hash,outputHash:j.output_hash,error:j.last_error_class,availableAt:j.available_at,createdAt:j.created_at,updatedAt:j.updated_at}}
export async function enqueueAnalysisJob({db,storeId,channelId,kind='store-analysis',targetDate,historyLimit=180,requestKey,machineBatchSize=null,researchCycle=false,dailyReception=false,dailyParentId=null,now=Date.now}){
 if(typeof dailyReception!=='boolean'||(dailyReception&&kind!=='store-analysis')||(dailyParentId!==null&&(!Number.isSafeInteger(dailyParentId)||dailyParentId<1||!['feature-build','formal-pre'].includes(kind)))||(dailyReception&&dailyParentId!==null))throw fail('bad_daily_acceptance');
 if(!['store-analysis','current-model','feature-build','research-backtest','research-model-search','formal-pre'].includes(kind))throw fail('bad_analysis_kind');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)||!Number.isFinite(Date.parse(targetDate+'T00:00:00Z'))||new Date(targetDate+'T00:00:00Z').toISOString().slice(0,10)!==targetDate)throw fail('bad_target_date');
 if(['feature-build','research-backtest','research-model-search','formal-pre'].includes(kind)&&historyLimit!==180)throw fail('bad_feature_history_limit');
 if(!Number.isInteger(historyLimit)||historyLimit<1||historyLimit>400)throw fail('bad_history_limit');
 if(typeof requestKey!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(requestKey))throw fail('bad_request_key');
 if(machineBatchSize!==null&&(kind!=='current-model'||!Number.isInteger(machineBatchSize)||machineBatchSize<1||machineBatchSize>160))throw fail('bad_machine_batch_size');
 if(typeof researchCycle!=='boolean'||(researchCycle&&!['feature-build','research-backtest'].includes(kind)))throw fail('bad_research_cycle');
 const key=await sha256Text(JSON.stringify([storeId,channelId,kind,requestKey])),at=iso(now());
 const prior=await getAnalysisJobByKey();if(prior&&!!prior.research_cycle!==researchCycle)throw fail('idempotency_conflict');
 async function getAnalysisJobByKey(){return db.prepare('SELECT j.*,m.enabled AS research_cycle FROM sites_analysis_jobs j LEFT JOIN sites_research_cycle_jobs m ON m.job_id=j.id WHERE j.idempotency_key=?').bind(key).first()}
 const fence=dailyReception||dailyParentId!==null?dailyFenceStatements({db,storeId,channelId,targetDate,parentId:dailyParentId}):null;
 try{await db.batch([
  ...(fence?[fence.begin]:[]),
  db.prepare('INSERT OR IGNORE INTO sites_analysis_jobs(store_id,channel_id,kind,target_date,history_limit,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(storeId,channelId,kind,targetDate,historyLimit,key,at,at),
  db.prepare('INSERT INTO sites_research_cycle_jobs(job_id,root_job_id,enabled) SELECT id,id,? FROM sites_analysis_jobs WHERE idempotency_key=? AND changes()=1 ON CONFLICT(job_id) DO NOTHING').bind(researchCycle?1:0,key),
  db.prepare('INSERT INTO sites_analysis_heads(store_id,kind,latest_job_id) SELECT store_id,kind,id FROM sites_analysis_jobs WHERE idempotency_key=? ON CONFLICT(store_id,kind) DO UPDATE SET latest_job_id=excluded.latest_job_id WHERE excluded.latest_job_id>sites_analysis_heads.latest_job_id').bind(key),
  db.prepare("INSERT OR IGNORE INTO sites_analysis_dispatch(job_id) SELECT id FROM sites_analysis_jobs WHERE idempotency_key=? AND state NOT IN ('succeeded','failed','cancelled')").bind(key),
  ...(machineBatchSize===null?[]:[db.prepare('INSERT INTO sites_analysis_partitions(job_id,batch_size) SELECT id,? FROM sites_analysis_jobs WHERE idempotency_key=? ON CONFLICT(job_id) DO NOTHING').bind(machineBatchSize,key)]),
  ...(['research-backtest','research-model-search'].includes(kind)?researchRequestStatements({db,storeId,targetDate,key,at}):[]),
  ...(dailyReception?[db.prepare("INSERT INTO sites_daily_runs(store_id,business_date,channel_id,parent_id,state) SELECT store_id,target_date,channel_id,id,'analysis_pending' FROM sites_analysis_jobs WHERE idempotency_key=? ON CONFLICT(store_id,business_date,channel_id) DO NOTHING").bind(key)]:[]),
  ...(kind==='feature-build'?[
   db.prepare('INSERT INTO sites_feature_requests(job_id) SELECT id FROM sites_analysis_jobs WHERE idempotency_key=? ON CONFLICT(job_id) DO NOTHING').bind(key),
   db.prepare("INSERT INTO feature_refresh_state(store_id,feature_version,generation,completed_generation,active_job_id,frontier_date,requested_frontier_date,completed_frontier_date,updated_at) SELECT store_id,'store-features-v1',1,0,id,NULL,target_date,NULL,? FROM sites_analysis_jobs WHERE idempotency_key=? AND changes()=1 ON CONFLICT(store_id,feature_version) DO UPDATE SET generation=feature_refresh_state.generation+1,requested_frontier_date=MAX(feature_refresh_state.requested_frontier_date,excluded.requested_frontier_date),active_job_id=COALESCE(feature_refresh_state.active_job_id,excluded.active_job_id),updated_at=excluded.updated_at").bind(at,key)
  ]:[]),
  ...(fence?[fence.end]:[])
 ]);}catch(error){if(isDailyFenceError(error))throw fail('daily_frontier_changed');throw error}
 const job=await db.prepare('SELECT * FROM sites_analysis_jobs WHERE idempotency_key=?').bind(key).first();
 const partition=await db.prepare('SELECT batch_size FROM sites_analysis_partitions WHERE job_id=?').bind(job.id).first();
 if((partition?.batch_size??null)!==machineBatchSize)throw fail('idempotency_conflict');
 if(!!(await getAnalysisJobByKey()).research_cycle!==researchCycle)throw fail('idempotency_conflict');
 if(job.target_date!==targetDate||job.history_limit!==historyLimit)throw fail('idempotency_conflict');return job;
}
async function recover(db,now){
 const at=iso(now);
 await db.batch([
  db.prepare("UPDATE sites_analysis_job_runs SET state='retry_wait',ended_at=?,error_class='stale_recovery' WHERE ended_at IS NULL AND EXISTS(SELECT 1 FROM sites_analysis_jobs j WHERE j.id=job_id AND j.attempts=attempt AND j.state IN ('leased','running') AND j.lease_until<=?)").bind(at,now),
  db.prepare("UPDATE sites_analysis_jobs SET state=CASE WHEN failure_count+1>=max_attempts THEN 'failed' ELSE 'retry_wait' END,failure_count=failure_count+1,lease_owner=NULL,lease_until=NULL,available_at=?,last_error_class='stale_recovery',updated_at=? WHERE state IN ('leased','running') AND lease_until<=?").bind(now,at,now)
 ]);
}
async function claim(db,id,now,leaseMs){
 await recover(db,now);const owner=crypto.randomUUID(),until=now+leaseMs,at=iso(now);
 await db.batch([
  // One durable slot prevents parallel large analyses across requests/isolate instances.
  db.prepare("INSERT INTO sites_analysis_execution_lock(name,job_id,owner,lease_until) SELECT 'analysis',id,?,? FROM sites_analysis_jobs WHERE id=? AND state IN ('queued','retry_wait') AND available_at<=? ON CONFLICT(name) DO UPDATE SET job_id=excluded.job_id,owner=excluded.owner,lease_until=excluded.lease_until WHERE sites_analysis_execution_lock.lease_until<=?").bind(owner,until,id,now,now),
  db.prepare("UPDATE sites_analysis_jobs SET state='leased',lease_owner=?,lease_until=?,attempts=attempts+1,updated_at=? WHERE id=? AND state IN ('queued','retry_wait') AND available_at<=? AND EXISTS(SELECT 1 FROM sites_analysis_execution_lock WHERE name='analysis' AND job_id=? AND owner=?)").bind(owner,until,at,id,now,id,owner),
  db.prepare("INSERT INTO sites_analysis_job_runs(job_id,attempt,owner,state,started_at) SELECT id,attempts,?,'running',? FROM sites_analysis_jobs WHERE id=? AND state='leased' AND lease_owner=?").bind(owner,at,id,owner),
  db.prepare("UPDATE sites_analysis_jobs SET state='running' WHERE id=? AND state='leased' AND lease_owner=?").bind(id,owner)
 ]);
 const job=await getAnalysisJob(db,id);return job?.lease_owner===owner?job:null;
}
async function release(db,job){await db.prepare("DELETE FROM sites_analysis_execution_lock WHERE name='analysis' AND job_id=? AND owner=?").bind(job.id,job.lease_owner).run()}
function owned(job,now){return [job.id,job.lease_owner,job.attempts,now]}
const GUARD="id=? AND lease_owner=? AND attempts=? AND state='running' AND lease_until>?";
export async function advanceAnalysisJob({db,bucket,jobId,now=Date.now,leaseMs=120000,runner=null,onStage=()=>{}}){
 onStage('job:claim-begin');const job=await claim(db,jobId,now(),leaseMs);onStage('job:claimed');if(!job)return getAnalysisJob(db,jobId);
 const started=now(),timings={};const stage=(name,value)=>{const v=timings[name]??{count:0};v.count++;v.elapsedMs=now()-started;timings[name]=v;onStage(name,value)};
 try{
  if(!job.manifest_key){
   const snapshot=await freezeStoreHistory({db,bucket,storeId:job.store_id,limit:job.history_limit,throughDate:['feature-build','research-backtest','research-model-search'].includes(job.kind)?'9999-12-31':job.kind==='current-model'?new Date(Date.parse(job.target_date+'T00:00:00Z')-86400000).toISOString().slice(0,10):job.target_date,captureId:'job-'+job.id,onStage:stage});
   if(!snapshot.days)throw fail('no_canonical_days');
   if(['research-backtest','research-model-search'].includes(job.kind))await freezeResearchModel({db,bucket,job,snapshot,now});
   if(job.kind==='research-backtest')await freezeResearchContext({db,job,snapshot,now});
   if(job.kind==='research-model-search')await requireResearchBacktest({db,job,snapshot});
   if(job.kind==='current-model'&&!runner)await prepareModelPrefix({db,bucket,job,snapshot,now,onStage:stage});
   await db.batch([
    db.prepare(`UPDATE sites_analysis_jobs SET manifest_key=?,input_hash=?,state='queued',lease_owner=NULL,lease_until=NULL,last_error_class=NULL,updated_at=? WHERE ${GUARD}`).bind(snapshot.manifestKey,snapshot.inputHash,iso(now()),...owned(job,now())),
    db.prepare("UPDATE sites_analysis_job_runs SET state='input_fixed',input_hash=?,timings_json=?,ended_at=? WHERE job_id=? AND attempt=? AND owner=?").bind(snapshot.inputHash,JSON.stringify(timings),iso(now()),job.id,job.attempts,job.lease_owner)
   ]);
   return getAnalysisJob(db,job.id);
  }
  if(!job.result_key){
  if(job.kind==='research-holdout'&&!runner&&!await advanceHoldoutModels({db,bucket,job,now,onStage:stage})){
   await db.batch([
    db.prepare(`UPDATE sites_analysis_jobs SET state='queued',lease_owner=NULL,lease_until=NULL,last_error_class=NULL,updated_at=? WHERE ${GUARD}`).bind(iso(now()),...owned(job,now())),
    db.prepare("UPDATE sites_analysis_job_runs SET state='holdout_model_staged',input_hash=?,timings_json=?,ended_at=? WHERE job_id=? AND attempt=? AND owner=?").bind(job.input_hash,JSON.stringify(timings),iso(now()),job.id,job.attempts,job.lease_owner)
   ]);return getAnalysisJob(db,job.id);
  }
  if(job.kind==='current-model'&&!runner&&!await advanceMachineBatches({db,bucket,job,now,onStage:stage})){
   await db.batch([
    db.prepare(`UPDATE sites_analysis_jobs SET state='queued',lease_owner=NULL,lease_until=NULL,last_error_class=NULL,updated_at=? WHERE ${GUARD}`).bind(iso(now()),...owned(job,now())),
    db.prepare("UPDATE sites_analysis_job_runs SET state='batch_staged',input_hash=?,timings_json=?,ended_at=? WHERE job_id=? AND attempt=? AND owner=?").bind(job.input_hash,JSON.stringify(timings),iso(now()),job.id,job.attempts,job.lease_owner)
   ]);return getAnalysisJob(db,job.id);
  }
  const input=await openFrozenStoreHistory({bucket,manifestKey:job.manifest_key});
  if(input.inputHash!==job.input_hash)throw fail('job_input_hash_mismatch');
  let saved=await db.prepare('SELECT * FROM sites_analysis_payloads WHERE job_id=?').bind(job.id).first();
  const implementation=WORKER_IMPLEMENTATION_HASH+':'+job.kind;
  if(saved){
   if(saved.input_hash!==job.input_hash)throw fail('staged_payload_input_mismatch');
   if(saved.implementation_hash!==implementation)throw fail('staged_payload_implementation_mismatch');
   stage('payload:reuse');
  }else{
   // Leave the heavy result/model scope before composing the final envelope.
   async function calculatePayload(){
    const computed=runner?await runner({job,bucket,manifestKey:job.manifest_key,onStage:stage}):job.kind==='formal-pre'?await runFrozenFormalPre({db,bucket,job,now,onStage:stage}):job.kind==='research-holdout'?await runFrozenHoldout({db,bucket,job,onStage:stage}):job.kind==='current-model'?await runFrozenWorkerModel({bucket,manifestKey:job.manifest_key,targetDate:job.target_date,machineRows:await readMachineRows({db,bucket,job,onStage:stage}),prefixState:await readModelPrefix({db,bucket,jobId:job.id,inputHash:job.input_hash,onStage:stage}),onStage:stage}):job.kind==='research-model-search'?await runFrozenModelSearch({db,bucket,job,manifestKey:job.manifest_key,onStage:stage}):job.kind==='research-backtest'?await runFrozenResearchBacktest({db,bucket,job,manifestKey:job.manifest_key,onStage:stage}):job.kind==='feature-build'?await runFrozenFeatureBuild({bucket,manifestKey:job.manifest_key,targetDate:job.target_date,onStage:stage}):await runFrozenWorkerAnalysis({bucket,manifestKey:job.manifest_key,onStage:stage});
    const payload=job.kind==='current-model'?computed.model:computed.analysis;
    if(!payload||typeof payload!=='object')throw fail('analysis_output_invalid');
    if(computed.inputHash&&computed.inputHash!==job.input_hash)throw fail('job_input_hash_mismatch');
    if(job.kind==='feature-build'&&!runner)await prepareFeatureStoreRead({db,bucket,job,feature:payload,onStage:stage});
    stage('result:serialize');const objectKey='analysis-payloads/'+job.id+'/'+crypto.randomUUID()+'.json';
    const digest=await putCanonical(bucket,objectKey,payload,{jsonCompatible:true,verify:false,onStage:stage});
    return{objectKey,...digest};
   }
   const payload=await calculatePayload();
   await db.prepare(`INSERT INTO sites_analysis_payloads(job_id,input_hash,implementation_hash,object_key,payload_hash,payload_bytes,created_at) SELECT id,?,?,?,?,?,? FROM sites_analysis_jobs WHERE ${GUARD} ON CONFLICT(job_id) DO NOTHING`).bind(job.input_hash,implementation,payload.objectKey,payload.hash,payload.size,iso(now()),...owned(job,now())).run();
   saved=await db.prepare('SELECT * FROM sites_analysis_payloads WHERE job_id=?').bind(job.id).first();
   if(!saved)return getAnalysisJob(db,job.id);
   if(saved.input_hash!==job.input_hash||saved.implementation_hash!==implementation)throw fail('staged_payload_identity_mismatch');
   stage('payload:checkpoint');
  }
  const outputHash=saved.payload_hash;
  const descriptor={engine:ENGINE_VERSION,kind:job.kind,targetDate:job.target_date,historyLimit:job.history_limit,options:job.kind==='store-analysis'?OPTIONS:null,inputHash:job.input_hash,implementationHash:WORKER_IMPLEMENTATION_HASH};
  const envelope={format:'jugest-analysis-result-v1',jobId:job.id,storeId:job.store_id,kind:job.kind,targetDate:job.target_date,businessDate:job.kind==='store-analysis'?input.to:job.target_date,inputHash:job.input_hash,outputHash,descriptor,descriptorHash:await sha256Text(canonicalJson(descriptor)),payload:null};
  stage('result:compose');const key='analysis-results/'+job.id+'/'+crypto.randomUUID()+'.json';
  const {hash:resultHash,range}=await composeCanonicalEnvelope(bucket,key,envelope,{payloadKey:saved.object_key,payloadHash:saved.payload_hash,payloadSize:saved.payload_bytes,onStage:stage});
   await db.batch([
    db.prepare(`UPDATE sites_analysis_jobs SET result_key=?,output_hash=?,result_sha256=?,payload_offset=?,payload_size=?,state='queued',lease_owner=NULL,lease_until=NULL,last_error_class=NULL,updated_at=? WHERE ${GUARD}`).bind(key,outputHash,resultHash,range.offset,range.length,iso(now()),...owned(job,now())),
    db.prepare("UPDATE sites_analysis_job_runs SET state='result_staged',input_hash=?,output_hash=?,timings_json=?,ended_at=? WHERE job_id=? AND attempt=? AND owner=?").bind(job.input_hash,outputHash,JSON.stringify(timings),iso(now()),job.id,job.attempts,job.lease_owner)
   ]);
   return getAnalysisJob(db,job.id);
  }
  // Separate invocation: the large model is no longer strongly reachable.
  // Hash the full result and the original payload before any success is visible.
  const checkpoint=await db.prepare('SELECT * FROM sites_analysis_payloads WHERE job_id=?').bind(job.id).first();
  if(checkpoint&&(checkpoint.input_hash!==job.input_hash||checkpoint.implementation_hash!==WORKER_IMPLEMENTATION_HASH+':'+job.kind))throw fail('staged_payload_identity_mismatch');
  stage('verify:begin');
  const checked=await digestStoredCanonical(bucket,job.result_key,{range:{offset:job.payload_offset,length:job.payload_size},onStage:stage});
  if(!checked)throw fail('result_missing');
  if(checked.hash!==job.result_sha256)throw fail('result_hash_mismatch');
  if(checked.rangeHash!==job.output_hash||checked.rangeSize!==job.payload_size)throw fail('result_payload_hash_mismatch');
  const nativeInput=await openFrozenStoreHistory({bucket,manifestKey:job.manifest_key});if(nativeInput.inputHash!==job.input_hash)throw fail('job_input_hash_mismatch');
  const receiptInputHash=job.kind==='store-analysis'?await originalDailyInputHash({storeId:job.store_id,days:nativeInput.days}):job.input_hash,receiptVersion=job.kind==='store-analysis'?'vps-runtime-v1':ENGINE_VERSION;
  const key=job.result_key,outputHash=job.output_hash,resultHash=job.result_sha256,range={offset:job.payload_offset,length:job.payload_size};
  const featureWrites=[];
  if(job.kind==='formal-pre'){const o=await openCanonicalObject(bucket,job.result_key,{range:{offset:job.payload_offset,length:job.payload_size}});featureWrites.push(...await formalPreWrites({db,bucket,job,feature:JSON.parse(await o.text()),onStage:stage}));}
  if(job.kind==='research-holdout'){const o=await openCanonicalObject(bucket,job.result_key,{range:{offset:job.payload_offset,length:job.payload_size}});featureWrites.push(...await holdoutPublicationWrites({db,bucket,job,feature:JSON.parse(await o.text()),key,at:iso(now()),now,onStage:stage}));}
  if(job.kind==='research-model-search'){
   const object=await openCanonicalObject(bucket,job.result_key,{range:{offset:job.payload_offset,length:job.payload_size}});
   featureWrites.push(...await modelSearchWrites({db,job,feature:JSON.parse(await object.text()),key,at:iso(now())}),searchContextCompletion({db,job,key}));
   featureWrites.push(...await researchCycleWrites({db,job,feature:JSON.parse(await (await openCanonicalObject(bucket,job.result_key,{range:{offset:job.payload_offset,length:job.payload_size}})).text()),key,at:iso(now()),onStage:stage}));
  }
  if(job.kind==='research-backtest'){
   const object=await openCanonicalObject(bucket,job.result_key,{range:{offset:job.payload_offset,length:job.payload_size}});
   const feature=JSON.parse(await object.text());featureWrites.push(...await researchBacktestWrites({db,job,feature,key,at:iso(now()),now,onStage:stage}),...await successorStatements({db,job,feature,key,at:iso(now())}));
  }
  if(job.kind==='feature-build'){
   const object=await openCanonicalObject(bucket,job.result_key,{range:{offset:job.payload_offset,length:job.payload_size}});
   const feature=JSON.parse(await object.text());
   featureWrites.push(db.prepare("UPDATE feature_refresh_state SET completed_generation=MAX(completed_generation,generation),frontier_date=?,completed_frontier_date=?,active_job_id=CASE WHEN requested_frontier_date>? THEN (SELECT latest_job_id FROM sites_analysis_heads WHERE store_id=? AND kind='feature-build' AND latest_job_id!=?) ELSE NULL END,updated_at=? WHERE store_id=? AND feature_version=? AND (active_job_id=? OR EXISTS(SELECT 1 FROM sites_analysis_heads WHERE store_id=? AND kind='feature-build' AND latest_job_id=?)) AND EXISTS(SELECT 1 FROM sites_analysis_jobs WHERE id=? AND state='succeeded' AND result_key=?)").bind(feature.asOfDate,feature.asOfDate,feature.asOfDate,job.store_id,job.id,iso(now()),job.store_id,feature.featureVersion,job.id,job.store_id,job.id,job.id,key));
   if(feature.storeId!==job.store_id||feature.featureVersion!=='store-features-v1'||!Array.isArray(feature.rows)||feature.asOfDate>job.target_date)throw fail('feature_result_invalid');
   featureWrites.push(db.prepare("INSERT INTO sites_feature_publications(store_id,feature_version,as_of_date,job_id) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM sites_analysis_jobs WHERE id=? AND state='succeeded' AND attempts=?) ON CONFLICT(store_id,feature_version,as_of_date) DO UPDATE SET job_id=excluded.job_id WHERE excluded.job_id>sites_feature_publications.job_id").bind(job.store_id,feature.featureVersion,feature.asOfDate,job.id,job.id,job.attempts));
   const gate="EXISTS(SELECT 1 FROM sites_feature_publications p JOIN sites_analysis_jobs j ON j.id=p.job_id WHERE p.store_id=? AND p.feature_version=? AND p.as_of_date=? AND j.id=? AND j.state='succeeded' AND j.attempts=?)";
   featureWrites.push(db.prepare(`DELETE FROM store_feature_snapshots WHERE store_id=? AND feature_version=? AND as_of_date=? AND ${gate}`).bind(job.store_id,feature.featureVersion,feature.asOfDate,job.store_id,feature.featureVersion,feature.asOfDate,job.id,job.attempts));
   for(const row of feature.rows){if(row.storeId!==job.store_id||row.featureVersion!==feature.featureVersion||row.asOfDate!==feature.asOfDate)throw fail('feature_result_invalid');
    featureWrites.push(db.prepare(`INSERT INTO store_feature_snapshots(store_id,feature_version,as_of_date,dimension_key,dimension_value,window_days,day_count,machine_count,row_count,metrics_json,input_hash,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${gate} ON CONFLICT(store_id,feature_version,as_of_date,dimension_key,dimension_value,window_days) DO UPDATE SET day_count=excluded.day_count,machine_count=excluded.machine_count,row_count=excluded.row_count,metrics_json=excluded.metrics_json,input_hash=excluded.input_hash,updated_at=excluded.updated_at`).bind(row.storeId,row.featureVersion,row.asOfDate,row.dimensionKey,row.dimensionValue,row.windowDays,row.dayCount,row.machineCount,row.rowCount,canonicalJson(row.metrics),row.inputHash,iso(now()),job.store_id,feature.featureVersion,feature.asOfDate,job.id,job.attempts));
   }
  }
  if(job.kind==='feature-build'){const side=await openCanonicalObject(bucket,job.result_key,{range:{offset:job.payload_offset,length:job.payload_size}});featureWrites.push(...await featureStoreReadWrites({db,bucket,job,feature:JSON.parse(await side.text()),at:iso(now()),onStage:stage}));}
  if(job.kind==='feature-build'){const object=await openCanonicalObject(bucket,job.result_key,{range:{offset:job.payload_offset,length:job.payload_size}});featureWrites.push(...await featureCycleWrites({db,job,feature:JSON.parse(await object.text()),key,at:iso(now())}));}
  stage('result:verified');const at=iso(now());stage('result:commit-begin');
  await db.batch([
   db.prepare(`UPDATE sites_analysis_jobs SET state='succeeded',result_key=?,output_hash=?,result_sha256=?,payload_offset=?,payload_size=?,lease_owner=NULL,lease_until=NULL,last_error_class=NULL,updated_at=? WHERE ${GUARD}`).bind(key,outputHash,resultHash,range.offset,range.length,at,...owned(job,now())),
   db.prepare("UPDATE sites_analysis_heads SET completed_job_id=? WHERE store_id=? AND kind=? AND latest_job_id=? AND EXISTS(SELECT 1 FROM sites_analysis_jobs WHERE id=? AND state='succeeded' AND result_key=?)").bind(job.id,job.store_id,job.kind,job.id,job.id,key),
   db.prepare("INSERT INTO analysis_receipts(store_id,target_date,component,version,input_hash,output_hash,created_at) SELECT store_id,target_date,?,?,?,output_hash,? FROM sites_analysis_jobs WHERE id=? AND state='succeeded' AND result_key=? AND NOT EXISTS(SELECT 1 FROM analysis_receipts WHERE store_id=? AND target_date=? AND component=? AND version=? AND input_hash=? AND output_hash=?)").bind(job.kind==='store-analysis'?'store-analysis-default':job.kind,receiptVersion,receiptInputHash,at,job.id,key,job.store_id,job.target_date,job.kind==='store-analysis'?'store-analysis-default':job.kind,receiptVersion,receiptInputHash,outputHash),
   db.prepare("UPDATE sites_analysis_job_runs SET state='succeeded',input_hash=?,output_hash=?,timings_json=?,ended_at=? WHERE job_id=? AND attempt=? AND owner=? AND EXISTS(SELECT 1 FROM sites_analysis_jobs WHERE id=? AND state='succeeded' AND result_key=? AND attempts=?)").bind(job.input_hash,outputHash,JSON.stringify(timings),at,job.id,job.attempts,job.lease_owner,job.id,key,job.attempts),
   ...featureWrites
  ]);
  stage('result:committed');
 }catch(error){
  stage('job:failed',{name:error.name,code:error.code||null,message:String(error.message).slice(0,200)});
  const code=error.code||(String(error.message).includes('sites_pre_fence_valid')?'pre_state_changed':null)||(['analysis_input_hash_mismatch','analysis_input_missing','analysis_input_manifest_hash_mismatch','no_canonical_days','result_missing','result_hash_mismatch','result_payload_hash_mismatch','result_chunk_missing','result_chunk_hash_mismatch','result_manifest_invalid','staged_payload_hash_mismatch','model_stage_identity_mismatch','model_stage_hash_mismatch','model_stage_invalid'].includes(error.message)?error.message:'analysis_attempt_failed');
  await db.batch([
   db.prepare(`UPDATE sites_analysis_jobs SET state=CASE WHEN failure_count+1>=max_attempts THEN 'failed' ELSE 'retry_wait' END,failure_count=failure_count+1,lease_owner=NULL,lease_until=NULL,available_at=?,last_error_class=?,updated_at=? WHERE ${GUARD}`).bind(Date.parse(originalRetryAt({id:job.id,failureCount:job.failure_count,attempts:job.attempts},iso(now()))),code,iso(now()),...owned(job,now())),
   db.prepare("UPDATE sites_analysis_job_runs SET state='failed',error_class=?,timings_json=?,ended_at=? WHERE job_id=? AND attempt=? AND owner=? AND ended_at IS NULL").bind(code,JSON.stringify(timings),iso(now()),job.id,job.attempts,job.lease_owner)
  ]);
 }finally{await release(db,job)}
 return getAnalysisJob(db,job.id);
}
export async function readAnalysisJobResult({db,bucket,jobId}){
 const job=await getAnalysisJob(db,jobId);if(job?.state!=='succeeded'||!job.result_key)return null;
 const object=await openCanonicalObject(bucket,job.result_key);if(!object)throw fail('result_missing');
 const text=await object.text();if(await sha256Text(text)!==job.result_sha256)throw fail('result_hash_mismatch');
 const result=JSON.parse(text);
 if(result.format!=='jugest-analysis-result-v1'||result.jobId!==job.id||result.storeId!==job.store_id||result.kind!==job.kind||result.targetDate!==job.target_date||result.inputHash!==job.input_hash||result.outputHash!==job.output_hash||await sha256Text(canonicalJson(result.payload))!==job.output_hash||await sha256Text(canonicalJson(result.descriptor))!==result.descriptorHash||result.descriptor.inputHash!==job.input_hash||result.descriptor.targetDate!==job.target_date||result.descriptor.kind!==job.kind)throw fail('result_integrity_mismatch');
 return result;
}
export async function readLatestAnalysisResult({db,bucket,storeId,kind='store-analysis'}){
 const head=await db.prepare('SELECT completed_job_id FROM sites_analysis_heads WHERE store_id=? AND kind=?').bind(storeId,kind).first();
 return head?.completed_job_id?readAnalysisJobResult({db,bucket,jobId:head.completed_job_id}):null;
}

// Response paths verify immutable bytes in chunks, then stream a matching ETag.
// They do not materialize the complete large model on the server a second time.
export async function verifiedResultBody({db,bucket,jobId,payloadOnly=false,onStage=()=>{}}){
 const job=await getAnalysisJob(db,jobId);if(job?.state!=='succeeded'||!job.result_key)return null;
 const range=payloadOnly?{offset:job.payload_offset,length:job.payload_size}:undefined;
 const first=await digestStoredCanonical(bucket,job.result_key,{range,onStage});if(!first)throw fail('result_missing');
 if(first.hash!==job.result_sha256||(payloadOnly&&first.rangeHash!==job.output_hash))throw fail('result_hash_mismatch');
 const next=await openCanonicalObject(bucket,job.result_key,{range,expectedEtag:first.etag});if(!next?.body)throw fail('result_reference_changed');
 return{job,body:next.body};
}
export function jsonWrappedStream(body,prefix,suffix){const encoder=new TextEncoder();const reader=body.getReader();let begun=false;return new ReadableStream({async pull(controller){if(!begun){begun=true;controller.enqueue(encoder.encode(prefix));return}const next=await reader.read();if(!next.done){controller.enqueue(next.value);return}controller.enqueue(encoder.encode(suffix));controller.close();reader.releaseLock()},cancel(reason){return reader.cancel(reason)}})}
