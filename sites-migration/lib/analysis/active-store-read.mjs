import{canonicalJson,hashCanonical}from'../../upstream/vps/src/canonical-json.mjs';
import{buildStoreReadPayload,STORE_READ_SNAPSHOT_TYPE,STORE_READ_VERSION}from'../../upstream/vps/src/research/store-read-output.mjs';
import{__test as liveSource}from'../../upstream/vps/src/research/live-comparison.mjs';
import{fingerprintModel}from'../../upstream/vps/src/research/model-search.mjs';
import{planFeatureResearch}from'./research-cycle.mjs';
import{createPrePlan,observe,insertRow,writeSql,prePlanStatements}from'./pre-atomic.mjs';
import{openFrozenStoreHistory}from'./input-snapshot.mjs';
import{putCanonical,digestStoredCanonical,openCanonicalObject}from'./canonical-stream.mjs';
import{WORKER_IMPLEMENTATION_HASH}from'./compiled-worker.mjs';
const fail=code=>Object.assign(Error(code),{code});
const parse=s=>{try{return JSON.parse(s)}catch{return{}}};
export async function prepareFeatureStoreRead({db,bucket,job,feature,onStage=()=>{}}){
 const old=await db.prepare('SELECT * FROM sites_feature_outputs WHERE job_id=?').bind(job.id).first();if(old)return readFeaturePlan({bucket,row:old,job});
 const plan=await createPrePlan(db,job.store_id),active=(await observe(plan,db,'active_store_models'))[0]??null,loop=(await observe(plan,db,'research_loops'))[0]??null,registry=await observe(plan,db,'research_model_registry'),head=await db.prepare("SELECT * FROM sites_analysis_heads WHERE store_id=? AND kind='feature-build'").bind(job.store_id).first();
 let payload=null,live=null,initial=null;
 const skip=head?.latest_job_id!==job.id||loop?.frontier_date>feature.asOfDate;
 if(!skip){
  const input=await openFrozenStoreHistory({bucket,manifestKey:job.manifest_key});if(input.inputHash!==job.input_hash)throw fail('feature_store_read_input_mismatch');const days=[];for await(const day of input.days)if(day.date<=feature.asOfDate)days.push(day);
  const research=planFeatureResearch({before:{loop,registry},job,feature,at:job.created_at}),model=active?parse(active.model_json):research.champion,fp=active?.fingerprint??fingerprintModel(research.champion),version=active?.feature_version??feature.featureVersion,holdoutScore=active?.holdout_score??null;
  onStage('store-read:begin');payload=buildStoreReadPayload({storeId:job.store_id,modelFingerprint:fp,model,featureVersion:version,frontierDate:feature.asOfDate,days,holdoutScore});onStage('store-read:calculated');
  if(!active)initial={store_id:job.store_id,fingerprint:fp,model_json:canonicalJson(model),feature_version:version,source_frontier_date:feature.asOfDate,holdout_score:holdoutScore};
  if(payload.rankings.length){const rankings=liveSource.normalizeRankings(payload.rankings),body={rankings};live={store_id:job.store_id,target_date:payload.targetDate,engine:'pre_research',engine_version:STORE_READ_VERSION,model_fingerprint:fp,feature_version:version,source_frontier_date:feature.asOfDate,input_hash:hashCanonical({storeId:job.store_id,frontierDate:feature.asOfDate,featureVersion:version,days}),payload_json:canonicalJson(body),payload_hash:hashCanonical(body)}}
 }
 const value={plan,before:{active,loop,registry},payload,live,initial,skip,featureIdentity:hashCanonical(feature)},key='feature-store-read/'+job.id+'/'+crypto.randomUUID()+'.json',saved=await putCanonical(bucket,key,value,{verify:true,onStage});
 await db.prepare("INSERT INTO sites_feature_outputs(job_id,input_hash,implementation_hash,object_key,body_hash,body_bytes) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sites_analysis_jobs WHERE id=? AND state='running' AND lease_owner=? AND attempts=?) ON CONFLICT(job_id) DO NOTHING").bind(job.id,job.input_hash,WORKER_IMPLEMENTATION_HASH,key,saved.hash,saved.size,job.id,job.lease_owner,job.attempts).run();
 const row=await db.prepare('SELECT * FROM sites_feature_outputs WHERE job_id=?').bind(job.id).first();if(!row)throw fail('feature_store_read_lease_lost');onStage('store-read:checkpoint');return readFeaturePlan({bucket,row,job});
}
async function readFeaturePlan({bucket,row,job}){if(row.input_hash!==job.input_hash||row.implementation_hash!==WORKER_IMPLEMENTATION_HASH)throw fail('feature_store_read_identity_mismatch');const digest=await digestStoredCanonical(bucket,row.object_key);if(!digest||digest.hash!==row.body_hash||digest.size!==row.body_bytes)throw fail('feature_store_read_hash_mismatch');const object=await openCanonicalObject(bucket,row.object_key,{expectedEtag:digest.etag});if(!object)throw fail('feature_store_read_changed');return JSON.parse(await object.text())}
export async function featureStoreReadWrites({db,bucket,job,feature,at,onStage=()=>{}}){
 const head=await db.prepare("SELECT latest_job_id FROM sites_analysis_heads WHERE store_id=? AND kind='feature-build'").bind(job.store_id).first();if(head?.latest_job_id!==job.id)return[];
 const row=await db.prepare('SELECT * FROM sites_feature_outputs WHERE job_id=?').bind(job.id).first();if(!row)throw fail('feature_store_read_missing');const fixed=await readFeaturePlan({bucket,row,job});if(fixed.featureIdentity!==hashCanonical(feature))throw fail('feature_store_read_result_mismatch');if(fixed.skip)return[];
 const plan=fixed.plan,mode=await db.prepare('SELECT enabled FROM sites_research_cycle_jobs WHERE job_id=?').bind(job.id).first();
 // The old calculation-only option remains available. Ensure source model/loop
 // state for the snapshot; automatic research continuation remains opt-in.
 if(!mode?.enabled){const research=planFeatureResearch({before:fixed.before,job,feature,at}).plan;for(const model of research.registry){const keys=Object.keys(model);writeSql(plan,`INSERT INTO research_model_registry(${keys.join(',')}) VALUES(${keys.map(()=>'?')}) ON CONFLICT(store_id,fingerprint) DO UPDATE SET ${keys.filter(k=>!['store_id','fingerprint'].includes(k)).map(k=>k+'=excluded.'+k).join(',')}`,keys.map(k=>model[k]??null))}const keys=Object.keys(research.loop);writeSql(plan,`INSERT INTO research_loops(${keys.join(',')}) VALUES(${keys.map(()=>'?')}) ON CONFLICT(store_id) DO UPDATE SET ${keys.filter(k=>k!=='store_id').map(k=>k+'=excluded.'+k).join(',')}`,keys.map(k=>research.loop[k]??null));}
 if(fixed.initial)insertRow(plan,'active_store_models',{...fixed.initial,activated_at:at,updated_at:at});
 const payloadJson=canonicalJson(fixed.payload);if(new TextEncoder().encode(payloadJson).byteLength>1500000)throw fail('store_read_snapshot_requires_large_object_adapter');
 writeSql(plan,'INSERT INTO client_snapshots(store_id,snapshot_type,version,business_date,payload_json,payload_hash,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(store_id,snapshot_type,version) DO UPDATE SET business_date=excluded.business_date,payload_json=excluded.payload_json,payload_hash=excluded.payload_hash,updated_at=excluded.updated_at',[job.store_id,STORE_READ_SNAPSHOT_TYPE,STORE_READ_VERSION,fixed.payload.targetDate,payloadJson,hashCanonical(fixed.payload),at]);
 if(fixed.live)insertRow(plan,'store_prediction_snapshots',{...fixed.live,created_at:at},{ignore:true});
 onStage('store-read:publication-planned');return prePlanStatements({db,plan,job});
}
