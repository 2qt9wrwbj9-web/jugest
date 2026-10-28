import{canonicalJson,hashCanonical}from'../../upstream/vps/src/canonical-json.mjs';
const failure=code=>Object.assign(Error(code),{code});
// Temporary rows are private to one immutable result. They are never queried by
// the original backtest APIs; only the final atomic transaction publishes them.
export async function stageBacktestRows({db,job,feature,now=Date.now,onStage=()=>{}}){
 const count=feature.splits.reduce((n,s)=>n+s.rows.length,0);if(count<=1000)return false;
 const guard="EXISTS(SELECT 1 FROM sites_analysis_jobs WHERE id=? AND lease_owner=? AND attempts=? AND state='running' AND lease_until>?)";
 const owned=()=>[job.id,job.lease_owner,job.attempts,now()];let index=0,part=0,chunk=[];
 async function flush(){if(!chunk.length)return;
  const hash=hashCanonical(chunk),old=await db.prepare('SELECT * FROM sites_backtest_stage_parts WHERE job_id=? AND part=?').bind(job.id,part).first();
  if(old){
   if(old.output_hash!==job.output_hash||old.rows_hash!==hash||old.row_count!==chunk.length)throw failure('backtest_stage_identity_mismatch');
   const rows=(await db.prepare('SELECT ordinal,split_kind,target_date,machine_key,rank,score,outcome_score,details_json FROM sites_backtest_stage_rows WHERE job_id=? AND ordinal>=? AND ordinal<? ORDER BY ordinal').bind(job.id,chunk[0].ordinal,chunk.at(-1).ordinal+1).all()).results;
   if(hashCanonical(rows)!==hash)throw failure('backtest_stage_hash_mismatch');onStage('backtest-save:reuse');
  }else{
   const statements=chunk.map(r=>db.prepare(`INSERT INTO sites_backtest_stage_rows(job_id,ordinal,split_kind,target_date,machine_key,rank,score,outcome_score,details_json) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT(job_id,ordinal) DO UPDATE SET split_kind=excluded.split_kind,target_date=excluded.target_date,machine_key=excluded.machine_key,rank=excluded.rank,score=excluded.score,outcome_score=excluded.outcome_score,details_json=excluded.details_json`).bind(job.id,r.ordinal,r.split_kind,r.target_date,r.machine_key,r.rank,r.score,r.outcome_score,r.details_json,...owned()));
   statements.push(db.prepare(`INSERT INTO sites_backtest_stage_parts(job_id,part,output_hash,rows_hash,row_count) SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(job_id,part) DO NOTHING`).bind(job.id,part,job.output_hash,hash,chunk.length,...owned()));
   await db.batch(statements);const saved=await db.prepare('SELECT output_hash,rows_hash FROM sites_backtest_stage_parts WHERE job_id=? AND part=?').bind(job.id,part).first();if(saved?.output_hash!==job.output_hash||saved.rows_hash!==hash)throw failure('backtest_stage_lease_lost');onStage('backtest-save:checkpoint');
  }
  chunk=[];part++;
 }
 for(const s of feature.splits)for(const r of s.rows){chunk.push({ordinal:index++,split_kind:s.splitKind,target_date:r.targetDate,machine_key:r.machineKey,rank:r.rank,score:r.score,outcome_score:r.outcomeScore,details_json:canonicalJson(r.details)});if(chunk.length===500)await flush()}
 await flush();const actual=await db.prepare('SELECT COUNT(*) n FROM sites_backtest_stage_rows WHERE job_id=?').bind(job.id).first();if(actual.n!==count)throw failure('backtest_stage_incomplete');return true;
}
