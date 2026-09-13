import {enqueueJob,getJob} from '../queue.mjs';

const ACTIVE_JOB_STATES=new Set(['queued','leased','running','retry_wait']);
export const SHADOW_JOB_PRIORITY=70;
export const SHADOW_JOB_LEASE_MIB=512;
export const SHADOW_ENGINE_VERSION='current-v5';

function requiredText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function validIso(value){const text=requiredText(value,'nowIso');if(!Number.isFinite(Date.parse(text)))throw new TypeError('nowIso must be ISO date-time');return text}
function validDate(value,name){const text=requiredText(value,name);if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(`${text}T00:00:00Z`)))throw new TypeError(`${name} must be YYYY-MM-DD`);return text}
function newerDate(a,b){if(!a)return b||null;if(!b)return a;return a>=b?a:b}

export function getShadowRefreshState(db,{storeId}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId');
  const row=db.prepare('SELECT store_id,requested_frontier_date,completed_frontier_date,active_job_id,updated_at FROM shadow_refresh_state WHERE store_id=?').get(id);
  if(!row)return null;
  return Object.freeze({storeId:row.store_id,requestedFrontierDate:row.requested_frontier_date??null,completedFrontierDate:row.completed_frontier_date??null,activeJobId:row.active_job_id??null,updatedAt:row.updated_at});
}

function ensureState(db,{storeId,frontierDate,nowIso}){
  db.prepare(`INSERT INTO shadow_refresh_state(store_id,requested_frontier_date,completed_frontier_date,active_job_id,updated_at)
    VALUES(?,?,NULL,NULL,?) ON CONFLICT(store_id) DO NOTHING`).run(storeId,frontierDate,nowIso);
  return getShadowRefreshState(db,{storeId});
}

export function requestShadowPrediction(db,{storeId,frontierDate,nowIso}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId'),frontier=validDate(frontierDate,'frontierDate'),at=validIso(nowIso);
  let state=ensureState(db,{storeId:id,frontierDate:frontier,nowIso:at});
  const requested=newerDate(state.requestedFrontierDate,frontier);
  if(requested!==state.requestedFrontierDate){
    db.prepare('UPDATE shadow_refresh_state SET requested_frontier_date=?,updated_at=? WHERE store_id=?').run(requested,at,id);
    state=getShadowRefreshState(db,{storeId:id});
  }
  if(state.completedFrontierDate&&state.completedFrontierDate>=state.requestedFrontierDate)return {state,job:null};
  if(state.activeJobId){
    const active=getJob(db,state.activeJobId);
    if(active&&ACTIVE_JOB_STATES.has(active.state))return {state,job:active};
    db.prepare('UPDATE shadow_refresh_state SET active_job_id=NULL,updated_at=? WHERE store_id=?').run(at,id);
    state=getShadowRefreshState(db,{storeId:id});
  }
  const targetFrontierDate=state.requestedFrontierDate;
  const job=enqueueJob(db,{
    type:'SHADOW_PREDICT',priority:SHADOW_JOB_PRIORITY,
    idempotencyKey:`shadow:${id}:${SHADOW_ENGINE_VERSION}:${targetFrontierDate}`,
    payload:{storeId:id,targetFrontierDate,engineVersion:SHADOW_ENGINE_VERSION},
    sizeClass:'medium',estimatedLeaseMiB:SHADOW_JOB_LEASE_MIB,maxAttempts:3,createdAtIso:at
  });
  db.prepare('UPDATE shadow_refresh_state SET active_job_id=?,updated_at=? WHERE store_id=?').run(job.id,at,id);
  return {state:getShadowRefreshState(db,{storeId:id}),job};
}

export function completeShadowPrediction(db,{storeId,jobId,completedFrontierDate,nowIso}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId'),completed=validDate(completedFrontierDate,'completedFrontierDate'),at=validIso(nowIso);
  if(!Number.isInteger(jobId))throw new TypeError('jobId is required');
  const state=getShadowRefreshState(db,{storeId:id});
  if(!state)throw Object.assign(new Error('shadow refresh state is missing'),{code:'shadow_refresh_state_missing'});
  if(state.activeJobId!==jobId)throw Object.assign(new Error('shadow job is stale'),{code:'stale_shadow_job'});
  db.prepare('UPDATE shadow_refresh_state SET completed_frontier_date=?,active_job_id=NULL,updated_at=? WHERE store_id=?').run(completed,at,id);
  const next=getShadowRefreshState(db,{storeId:id});
  if(next.requestedFrontierDate&&next.requestedFrontierDate>completed)return requestShadowPrediction(db,{storeId:id,frontierDate:next.requestedFrontierDate,nowIso:at});
  return {state:next,job:null};
}

export const __test={ACTIVE_JOB_STATES,newerDate};
