// Infrastructure adapter for the fixed research-cycle semantics. No active-model writer.
import{baselineModel,fingerprintModel,shouldConverge}from'../../upstream/vps/src/research/model-search.mjs';
import{canonicalJson,hashCanonical}from'../../upstream/vps/src/canonical-json.mjs';
import{WORKER_IMPLEMENTATION_HASH}from'./compiled-worker.mjs';
const fail=code=>Object.assign(Error(code),{code});
const loopFields=['feature_version','current_fingerprint','best_fingerprint','generation','no_improve_count','repeated_fingerprint','state','last_error','frontier_date','search_round','holdout_finalized_at','holdout_winner_fingerprint','updated_at'];
const modelFields=['model_json','parent_fingerprint','generation','status','validation_score','holdout_score','score_json','created_at','updated_at'];
export function planResearchDecision({loop,registry,feature,at}){
 const next={...loop},rows=registry.map(x=>({...x})),search=feature.search,best=search?.best,candidate=best?.model??null,fp=candidate?fingerprintModel(candidate):null,champion=feature.championFingerprint;
 const scoreJson={round:feature.round,baseline:search?.baseline,best:best?{fingerprint:best.model.fingerprint,train:best.train,validation:best.validation}:null,axesDiscovered:feature.axes.length,candidatesEvaluated:search?.candidatesEvaluated,minSupport:feature.minSupport};
 const validationScore=best?.validation?.top3Lift??search?.baseline?.top3Lift??null;
 const repeated=Boolean(fp&&rows.some(x=>x.fingerprint===fp)&&fp!==champion);let action='continue',reason=null,nextKind='research-model-search',nextModel=feature.champion;
 function upsert(status,generation){let row=rows.find(x=>x.fingerprint===fp);if(!row){row={store_id:feature.storeId,fingerprint:fp,model_json:canonicalJson(candidate),parent_fingerprint:champion,generation,status,validation_score:validationScore,holdout_score:null,score_json:canonicalJson(scoreJson),created_at:at,updated_at:at};rows.push(row)}else Object.assign(row,{parent_fingerprint:row.parent_fingerprint??champion,generation:Math.max(row.generation,generation),status,validation_score:validationScore,score_json:canonicalJson(scoreJson),updated_at:at});}
 if(feature.status==='insufficient_data'){Object.assign(next,{state:'idle',last_error:'insufficient_data',updated_at:at});return{loop:next,registry:rows,action:'insufficient_data',reason:'insufficient_data',next:null,promotedFingerprint:null,converged:false}}
 if(search.improved&&candidate&&!repeated&&fp!==champion){
  for(const r of rows)if(r.status==='research_champion')Object.assign(r,{status:'historical',updated_at:at});
  upsert('research_champion',loop.generation+1);Object.assign(next,{current_fingerprint:fp,best_fingerprint:fp,generation:loop.generation+1,no_improve_count:0,repeated_fingerprint:null,state:'running',search_round:0,updated_at:at});action='promoted';nextKind='research-backtest';nextModel=candidate;
 }else{
  if(candidate&&fp!==champion)upsert('rejected',loop.generation);
  const noImprove=loop.no_improve_count+1,convergence=shouldConverge({seenFingerprints:repeated?new Set([fp]):new Set(),proposedFingerprint:fp,noImproveCount:noImprove});
  if(convergence){Object.assign(next,{no_improve_count:noImprove,repeated_fingerprint:convergence.reason==='repeat'?fp:null,state:'converged',updated_at:at});action='converged';reason=convergence.reason;nextKind=null}
  else Object.assign(next,{no_improve_count:noImprove,search_round:loop.search_round+1,state:'running',updated_at:at});
 }
 const logicalKey=nextKind?(nextKind==='research-backtest'?`backtest:${feature.storeId}:${feature.frontierDate}:${fingerprintModel(nextModel)}:g${next.generation}`:`model-search:${feature.storeId}:${feature.frontierDate}:${champion}:g${next.generation}:r${next.search_round}`):null;
 return{loop:next,registry:rows,action,reason,next:nextKind?{kind:nextKind,model:nextModel,logicalKey}:null,promotedFingerprint:action==='promoted'?fp:null,converged:action==='converged'};
}
async function snapshot(db,storeId){return{loop:await db.prepare('SELECT * FROM research_loops WHERE store_id=?').bind(storeId).first(),registry:(await db.prepare('SELECT * FROM research_model_registry WHERE store_id=? ORDER BY fingerprint').bind(storeId).all()).results}}
function latch({db,job,key,at,before,plan}){
 const registryJson=canonicalJson(before.registry);if(new TextEncoder().encode(registryJson).length>1500000)throw fail('research_registry_snapshot_too_large');
 const loopGate=before.loop?`EXISTS(SELECT 1 FROM research_loops WHERE store_id=? AND ${loopFields.map(k=>k+' IS json_extract(?,\'$.'+k+'\')').join(' AND ')})`:'NOT EXISTS(SELECT 1 FROM research_loops WHERE store_id=?)';
 const loopArgs=before.loop?[job.store_id,...loopFields.map(()=>canonicalJson(before.loop))]:[job.store_id];
 const registryGate=`(SELECT COUNT(*) FROM research_model_registry WHERE store_id=?)=json_array_length(?) AND NOT EXISTS(SELECT 1 FROM json_each(?) q WHERE NOT EXISTS(SELECT 1 FROM research_model_registry r WHERE r.store_id=? AND r.fingerprint=json_extract(q.value,'$.fingerprint') AND ${modelFields.map(k=>'r.'+k+" IS json_extract(q.value,'$."+k+"')").join(' AND ')}))`;
 const hash=hashCanonical(plan),gate="EXISTS(SELECT 1 FROM sites_research_decisions WHERE job_id=? AND attempt=? AND result_key=? AND decision_hash=? AND applied_at IS NULL)",args=[job.id,job.attempts,key,hash];
 return{gate,args,hash,statement:db.prepare(`INSERT OR IGNORE INTO sites_research_decisions(job_id,attempt,result_key,input_hash,implementation_hash,decision_hash,action,reason,plan_json,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sites_analysis_jobs WHERE id=? AND state='succeeded' AND result_key=? AND attempts=?) AND EXISTS(SELECT 1 FROM sites_analysis_heads WHERE store_id=? AND kind=? AND latest_job_id=?) AND ${loopGate} AND ${registryGate}`).bind(job.id,job.attempts,key,job.input_hash,WORKER_IMPLEMENTATION_HASH,hash,plan.action,plan.reason??null,canonicalJson({action:plan.action,reason:plan.reason??null,promotedFingerprint:plan.promotedFingerprint??null,next:plan.next?{kind:plan.next.kind,logicalKey:plan.next.logicalKey}:null,loop:plan.loop}),at,job.id,key,job.attempts,job.store_id,job.kind,job.id,...loopArgs,job.store_id,registryJson,registryJson,job.store_id)};
}
function stateWrites({db,job,plan,l}){
 const out=[];for(const row of plan.registry)out.push(db.prepare(`INSERT INTO research_model_registry(store_id,fingerprint,${modelFields.join(',')}) SELECT ?,?,${modelFields.map(()=>'?').join(',')} WHERE ${l.gate} ON CONFLICT(store_id,fingerprint) DO UPDATE SET ${modelFields.map(k=>k+'=excluded.'+k).join(',')}`).bind(job.store_id,row.fingerprint,...modelFields.map(k=>row[k]??null),...l.args));
 out.push(db.prepare(`INSERT INTO research_loops(store_id,${loopFields.join(',')}) SELECT ?,${loopFields.map(()=>'?').join(',')} WHERE ${l.gate} ON CONFLICT(store_id) DO UPDATE SET ${loopFields.map(k=>k+'=excluded.'+k).join(',')}`).bind(job.store_id,...loopFields.map(k=>plan.loop[k]??null),...l.args));return out;
}
function childWrites({db,job,plan,c,root,l,at}){
 if(plan.converged)return holdoutChildWrites({db,job,plan,c,root,l,at});
 if(!plan.next)return[];const n=plan.next,fp=fingerprintModel(n.model),identity=hashCanonical({channel:job.channel_id,logicalKey:n.logicalKey,inputHash:job.input_hash,researchCycle:root});const query=s=>db.prepare(s);const g=l.gate,a=l.args;
 return[
 query(`INSERT OR IGNORE INTO sites_analysis_jobs(store_id,channel_id,kind,target_date,history_limit,idempotency_key,manifest_key,input_hash,created_at,updated_at) SELECT store_id,channel_id,?,target_date,history_limit,?,manifest_key,input_hash,?,? FROM sites_analysis_jobs WHERE id=? AND ${g}`).bind(n.kind,identity,at,at,job.id,...a),
 query(`INSERT INTO sites_research_job_inputs(job_id,input_hash,model_json,model_fingerprint,feature_version,frontier_date,created_at) SELECT id,?,?,?,?,?,? FROM sites_analysis_jobs WHERE idempotency_key=? AND ${g} ON CONFLICT(job_id) DO NOTHING`).bind(job.input_hash,canonicalJson(n.model),fp,plan.loop.feature_version,plan.loop.frontier_date,at,identity,...a),
 query(`INSERT INTO sites_research_context(job_id,parent_job_id,feature_job_id,input_hash,model_fingerprint,frontier_date,generation,round,logical_key,implementation_hash,state,created_at) SELECT id,?,?,?,?,?,?,?,?,?,'cycle_queued',? FROM sites_analysis_jobs WHERE idempotency_key=? AND ${g} ON CONFLICT(job_id) DO NOTHING`).bind(job.id,c.feature_job_id,job.input_hash,fp,plan.loop.frontier_date,plan.loop.generation,plan.loop.search_round,n.logicalKey,WORKER_IMPLEMENTATION_HASH,at,identity,...a),
 query(`INSERT OR IGNORE INTO sites_research_cycle_jobs(job_id,root_job_id,enabled) SELECT id,?,1 FROM sites_analysis_jobs WHERE idempotency_key=? AND ${g}`).bind(root,identity,...a),
 query(`INSERT INTO sites_analysis_heads(store_id,kind,latest_job_id) SELECT store_id,kind,id FROM sites_analysis_jobs WHERE idempotency_key=? AND ${g} ON CONFLICT(store_id,kind) DO UPDATE SET latest_job_id=excluded.latest_job_id WHERE excluded.latest_job_id>sites_analysis_heads.latest_job_id`).bind(identity,...a),
 query(`INSERT OR IGNORE INTO sites_analysis_dispatch(job_id) SELECT id FROM sites_analysis_jobs WHERE idempotency_key=? AND state NOT IN ('succeeded','failed','cancelled') AND ${g}`).bind(identity,...a),
 query(`UPDATE sites_research_context SET child_job_id=(SELECT id FROM sites_analysis_jobs WHERE idempotency_key=?) WHERE job_id=? AND ${g}`).bind(identity,job.id,...a)
 ];
}
function finishWrites({db,job,plan,l,at}){return[
 db.prepare(`UPDATE sites_research_context SET state=? WHERE job_id=? AND ${l.gate}`).bind(plan.action==='converged'?'converged_holdout_pending':plan.action,job.id,...l.args),
 db.prepare(`UPDATE sites_research_decisions SET applied_at=? WHERE job_id=? AND ${l.gate}`).bind(at,job.id,...l.args),
 db.prepare("UPDATE sites_research_context SET state='cycle_superseded' WHERE job_id=? AND EXISTS(SELECT 1 FROM sites_analysis_jobs WHERE id=? AND state='succeeded' AND result_key=?) AND NOT EXISTS(SELECT 1 FROM sites_research_decisions WHERE job_id=? AND applied_at IS NOT NULL)").bind(job.id,job.id,l.args[2],job.id)
]}
export async function researchCycleWrites({db,job,feature,key,at,onStage=()=>{}}){
 const mode=await db.prepare('SELECT root_job_id FROM sites_research_cycle_jobs WHERE job_id=? AND enabled=1').bind(job.id).first();if(!mode)return[];
 const c=await db.prepare('SELECT * FROM sites_research_context WHERE job_id=?').bind(job.id).first();if(!c||c.input_hash!==job.input_hash||c.implementation_hash!==WORKER_IMPLEMENTATION_HASH)throw fail('research_cycle_context_mismatch');
 const before=await snapshot(db,job.store_id),loop=before.loop,head=await db.prepare("SELECT completed_job_id,latest_job_id FROM sites_analysis_heads WHERE store_id=? AND kind='feature-build'").bind(job.store_id).first();
 const fresh=loop?.state==='running'&&loop.frontier_date===c.frontier_date&&loop.generation===c.generation&&loop.search_round===c.round&&loop.current_fingerprint===c.model_fingerprint&&head?.completed_job_id===c.feature_job_id&&head.latest_job_id===head.completed_job_id;
 if(!fresh)return[db.prepare("UPDATE sites_research_context SET state='cycle_superseded' WHERE job_id=? AND EXISTS(SELECT 1 FROM sites_analysis_jobs WHERE id=? AND state='succeeded' AND result_key=?)").bind(job.id,job.id,key)];
 const plan=planResearchDecision({loop,registry:before.registry,feature,at});onStage('research-cycle:planned', {action:plan.action});const l=latch({db,job,key,at,before,plan});return[l.statement,...stateWrites({db,job,plan,l}),...childWrites({db,job,plan,c,root:mode.root_job_id,l,at}),...finishWrites({db,job,plan,l,at})];
}
export async function featureCycleWrites({db,job,feature,key,at}){
 const mode=await db.prepare('SELECT root_job_id FROM sites_research_cycle_jobs WHERE job_id=? AND enabled=1').bind(job.id).first();if(!mode)return[];
 const before=await snapshot(db,job.store_id);if(before.loop?.frontier_date>feature.asOfDate)return[];
 const champions=before.registry.filter(x=>x.status==='research_champion').sort((a,b)=>b.generation-a.generation||b.updated_at.localeCompare(a.updated_at)),model=champions[0]?JSON.parse(champions[0].model_json):baselineModel(),fp=fingerprintModel(model),rows=before.registry.map(x=>({...x}));
 if(!champions.length){let existing=rows.find(x=>x.fingerprint===fp);if(existing)Object.assign(existing,{status:'research_champion',updated_at:at});else rows.push({store_id:job.store_id,fingerprint:fp,model_json:canonicalJson(model),parent_fingerprint:null,generation:0,status:'research_champion',validation_score:null,holdout_score:null,score_json:'{}',created_at:at,updated_at:at})}
 let loop=before.loop?{...before.loop}:{store_id:job.store_id,feature_version:feature.featureVersion,current_fingerprint:fp,best_fingerprint:fp,generation:0,no_improve_count:0,repeated_fingerprint:null,state:'running',last_error:null,frontier_date:feature.asOfDate,search_round:0,holdout_finalized_at:null,holdout_winner_fingerprint:null,updated_at:at};
 if(before.loop&&before.loop.frontier_date!==feature.asOfDate)Object.assign(loop,{feature_version:feature.featureVersion,current_fingerprint:fp,best_fingerprint:fp,no_improve_count:0,repeated_fingerprint:null,frontier_date:feature.asOfDate,search_round:0,holdout_finalized_at:null,holdout_winner_fingerprint:null});Object.assign(loop,{state:'running',last_error:null,updated_at:at});
 const plan={loop,registry:rows,action:'cycle_started',next:{kind:'research-backtest',model,logicalKey:`backtest:${job.store_id}:${feature.asOfDate}:${fp}:g${loop.generation}`}},l=latch({db,job,key,at,before,plan});
 const c={feature_job_id:job.id};return[l.statement,...stateWrites({db,job,plan,l}),db.prepare(`INSERT INTO sites_research_context(job_id,feature_job_id,input_hash,model_fingerprint,frontier_date,generation,round,logical_key,implementation_hash,state,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${l.gate} ON CONFLICT(job_id) DO NOTHING`).bind(job.id,job.id,job.input_hash,fp,feature.asOfDate,loop.generation,loop.search_round,'feature-cycle:'+job.id,WORKER_IMPLEMENTATION_HASH,'cycle_started',at,...l.args),...childWrites({db,job,plan,c,root:mode.root_job_id,l,at}),...finishWrites({db,job,plan,l,at})];
}

