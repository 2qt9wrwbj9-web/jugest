function canonicalize(value){
  if(Array.isArray(value))return value.map(canonicalize);
  if(value&&typeof value==='object'){
    const out={};
    for(const key of Object.keys(value).sort())out[key]=canonicalize(value[key]);
    return out;
  }
  return value;
}

function canonicalJson(value){return JSON.stringify(canonicalize(value));}
function nowIso(){return new Date().toISOString();}

function rowToJob(row){
  if(!row)return null;
  return Object.freeze({
    id:row.id,
    type:row.type,
    priority:row.priority,
    idempotencyKey:row.idempotency_key,
    payload:JSON.parse(row.payload_json),
    sizeClass:row.size_class,
    estimatedLeaseMiB:row.estimated_lease_mib,
    maxAttempts:row.max_attempts,
    attempts:row.attempts,
    state:row.state,
    leaseOwner:row.lease_owner,
    heartbeatAt:row.heartbeat_at,
    availableAt:row.available_at,
    lastErrorClass:row.last_error_class,
    lastErrorMessage:row.last_error_message,
    createdAt:row.created_at,
    updatedAt:row.updated_at
  });
}

function transaction(db,fn){
  db.exec('BEGIN IMMEDIATE;');
  try{const result=fn();db.exec('COMMIT;');return result}
  catch(error){try{db.exec('ROLLBACK;')}catch{}throw error}
}

function requireOwner(owner){if(typeof owner!=='string'||!owner)throw new TypeError('owner is required')}
function requireIso(value,name){if(typeof value!=='string'||!value)throw new TypeError(`${name} is required`)}

export function getJob(db,id){return rowToJob(db.prepare('SELECT * FROM jobs WHERE id=?').get(id));}

export function peekNextJob(db,{nowIso:at}={}){
  requireIso(at,'nowIso');
  return rowToJob(db.prepare(`SELECT * FROM jobs
    WHERE state='queued' OR (state='retry_wait' AND (available_at IS NULL OR available_at<=?))
    ORDER BY priority ASC,id ASC LIMIT 1`).get(at));
}

export function enqueueJob(db,{type,priority,idempotencyKey,payload={},sizeClass='small',estimatedLeaseMiB,maxAttempts=3,createdAtIso=nowIso()}={}){
  if(typeof type!=='string'||!type)throw new TypeError('job type is required');
  if(!Number.isInteger(priority))throw new TypeError('job priority must be an integer');
  if(typeof idempotencyKey!=='string'||!idempotencyKey)throw new TypeError('idempotencyKey is required');
  if(typeof sizeClass!=='string'||!sizeClass)throw new TypeError('sizeClass is required');
  if(!Number.isFinite(estimatedLeaseMiB)||estimatedLeaseMiB<=0)throw new TypeError('estimatedLeaseMiB must be positive');
  if(!Number.isInteger(maxAttempts)||maxAttempts<1)throw new TypeError('maxAttempts must be a positive integer');
  const existing=rowToJob(db.prepare('SELECT * FROM jobs WHERE idempotency_key=?').get(idempotencyKey));
  if(existing)return existing;
  db.prepare(`INSERT INTO jobs(type,priority,idempotency_key,payload_json,size_class,estimated_lease_mib,max_attempts,attempts,state,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,0,'queued',?,?)`).run(type,priority,idempotencyKey,canonicalJson(payload),sizeClass,estimatedLeaseMiB,maxAttempts,createdAtIso,createdAtIso);
  return rowToJob(db.prepare('SELECT * FROM jobs WHERE idempotency_key=?').get(idempotencyKey));
}

export function claimNextJob(db,{owner,nowIso:at}={}){
  requireOwner(owner);requireIso(at,'nowIso');
  return transaction(db,()=>{
    const row=db.prepare(`SELECT * FROM jobs
      WHERE state='queued' OR (state='retry_wait' AND (available_at IS NULL OR available_at<=?))
      ORDER BY priority ASC,id ASC LIMIT 1`).get(at);
    if(!row)return null;
    const changed=db.prepare(`UPDATE jobs SET state='leased',lease_owner=?,heartbeat_at=?,attempts=attempts+1,updated_at=?
      WHERE id=? AND state IN ('queued','retry_wait')`).run(owner,at,at,row.id);
    if(changed.changes!==1)return null;
    return getJob(db,row.id);
  });
}

