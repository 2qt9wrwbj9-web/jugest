import {enqueueJob,getJob} from '../queue.mjs';

const ACTIVE_JOB_STATES=new Set(['queued','leased','running','retry_wait']);

function requiredText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function validIso(value){const text=requiredText(value,'nowIso');if(!Number.isFinite(Date.parse(text)))throw new TypeError('nowIso must be ISO date-time');return text}

export function getAnalysisRefreshState(db,{storeId,analysisVersion}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId');
  const version=requiredText(analysisVersion,'analysisVersion');
  const row=db.prepare(`SELECT store_id,analysis_version,generation,completed_generation,active_job_id,updated_at
    FROM analysis_refresh_state WHERE store_id=? AND analysis_version=?`).get(id,version);
  if(!row)return null;
  return {
    storeId:row.store_id,
    analysisVersion:row.analysis_version,
    generation:row.generation,
    completedGeneration:row.completed_generation,
    activeJobId:row.active_job_id,
    updatedAt:row.updated_at
  };
}

function markDirty(db,{storeId,analysisVersion,nowIso}){
  db.prepare(`INSERT INTO analysis_refresh_state(store_id,analysis_version,generation,completed_generation,active_job_id,updated_at)
    VALUES(?,?,1,0,NULL,?)
    ON CONFLICT(store_id,analysis_version) DO UPDATE SET
      generation=analysis_refresh_state.generation+1,
      updated_at=excluded.updated_at`).run(storeId,analysisVersion,nowIso);
}

function ensureState(db,{storeId,analysisVersion,nowIso}){
  let state=getAnalysisRefreshState(db,{storeId,analysisVersion});
  if(state)return state;
  markDirty(db,{storeId,analysisVersion,nowIso});
  return getAnalysisRefreshState(db,{storeId,analysisVersion});
}

export function requestStoreAnalysisRefresh(db,{storeId,analysisVersion,nowIso,dirty=true}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId');
  const version=requiredText(analysisVersion,'analysisVersion');
  const at=validIso(nowIso);
  if(dirty)markDirty(db,{storeId:id,analysisVersion:version,nowIso:at});
  let state=ensureState(db,{storeId:id,analysisVersion:version,nowIso:at});
  if(state.generation<=state.completedGeneration)return {state,job:null};

  if(state.activeJobId){
    const active=getJob(db,state.activeJobId);
    if(active&&ACTIVE_JOB_STATES.has(active.state))return {state,job:active};
    db.prepare(`UPDATE analysis_refresh_state SET active_job_id=NULL,updated_at=?
      WHERE store_id=? AND analysis_version=?`).run(at,id,version);
    state=getAnalysisRefreshState(db,{storeId:id,analysisVersion:version});
  }

  const job=enqueueJob(db,{
    type:'DAILY_ANALYSIS',
    priority:20,
    idempotencyKey:`daily:${id}:gen:${state.generation}:${version}`,
    payload:{storeId:id,generation:state.generation,analysisVersion:version},
    sizeClass:'medium',
    estimatedLeaseMiB:512,
    maxAttempts:3,
    createdAtIso:at
  });
  db.prepare(`UPDATE analysis_refresh_state SET active_job_id=?,updated_at=?
    WHERE store_id=? AND analysis_version=?`).run(job.id,at,id,version);
  return {state:getAnalysisRefreshState(db,{storeId:id,analysisVersion:version}),job};
}

export const __test={ACTIVE_JOB_STATES};
