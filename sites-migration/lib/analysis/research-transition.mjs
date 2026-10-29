import{WORKER_IMPLEMENTATION_HASH}from'./compiled-worker.mjs';
import{hashCanonical}from'../../upstream/vps/src/canonical-json.mjs';
const failure=code=>Object.assign(Error(code),{code});
export async function freezeResearchContext({db,job,snapshot,now=Date.now}){
 const old=await db.prepare('SELECT * FROM sites_research_context WHERE job_id=?').bind(job.id).first();if(old){if(old.input_hash!==snapshot.inputHash||old.implementation_hash!==WORKER_IMPLEMENTATION_HASH)throw failure('research_context_input_mismatch');return old}
 const fixed=await db.prepare('SELECT * FROM sites_research_job_inputs WHERE job_id=?').bind(job.id).first();if(!fixed||fixed.input_hash!==snapshot.inputHash)throw failure('research_input_mismatch');
 const feature=await db.prepare("SELECT j.id FROM sites_analysis_heads h JOIN sites_analysis_jobs j ON j.id=h.completed_job_id WHERE h.store_id=? AND h.kind='feature-build' AND j.input_hash=? AND j.state='succeeded'").bind(job.store_id,snapshot.inputHash).first();if(!feature)throw failure('research_features_required');
 const at=new Date(now()).toISOString(),own="EXISTS(SELECT 1 FROM sites_analysis_jobs WHERE id=? AND lease_owner=? AND attempts=? AND state='running' AND lease_until>?)",ownArgs=[job.id,job.lease_owner,job.attempts,now()];
 // Same initial/reset fields as ensureResearchCycle, excluding active-model writes.
 // Historical manual requests cannot reset a newer research frontier.
 const current=`${own} AND EXISTS(SELECT 1 FROM sites_analysis_heads WHERE store_id=? AND kind='research-backtest' AND latest_job_id=?)`;
 const cur=[...ownArgs,job.store_id,job.id];
 await db.batch([
  db.prepare(`INSERT OR IGNORE INTO research_loops(store_id,feature_version,current_fingerprint,best_fingerprint,generation,no_improve_count,state,frontier_date,search_round,updated_at) SELECT ?,?,?,?,0,0,'running',?,? ,? WHERE ${current}`).bind(job.store_id,fixed.feature_version,fixed.model_fingerprint,fixed.model_fingerprint,fixed.frontier_date,0,at,...cur),
  db.prepare(`UPDATE research_loops SET feature_version=?,current_fingerprint=?,best_fingerprint=?,no_improve_count=0,repeated_fingerprint=NULL,state='running',last_error=NULL,frontier_date=?,search_round=0,holdout_finalized_at=NULL,holdout_winner_fingerprint=NULL,updated_at=? WHERE store_id=? AND frontier_date<? AND ${current}`).bind(fixed.feature_version,fixed.model_fingerprint,fixed.model_fingerprint,fixed.frontier_date,at,job.store_id,fixed.frontier_date,...cur),
  db.prepare(`UPDATE research_loops SET state='running',last_error=NULL,updated_at=? WHERE store_id=? AND frontier_date=? AND current_fingerprint=? AND ${current}`).bind(at,job.store_id,fixed.frontier_date,fixed.model_fingerprint,...cur)
 ]);
 const loop=await db.prepare('SELECT * FROM research_loops WHERE store_id=?').bind(job.store_id).first(),generation=loop?.generation??0,round=loop?.search_round??0;
 const logicalKey=`model-search:${job.store_id}:${fixed.frontier_date}:${fixed.model_fingerprint}:g${generation}:r${round}`;
 await db.prepare(`INSERT INTO sites_research_context(job_id,feature_job_id,input_hash,model_fingerprint,frontier_date,generation,round,logical_key,implementation_hash,state,created_at) SELECT ?,?,?,?,?,?,?,?,?,'backtesting',? WHERE ${own} ON CONFLICT(job_id) DO NOTHING`).bind(job.id,feature.id,snapshot.inputHash,fixed.model_fingerprint,fixed.frontier_date,generation,round,logicalKey,WORKER_IMPLEMENTATION_HASH,at,...ownArgs).run();
 return db.prepare('SELECT * FROM sites_research_context WHERE job_id=?').bind(job.id).first();
}
export async function successorStatements({db,job,feature,key,at}){
 const c=await db.prepare('SELECT * FROM sites_research_context WHERE job_id=?').bind(job.id).first();if(!c)return[]; // Old saved jobs remain readable; no guessed context.
 if(c.implementation_hash!==WORKER_IMPLEMENTATION_HASH||c.input_hash!==job.input_hash||c.model_fingerprint!==feature.modelFingerprint||c.frontier_date!==feature.frontierDate)throw failure('research_context_identity_mismatch');
 const own="EXISTS(SELECT 1 FROM sites_analysis_jobs WHERE id=? AND state='succeeded' AND result_key=? AND attempts=?)",args=[job.id,key,job.attempts];
 const fresh=`${own} AND EXISTS(SELECT 1 FROM sites_analysis_heads WHERE store_id=? AND kind='research-backtest' AND latest_job_id=?) AND EXISTS(SELECT 1 FROM sites_analysis_heads WHERE store_id=? AND kind='feature-build' AND completed_job_id=? AND latest_job_id=completed_job_id) AND EXISTS(SELECT 1 FROM research_loops WHERE store_id=? AND frontier_date=? AND generation=? AND search_round=? AND current_fingerprint=?)`;
 const guard=[...args,job.store_id,job.id,job.store_id,c.feature_job_id,job.store_id,c.frontier_date,c.generation,c.round,c.model_fingerprint];
 if(feature.status==='insufficient_data')return[
  db.prepare(`UPDATE research_loops SET state='idle',last_error='insufficient_data',updated_at=? WHERE store_id=? AND ${fresh}`).bind(at,job.store_id,...guard),
  db.prepare(`UPDATE sites_research_context SET state='insufficient_data' WHERE job_id=? AND ${own}`).bind(job.id,...args)
 ];
 if(feature.status!=='backtested'||!feature.splits.some(x=>x.splitKind==='validation'&&x.rows.length))throw failure('research_transition_not_backtested');
 // Original logical identity + immutable input and existing channel boundary.
 const cycle=await db.prepare('SELECT root_job_id FROM sites_research_cycle_jobs WHERE job_id=? AND enabled=1').bind(job.id).first();
 const searchLogicalKey=`model-search:${job.store_id}:${c.frontier_date}:${c.model_fingerprint}:g${c.generation}:r${c.round}`;
 const identity=hashCanonical({channel:job.channel_id,logicalKey:searchLogicalKey,inputHash:c.input_hash,...(cycle?{researchCycle:cycle.root_job_id}:{})});
 return[
  db.prepare(`INSERT OR IGNORE INTO sites_analysis_jobs(store_id,channel_id,kind,target_date,history_limit,idempotency_key,manifest_key,input_hash,created_at,updated_at) SELECT store_id,channel_id,'research-model-search',target_date,history_limit,?,manifest_key,input_hash,?,? FROM sites_analysis_jobs WHERE id=? AND ${fresh}`).bind(identity,at,at,job.id,...guard),
  ...(cycle?[db.prepare(`INSERT OR IGNORE INTO sites_research_cycle_jobs(job_id,root_job_id,enabled) SELECT id,?,1 FROM sites_analysis_jobs WHERE idempotency_key=? AND ${fresh}`).bind(cycle.root_job_id,identity,...guard)]:[]),
  db.prepare(`INSERT INTO sites_research_job_inputs(job_id,input_hash,model_json,model_fingerprint,feature_version,frontier_date,created_at) SELECT j.id,i.input_hash,i.model_json,i.model_fingerprint,i.feature_version,i.frontier_date,? FROM sites_analysis_jobs j JOIN sites_research_job_inputs i ON i.job_id=? WHERE j.idempotency_key=? AND ${fresh} ON CONFLICT(job_id) DO NOTHING`).bind(at,job.id,identity,...guard),
  db.prepare(`INSERT INTO sites_research_context(job_id,parent_job_id,feature_job_id,input_hash,model_fingerprint,frontier_date,generation,round,logical_key,implementation_hash,state,created_at) SELECT j.id,c.job_id,c.feature_job_id,c.input_hash,c.model_fingerprint,c.frontier_date,c.generation,c.round,?,c.implementation_hash,'search_queued',? FROM sites_analysis_jobs j JOIN sites_research_context c ON c.job_id=? WHERE j.idempotency_key=? AND ${fresh} ON CONFLICT(job_id) DO NOTHING`).bind(searchLogicalKey,at,job.id,identity,...guard),
  db.prepare(`INSERT INTO sites_analysis_heads(store_id,kind,latest_job_id) SELECT store_id,kind,id FROM sites_analysis_jobs WHERE idempotency_key=? AND ${fresh} ON CONFLICT(store_id,kind) DO UPDATE SET latest_job_id=excluded.latest_job_id WHERE excluded.latest_job_id>sites_analysis_heads.latest_job_id`).bind(identity,...guard),
  db.prepare(`INSERT OR IGNORE INTO sites_analysis_dispatch(job_id) SELECT id FROM sites_analysis_jobs WHERE idempotency_key=? AND state NOT IN ('succeeded','failed','cancelled') AND ${fresh}`).bind(identity,...guard),
  db.prepare(`UPDATE sites_research_context SET child_job_id=(SELECT id FROM sites_analysis_jobs WHERE idempotency_key=?),state=CASE WHEN (SELECT state FROM sites_analysis_jobs WHERE idempotency_key=?)='succeeded' THEN 'search_complete_unpromoted' ELSE 'search_queued' END WHERE job_id=? AND ${fresh}`).bind(identity,identity,job.id,...guard),
  db.prepare(`UPDATE sites_research_context SET state='superseded' WHERE job_id=? AND child_job_id IS NULL AND ${own}`).bind(job.id,...args)
 ];
}
export function searchContextCompletion({db,job,key}){
 return db.prepare("UPDATE sites_research_context SET state='search_complete_unpromoted' WHERE (job_id=? OR child_job_id=?) AND NOT EXISTS(SELECT 1 FROM sites_research_cycle_jobs m WHERE m.job_id=? AND m.enabled=1) AND EXISTS(SELECT 1 FROM sites_analysis_jobs WHERE id=? AND state='succeeded' AND result_key=? AND attempts=?)").bind(job.id,job.id,job.id,job.id,key,job.attempts);
}
