// Sealed holdout infrastructure; original calculator, one historical champion per phase.
import{buildWalkForwardDataset,splitChronologicalSamples}from'./generated-research-dataset.mjs';
import{evaluateModel,fingerprintModel}from'../../upstream/vps/src/research/model-search.mjs';
import{canonicalJson,hashCanonical}from'../../upstream/vps/src/canonical-json.mjs';
import{rankRows,better}from'./generated-holdout-kernel.mjs';
import{openFrozenStoreHistory}from'./input-snapshot.mjs';
import{WORKER_IMPLEMENTATION_HASH}from'./compiled-worker.mjs';
import{putCanonical,openCanonicalObject,digestStoredCanonical}from'./canonical-stream.mjs';
import{latch,stateWrites}from'./research-cycle.mjs';
const fail=code=>Object.assign(Error(code),{code});
const safeJson=(s,fallback={})=>{try{return JSON.parse(s)}catch{return fallback}};
const guard="EXISTS(SELECT 1 FROM sites_analysis_jobs WHERE id=? AND lease_owner=? AND attempts=? AND state='running' AND lease_until>?)";
const owned=(job,now)=>[job.id,job.lease_owner,job.attempts,now()];
async function fixedInput(db,job){
 const r=await db.prepare('SELECT * FROM sites_holdout_inputs WHERE job_id=?').bind(job.id).first();if(!r||r.input_hash!==job.input_hash||r.implementation_hash!==WORKER_IMPLEMENTATION_HASH)throw fail('holdout_input_identity_mismatch');
 const loop=JSON.parse(r.loop_json),registry=JSON.parse(r.registry_json),identity=hashCanonical({inputHash:job.input_hash,implementationHash:WORKER_IMPLEMENTATION_HASH,loop,registry});if(identity!==r.identity_hash)throw fail('holdout_input_hash_mismatch');
 if(loop.state!=='converged')throw fail('holdout_not_unsealed');
 const context=await db.prepare('SELECT * FROM sites_research_context WHERE job_id=?').bind(job.id).first();if(!context||context.frontier_date!==loop.frontier_date||context.generation!==loop.generation)throw fail('holdout_frontier_mismatch');
 const models=registry.filter(x=>['historical','research_champion'].includes(x.status)).sort((a,b)=>a.generation-b.generation||a.fingerprint.localeCompare(b.fingerprint));if(!models.length)throw fail('holdout_models_missing');
 return{r,loop,registry,models,context};
}
async function checkpoint(bucket,row,identity){
 if(row.identity_hash!==identity)throw fail('holdout_model_identity_mismatch');
 const digest=await digestStoredCanonical(bucket,row.object_key);if(!digest||digest.hash!==row.body_hash||digest.size!==row.body_bytes)throw fail('holdout_model_hash_mismatch');
 const object=await openCanonicalObject(bucket,row.object_key,{expectedEtag:digest.etag});if(!object)throw fail('holdout_model_reference_changed');const value=JSON.parse(await object.text());if(value.fingerprint!==row.fingerprint||value.rows.length!==row.row_count)throw fail('holdout_model_invalid');return value;
}
function rowRecord(r,ordinal){return{ordinal,target_date:r.targetDate,machine_key:r.machineKey,rank:r.rank,score:r.predictionScore,outcome_score:r.outcomeScore,details_json:canonicalJson({strong:Boolean(r.strong),outcomeProxyVersion:r.outcomeProxyVersion,sealedHoldout:true})}}
async function stageModel({db,job,index,rows,now,onStage,verifyOnly=false}){
 for(let from=0,part=0;from<rows.length;from+=100,part++){
  const chunk=rows.slice(from,from+100).map((r,i)=>rowRecord(r,from+i)),hash=hashCanonical(chunk),old=await db.prepare('SELECT * FROM sites_holdout_parts WHERE job_id=? AND model_index=? AND part=?').bind(job.id,index,part).first();
  if(old){if(old.rows_hash!==hash||old.row_count!==chunk.length)throw fail('holdout_stage_identity_mismatch');}
  else{if(verifyOnly)throw fail('holdout_stage_incomplete');await db.batch([...chunk.map(r=>db.prepare(`INSERT INTO sites_holdout_rows(job_id,model_index,ordinal,target_date,machine_key,rank,score,outcome_score,details_json) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT(job_id,model_index,ordinal) DO UPDATE SET target_date=excluded.target_date,machine_key=excluded.machine_key,rank=excluded.rank,score=excluded.score,outcome_score=excluded.outcome_score,details_json=excluded.details_json`).bind(job.id,index,r.ordinal,r.target_date,r.machine_key,r.rank,r.score,r.outcome_score,r.details_json,...owned(job,now))),db.prepare(`INSERT INTO sites_holdout_parts(job_id,model_index,part,rows_hash,row_count) SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(job_id,model_index,part) DO NOTHING`).bind(job.id,index,part,hash,chunk.length,...owned(job,now))]);}
  const saved=(await db.prepare('SELECT ordinal,target_date,machine_key,rank,score,outcome_score,details_json FROM sites_holdout_rows WHERE job_id=? AND model_index=? AND ordinal>=? AND ordinal<? ORDER BY ordinal').bind(job.id,index,from,from+chunk.length).all()).results;
  if(hashCanonical(saved)!==hash)throw fail('holdout_stage_hash_mismatch');onStage(old?'holdout:stage-reuse':'holdout:stage-checkpoint',{model:index,part});
 }
 const count=await db.prepare('SELECT COUNT(*) n FROM sites_holdout_rows WHERE job_id=? AND model_index=?').bind(job.id,index).first();if(count.n!==rows.length)throw fail('holdout_stage_incomplete');
}
// Each unfinished model is evaluated and checkpointed in its own Worker invocation.
export async function advanceHoldoutModels({db,bucket,job,now=Date.now,onStage=()=>{}}){
 const fixed=await fixedInput(db,job);if(fixed.loop.holdout_finalized_at&&fixed.loop.holdout_winner_fingerprint)return true;
 const done=(await db.prepare('SELECT model_index FROM sites_holdout_models WHERE job_id=? ORDER BY model_index').bind(job.id).all()).results;
 let index=0;while(done.some(x=>x.model_index===index))index++;if(index>=fixed.models.length)return true;
 const source=fixed.models[index],model=safeJson(source.model_json,null);if(!model)throw fail('holdout_invalid_model_json');if(fingerprintModel(model)!==source.fingerprint)throw fail('holdout_model_fingerprint_mismatch');
 async function calculateModel(){
  onStage('holdout:dataset-begin',{model:index});const input=await openFrozenStoreHistory({bucket,manifestKey:job.manifest_key});if(input.inputHash!==job.input_hash)throw fail('holdout_input_identity_mismatch');const days=[];for await(const day of input.days)if(String(day?.date||'')<=fixed.loop.frontier_date)days.push(day);
  const dataset=buildWalkForwardDataset({storeId:job.store_id,days,minHistoryDays:4}),split=splitChronologicalSamples(dataset.samples);if(!split.holdout.length)throw fail('holdout_insufficient_data');onStage('holdout:evaluate-begin',{model:index});
  const score=evaluateModel(split.holdout,model),ranked=rankRows(split.holdout,model);onStage('holdout:evaluated',{model:index});
  // Project only AFTER the exact source evaluation and full-population ranking.
  // These are every column persisted by source persistHoldoutRun; features remain
  // in the immutable input, never omitted from evaluation or ranking.
  const rows=ranked.map(r=>({targetDate:r.targetDate,machineKey:r.machineKey,rank:r.rank,predictionScore:r.predictionScore,outcomeScore:r.outcomeScore,strong:Boolean(r.strong),outcomeProxyVersion:r.outcomeProxyVersion}));
  return{fingerprint:source.fingerprint,model,score,previousScores:safeJson(source.score_json,{}),datasetHash:dataset.inputHash,dates:split.holdoutDates,rows};
 }
 const value=await calculateModel(),rows=value.rows;onStage('holdout:rows-projected',{model:index});
 const objectKey=`analysis-holdout/${job.id}/${index}/${crypto.randomUUID()}.json`,body=await putCanonical(bucket,objectKey,value,{verify:true,onStage});onStage('holdout:model-uploaded',{model:index});
 await stageModel({db,job,index,rows,now,onStage});
 await db.prepare(`INSERT INTO sites_holdout_models(job_id,model_index,fingerprint,identity_hash,object_key,body_hash,body_bytes,row_count) SELECT ?,?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT(job_id,model_index) DO NOTHING`).bind(job.id,index,source.fingerprint,fixed.r.identity_hash,objectKey,body.hash,body.size,rows.length,...owned(job,now)).run();
 const saved=await db.prepare('SELECT * FROM sites_holdout_models WHERE job_id=? AND model_index=?').bind(job.id,index).first();if(!saved)throw fail('holdout_lease_lost');await checkpoint(bucket,saved,fixed.r.identity_hash);onStage('holdout:model-checkpoint',{model:index});return false;
}
async function activeFingerprint(db,storeId){if(!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='active_store_models'").first())return null;return(await db.prepare('SELECT fingerprint FROM active_store_models WHERE store_id=?').bind(storeId).first())?.fingerprint??null}
export async function runFrozenHoldout({db,bucket,job,onStage=()=>{}}){
 const fixed=await fixedInput(db,job);if(fixed.loop.holdout_finalized_at&&fixed.loop.holdout_winner_fingerprint)return{analysis:{winnerFingerprint:fixed.loop.holdout_winner_fingerprint,modelsEvaluated:0,holdoutDates:[],alreadyFinalized:true},inputHash:job.input_hash};
 const saved=(await db.prepare('SELECT * FROM sites_holdout_models WHERE job_id=? ORDER BY model_index').bind(job.id).all()).results;if(saved.length!==fixed.models.length)throw fail('holdout_models_incomplete');
 let winner=null,dates=null;const scores=[];for(let i=0;i<saved.length;i++){
  if(saved[i].model_index!==i||saved[i].fingerprint!==fixed.models[i].fingerprint)throw fail('holdout_model_order_mismatch');
  const value=await checkpoint(bucket,saved[i],fixed.r.identity_hash);await stageModel({db,job,index:i,rows:value.rows,now:Date.now,onStage,verifyOnly:true});if(dates&&canonicalJson(dates)!==canonicalJson(value.dates))throw fail('holdout_date_mismatch');dates=value.dates;scores.push({fingerprint:value.fingerprint,score:value.score});if(better(value,winner))winner={fingerprint:value.fingerprint,score:value.score};
 }
 onStage('holdout:all-evaluated');return{analysis:{winnerFingerprint:winner.fingerprint,modelsEvaluated:scores.length,holdoutDates:dates,alreadyFinalized:false,activeFingerprint:await activeFingerprint(db,job.store_id),snapshotTargetDate:null,scores},inputHash:job.input_hash};
}
export async function holdoutPublicationWrites({db,bucket,job,feature,key,at,now=Date.now,onStage=()=>{}}){
 const fixed=await fixedInput(db,job),current=await db.prepare('SELECT * FROM research_loops WHERE store_id=?').bind(job.store_id).first(),registry=(await db.prepare('SELECT * FROM research_model_registry WHERE store_id=? ORDER BY fingerprint').bind(job.store_id).all()).results;
 const head=await db.prepare("SELECT completed_job_id,latest_job_id FROM sites_analysis_heads WHERE store_id=? AND kind='feature-build'").bind(job.store_id).first();
 if(canonicalJson(current)!==canonicalJson(fixed.loop)||canonicalJson(registry)!==canonicalJson(fixed.registry)||head?.completed_job_id!==fixed.context.feature_job_id||head?.latest_job_id!==head?.completed_job_id)throw fail('holdout_superseded');
 const actual=(await runFrozenHoldout({db,bucket,job,onStage})).analysis;if(hashCanonical(feature)!==hashCanonical(actual))throw fail('holdout_result_invalid');
 if(feature.alreadyFinalized){const plan={loop:current,registry,action:'holdout_finalized',reason:'already_finalized',next:null},l=latch({db,job,key,at,before:{loop:current,registry},plan});return[l.statement,db.prepare(`UPDATE sites_research_context SET state='holdout_finalized' WHERE job_id=? AND ${l.gate}`).bind(job.id,...l.args),db.prepare(`UPDATE sites_research_decisions SET applied_at=? WHERE job_id=? AND ${l.gate}`).bind(at,job.id,...l.args),publicationFence(db,job,key,fixed.context)]}
 const rows=registry.map(r=>({...r})),loop={...current,current_fingerprint:feature.winnerFingerprint,best_fingerprint:feature.winnerFingerprint,holdout_finalized_at:at,holdout_winner_fingerprint:feature.winnerFingerprint,updated_at:at};
 const models=(await db.prepare('SELECT * FROM sites_holdout_models WHERE job_id=? ORDER BY model_index').bind(job.id).all()).results,out=[];
 for(let i=0;i<models.length;i++){
  const value=await checkpoint(bucket,models[i],fixed.r.identity_hash),row=rows.find(x=>x.fingerprint===value.fingerprint);row.holdout_score=value.score.top3Lift;row.score_json=canonicalJson({...value.previousScores,holdout:value.score,holdoutDatasetHash:value.datasetHash});row.updated_at=at;
  // Validate in bounded chunks immediately before the guarded transaction.
  await stageModel({db,job,index:i,rows:value.rows,now,onStage,verifyOnly:true});
 }
 for(const r of rows){if(r.status==='research_champion'){r.status='historical';r.updated_at=at}if(r.fingerprint===feature.winnerFingerprint){r.status='research_champion';r.updated_at=at}}
 const plan={loop,registry:rows,action:'holdout_finalized',reason:null,next:null},l=latch({db,job,key,at,before:{loop:current,registry},plan});out.push(l.statement);
 for(let i=0;i<models.length;i++){
  const value=await checkpoint(bucket,models[i],fixed.r.identity_hash),identity=[job.store_id,value.fingerprint,current.feature_version,'holdout',hashCanonical({datasetHash:value.datasetHash,split:'holdout',modelFingerprint:value.fingerprint,dates:value.dates})],where='store_id=? AND model_fingerprint=? AND feature_version=? AND split_kind=? AND input_hash=?',g=l.gate,a=l.args;
  out.push(db.prepare(`INSERT OR IGNORE INTO backtest_runs(store_id,model_fingerprint,model_json,feature_version,split_kind,from_date,to_date,prediction_count,score_json,input_hash,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${g}`).bind(job.store_id,value.fingerprint,canonicalJson(value.model),current.feature_version,'holdout',value.dates[0]??null,value.dates.at(-1)??null,value.rows.length,canonicalJson(value.score),identity[4],at,...a),
   db.prepare(`UPDATE backtest_runs SET score_json=?,prediction_count=?,created_at=? WHERE ${where} AND ${g}`).bind(canonicalJson(value.score),value.rows.length,at,...identity,...a),
   db.prepare(`DELETE FROM backtest_predictions WHERE run_id=(SELECT id FROM backtest_runs WHERE ${where}) AND ${g}`).bind(...identity,...a),
   db.prepare(`INSERT INTO backtest_predictions(run_id,target_date,machine_key,rank,score,outcome_score,details_json) SELECT (SELECT id FROM backtest_runs WHERE ${where}),target_date,machine_key,rank,score,outcome_score,details_json FROM sites_holdout_rows WHERE job_id=? AND model_index=? AND ${g} ORDER BY ordinal`).bind(...identity,job.id,i,...a));
 }
 out.push(...stateWrites({db,job,plan,l}),db.prepare(`UPDATE sites_research_context SET state='holdout_finalized' WHERE (job_id=? OR job_id=?) AND ${l.gate}`).bind(job.id,fixed.context.parent_job_id,...l.args),db.prepare(`UPDATE sites_research_decisions SET applied_at=? WHERE job_id=? AND ${l.gate}`).bind(at,job.id,...l.args));
 out.push(publicationFence(db,job,key,fixed.context));
 onStage('holdout:publication-planned');return out;
}

function publicationFence(db,job,key,context){return db.prepare("INSERT INTO sites_holdout_commits(job_id,validated) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM sites_research_decisions WHERE job_id=? AND result_key=? AND applied_at IS NOT NULL) AND EXISTS(SELECT 1 FROM sites_analysis_heads WHERE store_id=? AND kind='feature-build' AND latest_job_id=? AND completed_job_id=?) THEN 1 ELSE 0 END ON CONFLICT(job_id) DO UPDATE SET validated=excluded.validated").bind(job.id,job.id,key,job.store_id,context.feature_job_id,context.feature_job_id)}
