import{encodeMachineRows,decodeMachineRows}from'./machine-row-codec.mjs';
import{WORKER_IMPLEMENTATION_HASH,runCompiledMachineBatchStream}from'./compiled-worker.mjs';
import{openFrozenStoreHistory}from'./input-snapshot.mjs';
import{putCanonical,digestStoredCanonical,openCanonicalObject}from'./canonical-stream.mjs';
import{encodeGraph,decodeGraph}from'./graph-codec.mjs';
import{hashCanonical}from'../../upstream/vps/src/canonical-json.mjs';
const failure=code=>Object.assign(Error(code),{code});
async function readStage({db,bucket,job,stage,onStage=()=>{}}){
 const r=await db.prepare('SELECT * FROM sites_analysis_stages WHERE job_id=? AND stage=?').bind(job.id,stage).first();if(!r)return null;
 if(r.input_hash!==job.input_hash||r.implementation_hash!==WORKER_IMPLEMENTATION_HASH)throw failure('machine_batch_identity_mismatch');
 const d=await digestStoredCanonical(bucket,r.object_key);if(!d||d.hash!==r.body_hash||d.size!==r.body_bytes)throw failure('machine_batch_hash_mismatch');
 const body=await openCanonicalObject(bucket,r.object_key);onStage('machine-batch:reuse');const value=JSON.parse(await body.text());if(value?.format==='machine-storage-v1')return{...value.header,rows:decodeMachineRows(value.data)};return decodeGraph(value);
}
async function saveStage({db,bucket,job,stage,value,now,onStage}){
 const key='machine-batches/'+job.id+'/'+crypto.randomUUID()+'.json',d=await putCanonical(bucket,key,value.format==='machine-rows-v1'?{format:'machine-storage-v1',header:{format:value.format,planHash:value.planHash,index:value.index,keys:value.keys},data:encodeMachineRows(value.rows)}:encodeGraph(value),{verify:false,onStage});
 await db.prepare("INSERT INTO sites_analysis_stages(job_id,stage,input_hash,implementation_hash,object_key,body_hash,body_bytes,created_at) SELECT id,?,?,?,?,?,?,? FROM sites_analysis_jobs WHERE id=? AND lease_owner=? AND attempts=? AND state='running' AND lease_until>? ON CONFLICT(job_id,stage) DO NOTHING").bind(stage,job.input_hash,WORKER_IMPLEMENTATION_HASH,key,d.hash,d.size,new Date(now()).toISOString(),job.id,job.lease_owner,job.attempts,now()).run();
 onStage('machine-batch:checkpoint');
}
async function imported({bucket,job,keys=null,onStage}){
 const input=await openFrozenStoreHistory({bucket,manifestKey:job.manifest_key,rawJson:true});if(input.inputHash!==job.input_hash)throw failure('machine_batch_input_mismatch');
 return runCompiledMachineBatchStream({shop:input.store.name,sourceStoreId:input.store.id,days:input.days,rawJsonDays:true,targetDate:job.target_date,keys,onStage});
}
export async function advanceMachineBatches({db,bucket,job,now=Date.now,onStage=()=>{}}){
 const setting=await db.prepare('SELECT batch_size FROM sites_analysis_partitions WHERE job_id=?').bind(job.id).first();if(!setting)return true;
 let plan=await readStage({db,bucket,job,stage:'machine-plan',onStage});
 if(!plan){const keys=await imported({bucket,job,onStage});plan={format:'machine-plan-v1',inputHash:job.input_hash,implementationHash:WORKER_IMPLEMENTATION_HASH,targetDate:job.target_date,batchSize:setting.batch_size,keys};plan.hash=hashCanonical(plan);await saveStage({db,bucket,job,stage:'machine-plan',value:plan,now,onStage})}
 const {hash,...identity}=plan;if(hash!==hashCanonical(identity)||plan.inputHash!==job.input_hash||plan.implementationHash!==WORKER_IMPLEMENTATION_HASH||plan.batchSize!==setting.batch_size||plan.targetDate!==job.target_date)throw failure('machine_batch_plan_mismatch');
 const total=Math.ceil(plan.keys.length/plan.batchSize);if(!total)throw failure('machine_batch_empty');
 for(let index=0;index<total;index++){
  const stage='machine-rows:'+index,keys=plan.keys.slice(index*plan.batchSize,(index+1)*plan.batchSize);
  const r=await db.prepare('SELECT stage FROM sites_analysis_stages WHERE job_id=? AND stage=?').bind(job.id,stage).first();if(r)continue;
  const result=await imported({bucket,job,keys,onStage});if(!result||result.version!=='v4-feature-rows-v1')throw failure('machine_batch_invalid');
  await saveStage({db,bucket,job,stage,value:{format:'machine-rows-v1',planHash:plan.hash,index,keys,rows:result.rows},now,onStage});
  onStage('machine-batch:unit-complete',{index,total,rows:result.rows.length});return false;
 }
 return true;
}
export async function readMachineRows({db,bucket,job,onStage=()=>{}}){
 const setting=await db.prepare('SELECT batch_size FROM sites_analysis_partitions WHERE job_id=?').bind(job.id).first();if(!setting)return null;
 const plan=await readStage({db,bucket,job,stage:'machine-plan',onStage});if(!plan)throw failure('machine_batch_missing');
 const {hash,...identity}=plan;if(hash!==hashCanonical(identity)||plan.batchSize!==setting.batch_size||plan.inputHash!==job.input_hash||plan.implementationHash!==WORKER_IMPLEMENTATION_HASH||plan.targetDate!==job.target_date)throw failure('machine_batch_plan_mismatch');
 const rows=[],indices=new Set(),featureStrings=new Map();let max=0;
 onStage('machine-batch:load-begin');
 for(let index=0;index<Math.ceil(plan.keys.length/plan.batchSize);index++){
  const part=await readStage({db,bucket,job,stage:'machine-rows:'+index,onStage}),keys=plan.keys.slice(index*plan.batchSize,(index+1)*plan.batchSize);
  if(!part||part.format!=='machine-rows-v1'||part.planHash!==hash||part.index!==index||hashCanonical(part.keys)!==hashCanonical(keys))throw failure('machine_batch_missing_or_mixed');
  const allowed=new Set(keys);for(const row of part.rows){if(!allowed.has(String(row.tableNo))||!Number.isSafeInteger(row._bid)||row._bid<1||indices.has(row._bid))throw failure('machine_batch_duplicate_or_invalid');for(let i=0;i<row.features.length;i++){const v=row.features[i];if(typeof v==='string'){if(featureStrings.has(v))row.features[i]=featureStrings.get(v);else featureStrings.set(v,v)}}indices.add(row._bid);max=Math.max(max,row._bid);rows.push(row)}
 }
 if(max!==rows.length)throw failure('machine_batch_incomplete');rows.sort((a,b)=>a._bid-b._bid);onStage('machine-batch:load-complete');return rows;
}
