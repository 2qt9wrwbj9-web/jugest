import{WORKER_IMPLEMENTATION_HASH,runCompiledStoreModelPrefixStream}from'./compiled-worker.mjs';
import{openFrozenStoreHistory}from'./input-snapshot.mjs';
import{putCanonical,openCanonicalObject,digestStoredCanonical}from'./canonical-stream.mjs';
import{encodeGraph,decodeGraph}from'./graph-codec.mjs';
export async function readModelPrefix({db,bucket,jobId,inputHash,onStage=()=>{}}){
 const saved=await db.prepare("SELECT * FROM sites_analysis_stages WHERE job_id=? AND stage='v5-prefix'").bind(jobId).first();if(!saved)return null;
 if(saved.input_hash!==inputHash||saved.implementation_hash!==WORKER_IMPLEMENTATION_HASH)throw Error('model_stage_identity_mismatch');
 const checked=await digestStoredCanonical(bucket,saved.object_key);if(!checked||checked.hash!==saved.body_hash||checked.size!==saved.body_bytes)throw Error('model_stage_hash_mismatch');
 const object=await openCanonicalObject(bucket,saved.object_key);const state=decodeGraph(JSON.parse(await object.text()));if(!state||state.version!=='v5-prefix-v1')throw Error('model_stage_invalid');onStage('model-prefix:reuse');return state;
}
export async function prepareModelPrefix({db,bucket,job,snapshot,now=Date.now,onStage=()=>{}}){
 if(await readModelPrefix({db,bucket,jobId:job.id,inputHash:snapshot.inputHash,onStage}))return;
 const input=await openFrozenStoreHistory({bucket,manifestKey:snapshot.manifestKey,rawJson:true});
 const state=await runCompiledStoreModelPrefixStream({shop:input.store.name,sourceStoreId:input.store.id,days:input.days,rawJsonDays:true,targetDate:job.target_date,onStage});
 // Original engine will reject insufficient input in its normal analysis phase.
 if(!state)return;
 const objectKey='analysis-stages/'+job.id+'/'+crypto.randomUUID()+'.json';onStage('model-prefix:serialize');
 const body=await putCanonical(bucket,objectKey,encodeGraph(state),{verify:false,onStage});
 const guard="id=? AND lease_owner=? AND attempts=? AND state='running' AND lease_until>?";
 await db.prepare(`INSERT INTO sites_analysis_stages(job_id,stage,input_hash,implementation_hash,object_key,body_hash,body_bytes,created_at) SELECT id,'v5-prefix',?,?,?,?,?,? FROM sites_analysis_jobs WHERE ${guard} ON CONFLICT(job_id,stage) DO NOTHING`).bind(snapshot.inputHash,WORKER_IMPLEMENTATION_HASH,objectKey,body.hash,body.size,new Date(now()).toISOString(),job.id,job.lease_owner,job.attempts,now()).run();
 onStage('model-prefix:checkpoint');
}
