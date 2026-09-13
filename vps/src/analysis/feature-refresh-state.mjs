import {enqueueJob,getJob} from '../queue.mjs';

const ACTIVE_JOB_STATES=new Set(['queued','leased','running','retry_wait']);
const FEATURE_JOB_PRIORITY=60;
const FEATURE_JOB_LEASE_MIB=640;

function requiredText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function validIso(value){const text=requiredText(value,'nowIso');if(!Number.isFinite(Date.parse(text)))throw new TypeError('nowIso must be ISO date-time');return text}

export function getFeatureRefreshState(db,{storeId,featureVersion}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId');
  const version=requiredText(featureVersion,'featureVersion');
  const row=db.prepare(`SELECT store_id,feature_version,generation,completed_generation,active_job_id,frontier_date,updated_at
    FROM feature_refresh_state WHERE store_id=? AND feature_version=?`).get(id,version);
  if(!row)return null;
  return Object.freeze({
    storeId:row.store_id,
    featureVersion:row.feature_version,
    generation:Number(row.generation)||0,
    completedGeneration:Number(row.completed_generation)||0,
    activeJobId:row.active_job_id??null,
    frontierDate:row.frontier_date??null,
    updatedAt:row.updated_at
  });
}

function markDirty(db,{storeId,featureVersion,nowIso}){
  db.prepare(`INSERT INTO feature_refresh_state(store_id,feature_version,generation,completed_generation,active_job_id,frontier_date,updated_at)
    VALUES(?,?,1,0,NULL,NULL,?)
    ON CONFLICT(store_id,feature_version) DO UPDATE SET
      generation=feature_refresh_state.generation+1,
      updated_at=excluded.updated_at`).run(storeId,featureVersion,nowIso);
}

function ensureState(db,{storeId,featureVersion,nowIso}){
  let state=getFeatureRefreshState(db,{storeId,featureVersion});
  if(state)return state;
  markDirty(db,{storeId,featureVersion,nowIso});
  return getFeatureRefreshState(db,{storeId,featureVersion});
}

export function requestStoreFeatureRefresh(db,{storeId,featureVersion,nowIso,dirty=true}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId');
  const version=requiredText(featureVersion,'featureVersion');
  const at=validIso(nowIso);
  if(dirty)markDirty(db,{storeId:id,featureVersion:version,nowIso:at});
  let state=ensureState(db,{storeId:id,featureVersion:version,nowIso:at});
  if(state.generation<=state.completedGeneration)return {state,job:null};

  if(state.activeJobId){
    const active=getJob(db,state.activeJobId);
    if(active&&ACTIVE_JOB_STATES.has(active.state))return {state,job:active};
    db.prepare(`UPDATE feature_refresh_state SET active_job_id=NULL,updated_at=? WHERE store_id=? AND feature_version=?`).run(at,id,version);
    state=getFeatureRefreshState(db,{storeId:id,featureVersion:version});
  }

  const job=enqueueJob(db,{
    type:'FEATURE_BUILD',
    priority:FEATURE_JOB_PRIORITY,
    idempotencyKey:`feature:${id}:gen:${state.generation}:${version}`,
    payload:{storeId:id,generation:state.generation,featureVersion:version},
    sizeClass:'medium',
    estimatedLeaseMiB:FEATURE_JOB_LEASE_MIB,
    maxAttempts:3,
    createdAtIso:at
  });
  db.prepare(`UPDATE feature_refresh_state SET active_job_id=?,updated_at=? WHERE store_id=? AND feature_version=?`).run(job.id,at,id,version);
  return {state:getFeatureRefreshState(db,{storeId:id,featureVersion:version}),job};
}

export function completeFeatureRefresh(db,{storeId,featureVersion,jobId,targetGeneration,frontierDate,nowIso}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId');
  const version=requiredText(featureVersion,'featureVersion');
  const at=validIso(nowIso);
  if(!Number.isInteger(jobId))throw new TypeError('jobId is required');
  if(!Number.isInteger(targetGeneration)||targetGeneration<0)throw new TypeError('targetGeneration must be a non-negative integer');
  const state=getFeatureRefreshState(db,{storeId:id,featureVersion:version});
  if(!state)throw Object.assign(new Error('feature refresh state is missing'),{code:'feature_refresh_state_missing'});
  if(state.activeJobId!==jobId)throw Object.assign(new Error('feature job is stale'),{code:'stale_feature_job'});
  db.prepare(`UPDATE feature_refresh_state SET completed_generation=MAX(completed_generation,?),frontier_date=?,active_job_id=NULL,updated_at=?
    WHERE store_id=? AND feature_version=?`).run(targetGeneration,frontierDate??state.frontierDate,at,id,version);
  return requestStoreFeatureRefresh(db,{storeId:id,featureVersion:version,nowIso:at,dirty:false});
}

export const __test={ACTIVE_JOB_STATES,FEATURE_JOB_PRIORITY,FEATURE_JOB_LEASE_MIB};
