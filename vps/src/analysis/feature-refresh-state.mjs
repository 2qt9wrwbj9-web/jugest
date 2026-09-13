import {enqueueJob,getJob} from '../queue.mjs';

const ACTIVE_JOB_STATES=new Set(['queued','leased','running','retry_wait']);
const FEATURE_JOB_PRIORITY=40;
const FEATURE_JOB_LEASE_MIB=512;

function requiredText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function validIso(value){const text=requiredText(value,'nowIso');if(!Number.isFinite(Date.parse(text)))throw new TypeError('nowIso must be ISO date-time');return text}
function validDate(value,name){const text=requiredText(value,name);if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(`${text}T00:00:00Z`)))throw new TypeError(`${name} must be YYYY-MM-DD`);return text}
function newerDate(a,b){if(!a)return b||null;if(!b)return a;return a>=b?a:b}

export function getFeatureRefreshState(db,{storeId,featureVersion}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId');
  const version=requiredText(featureVersion,'featureVersion');
  const row=db.prepare(`SELECT store_id,feature_version,generation,completed_generation,active_job_id,frontier_date,requested_frontier_date,completed_frontier_date,updated_at
    FROM feature_refresh_state WHERE store_id=? AND feature_version=?`).get(id,version);
  if(!row)return null;
  return Object.freeze({
    storeId:row.store_id,featureVersion:row.feature_version,
    generation:Number(row.generation)||0,completedGeneration:Number(row.completed_generation)||0,
    activeJobId:row.active_job_id??null,
    requestedFrontierDate:row.requested_frontier_date??row.frontier_date??null,
    completedFrontierDate:row.completed_frontier_date??null,
    frontierDate:row.completed_frontier_date??row.frontier_date??null,
    updatedAt:row.updated_at
  });
}

function ensureState(db,{storeId,featureVersion,frontierDate,nowIso}){
  db.prepare(`INSERT INTO feature_refresh_state(store_id,feature_version,generation,completed_generation,active_job_id,frontier_date,requested_frontier_date,completed_frontier_date,updated_at)
    VALUES(?,?,0,0,NULL,NULL,?,NULL,?)
    ON CONFLICT(store_id,feature_version) DO NOTHING`).run(storeId,featureVersion,frontierDate,nowIso);
  return getFeatureRefreshState(db,{storeId,featureVersion});
}

export function requestFeatureRefresh(db,{storeId,featureVersion,frontierDate,nowIso,dirty=true}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId');
  const version=requiredText(featureVersion,'featureVersion');
  const at=validIso(nowIso);
  const frontier=validDate(frontierDate,'frontierDate');
  let state=ensureState(db,{storeId:id,featureVersion:version,frontierDate:frontier,nowIso:at});

  const requested=newerDate(state.requestedFrontierDate,frontier);
  if(dirty||requested!==state.requestedFrontierDate){
    db.prepare(`UPDATE feature_refresh_state SET
      generation=generation+CASE WHEN ? THEN 1 ELSE 0 END,
      requested_frontier_date=?,updated_at=? WHERE store_id=? AND feature_version=?`)
      .run(dirty?1:0,requested,at,id,version);
    state=getFeatureRefreshState(db,{storeId:id,featureVersion:version});
  }

  if(state.completedFrontierDate&&state.completedFrontierDate>=state.requestedFrontierDate)return {state,job:null};
  if(state.activeJobId){
    const active=getJob(db,state.activeJobId);
    if(active&&ACTIVE_JOB_STATES.has(active.state))return {state,job:active};
    db.prepare('UPDATE feature_refresh_state SET active_job_id=NULL,updated_at=? WHERE store_id=? AND feature_version=?').run(at,id,version);
    state=getFeatureRefreshState(db,{storeId:id,featureVersion:version});
  }

  const targetFrontierDate=state.requestedFrontierDate;
  const job=enqueueJob(db,{
    type:'FEATURE_BUILD',priority:FEATURE_JOB_PRIORITY,
    idempotencyKey:`feature:${id}:${version}:${targetFrontierDate}`,
    payload:{storeId:id,featureVersion:version,targetFrontierDate},
    sizeClass:'medium',estimatedLeaseMiB:FEATURE_JOB_LEASE_MIB,maxAttempts:3,createdAtIso:at
  });
  db.prepare('UPDATE feature_refresh_state SET active_job_id=?,updated_at=? WHERE store_id=? AND feature_version=?').run(job.id,at,id,version);
  return {state:getFeatureRefreshState(db,{storeId:id,featureVersion:version}),job};
}

export function completeFeatureRefresh(db,{storeId,featureVersion,jobId,completedFrontierDate,frontierDate,nowIso}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId');
  const version=requiredText(featureVersion,'featureVersion');
  const at=validIso(nowIso);
  if(!Number.isInteger(jobId))throw new TypeError('jobId is required');
  const completed=validDate(completedFrontierDate??frontierDate,'completedFrontierDate');
  const state=getFeatureRefreshState(db,{storeId:id,featureVersion:version});
  if(!state)throw Object.assign(new Error('feature refresh state is missing'),{code:'feature_refresh_state_missing'});
  if(state.activeJobId!==jobId)throw Object.assign(new Error('feature job is stale'),{code:'stale_feature_job'});
  db.prepare(`UPDATE feature_refresh_state SET completed_generation=MAX(completed_generation,generation),frontier_date=?,completed_frontier_date=?,active_job_id=NULL,updated_at=?
    WHERE store_id=? AND feature_version=?`).run(completed,completed,at,id,version);
  const next=getFeatureRefreshState(db,{storeId:id,featureVersion:version});
  if(next.requestedFrontierDate&&next.requestedFrontierDate>completed){
    return requestFeatureRefresh(db,{storeId:id,featureVersion:version,frontierDate:next.requestedFrontierDate,nowIso:at,dirty:false});
  }
  return {state:next,job:null};
}

export const requestStoreFeatureRefresh=requestFeatureRefresh;
export const __test={ACTIVE_JOB_STATES,FEATURE_JOB_PRIORITY,FEATURE_JOB_LEASE_MIB,newerDate};