export function markJobRunning(db,{jobId,owner,nowIso:at}={}){
  requireOwner(owner);requireIso(at,'nowIso');
  return transaction(db,()=>{
    const job=getJob(db,jobId);
    if(!job||job.state!=='leased'||job.leaseOwner!==owner)throw new Error('job is not leased by owner');
    db.prepare("UPDATE jobs SET state='running',heartbeat_at=?,updated_at=? WHERE id=? AND state='leased' AND lease_owner=?").run(at,at,jobId,owner);
    db.prepare(`INSERT OR IGNORE INTO job_runs(job_id,attempt,owner,started_at) VALUES(?,?,?,?)`).run(jobId,job.attempts,owner,at);
    return getJob(db,jobId);
  });
}

export function heartbeatJob(db,{jobId,owner,nowIso:at}={}){
  requireOwner(owner);requireIso(at,'nowIso');
  const changed=db.prepare(`UPDATE jobs SET heartbeat_at=?,updated_at=? WHERE id=? AND lease_owner=? AND state IN ('leased','running')`).run(at,at,jobId,owner);
  if(changed.changes!==1)throw new Error('heartbeat rejected');
  return getJob(db,jobId);
}

export function completeJob(db,{jobId,owner,nowIso:at,peakRssMiB=null,resultHash=null,exitCode=0}={}){
  requireOwner(owner);requireIso(at,'nowIso');
  return transaction(db,()=>{
    const job=getJob(db,jobId);
    if(!job||job.state!=='running'||job.leaseOwner!==owner)throw new Error('job is not running for owner');
    db.prepare(`UPDATE jobs SET state='succeeded',lease_owner=NULL,heartbeat_at=NULL,available_at=NULL,updated_at=? WHERE id=?`).run(at,jobId);
    db.prepare(`UPDATE job_runs SET ended_at=?,exit_code=?,peak_rss_mib=?,output_hash=? WHERE job_id=? AND attempt=?`).run(at,exitCode,peakRssMiB,resultHash,jobId,job.attempts);
    return getJob(db,jobId);
  });
}

export function failJob(db,{jobId,owner,nowIso:at,retryAtIso,errorClass='error',message='',peakRssMiB=null,exitCode=1}={}){
  requireOwner(owner);requireIso(at,'nowIso');requireIso(retryAtIso,'retryAtIso');
  return transaction(db,()=>{
    const job=getJob(db,jobId);
    if(!job||!['leased','running'].includes(job.state)||job.leaseOwner!==owner)throw new Error('job is not active for owner');
    const nextState=job.attempts>=job.maxAttempts?'failed':'retry_wait';
    const available=nextState==='retry_wait'?retryAtIso:null;
    db.prepare(`UPDATE jobs SET state=?,lease_owner=NULL,heartbeat_at=NULL,available_at=?,last_error_class=?,last_error_message=?,updated_at=? WHERE id=?`).run(nextState,available,errorClass,String(message),at,jobId);
    db.prepare(`UPDATE job_runs SET ended_at=?,exit_code=?,peak_rss_mib=?,error_class=? WHERE job_id=? AND attempt=?`).run(at,exitCode,peakRssMiB,errorClass,jobId,job.attempts);
    return getJob(db,jobId);
  });
}

export function cancelJob(db,{jobId,nowIso:at=nowIso(),reason='cancelled'}={}){
  requireIso(at,'nowIso');
  db.prepare(`UPDATE jobs SET state='cancelled',lease_owner=NULL,heartbeat_at=NULL,available_at=NULL,last_error_class='cancelled',last_error_message=?,updated_at=?
    WHERE id=? AND state IN ('queued','leased','running','retry_wait')`).run(String(reason),at,jobId);
  return getJob(db,jobId);
}

export function recoverStaleJobs(db,{staleBeforeIso,nowIso:at}={}){
  requireIso(staleBeforeIso,'staleBeforeIso');requireIso(at,'nowIso');
  return transaction(db,()=>{
    const rows=db.prepare(`SELECT * FROM jobs WHERE state IN ('leased','running') AND heartbeat_at IS NOT NULL AND heartbeat_at<? ORDER BY id`).all(staleBeforeIso);
    for(const row of rows){
      const nextState=row.attempts>=row.max_attempts?'failed':'retry_wait';
      const available=nextState==='retry_wait'?at:null;
      db.prepare(`UPDATE jobs SET state=?,lease_owner=NULL,heartbeat_at=NULL,available_at=?,last_error_class='stale_recovery',last_error_message='stale lease recovered',updated_at=? WHERE id=?`).run(nextState,available,at,row.id);
      db.prepare(`UPDATE job_runs SET ended_at=?,exit_code=-1,error_class='stale_recovery' WHERE job_id=? AND attempt=? AND ended_at IS NULL`).run(at,row.id,row.attempts);
    }
    return rows.length;
  });
}