function holdoutChildWrites({db,job,plan,c,root,l,at}){
 const fixed={loop:plan.loop,registry:plan.registry.slice().sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint))},identityHash=hashCanonical({inputHash:job.input_hash,implementationHash:WORKER_IMPLEMENTATION_HASH,...fixed}),logicalKey=`sealed-holdout:${job.store_id}:${plan.loop.frontier_date}:g${plan.loop.generation}`,identity=hashCanonical({logicalKey,identityHash,root}),g=l.gate,a=l.args;
 return[
 db.prepare(`INSERT OR IGNORE INTO sites_analysis_jobs(store_id,channel_id,kind,target_date,history_limit,idempotency_key,manifest_key,input_hash,created_at,updated_at) SELECT store_id,channel_id,'research-holdout',target_date,history_limit,?,manifest_key,input_hash,?,? FROM sites_analysis_jobs WHERE id=? AND ${g}`).bind(identity,at,at,job.id,...a),
 db.prepare(`INSERT INTO sites_holdout_inputs(job_id,identity_hash,input_hash,implementation_hash,loop_json,registry_json,created_at) SELECT id,?,?,?,?,?,? FROM sites_analysis_jobs WHERE idempotency_key=? AND ${g} ON CONFLICT(job_id) DO NOTHING`).bind(identityHash,job.input_hash,WORKER_IMPLEMENTATION_HASH,canonicalJson(fixed.loop),canonicalJson(fixed.registry),at,identity,...a),
 db.prepare(`INSERT INTO sites_research_context(job_id,parent_job_id,feature_job_id,input_hash,model_fingerprint,frontier_date,generation,round,logical_key,implementation_hash,state,created_at) SELECT id,?,?,?,?,?,?,?,?,?,'holdout_queued',? FROM sites_analysis_jobs WHERE idempotency_key=? AND ${g} ON CONFLICT(job_id) DO NOTHING`).bind(job.id,c.feature_job_id,job.input_hash,plan.loop.current_fingerprint,plan.loop.frontier_date,plan.loop.generation,plan.loop.search_round,logicalKey,WORKER_IMPLEMENTATION_HASH,at,identity,...a),
 db.prepare(`INSERT OR IGNORE INTO sites_research_cycle_jobs(job_id,root_job_id,enabled) SELECT id,?,1 FROM sites_analysis_jobs WHERE idempotency_key=? AND ${g}`).bind(root,identity,...a),
 db.prepare(`INSERT INTO sites_analysis_heads(store_id,kind,latest_job_id) SELECT store_id,kind,id FROM sites_analysis_jobs WHERE idempotency_key=? AND ${g} ON CONFLICT(store_id,kind) DO UPDATE SET latest_job_id=excluded.latest_job_id WHERE excluded.latest_job_id>sites_analysis_heads.latest_job_id`).bind(identity,...a),
 db.prepare(`INSERT OR IGNORE INTO sites_analysis_dispatch(job_id) SELECT id FROM sites_analysis_jobs WHERE idempotency_key=? AND ${g}`).bind(identity,...a),
 db.prepare(`UPDATE sites_research_context SET child_job_id=(SELECT id FROM sites_analysis_jobs WHERE idempotency_key=?) WHERE job_id=? AND ${g}`).bind(identity,job.id,...a)
 ];
}
export{latch,stateWrites};
