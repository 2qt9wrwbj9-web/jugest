const DAY_MS=86400000;
const JST_OFFSET_MS=9*60*60*1000;
const RETRY_MS=45*60*1000;
const NOT_FOUND_WINDOW_MS=24*60*60*1000;

function assertDb(db){if(!db?.prepare)throw new TypeError('db is required');}
function assertText(v,name){if(typeof v!=='string'||!v.trim())throw new TypeError(`${name} is required`);return v.trim();}
function assertDate(v,name='date'){
  const s=assertText(v,name);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(`${s}T00:00:00Z`)))throw new TypeError(`${name} must be YYYY-MM-DD`);
  return s;
}
function assertIso(v,name='timestamp'){
  const s=assertText(v,name);
  if(!Number.isFinite(Date.parse(s)))throw new TypeError(`${name} must be ISO date-time`);
  return s;
}
function isoPlus(iso,ms){return new Date(Date.parse(iso)+ms).toISOString();}
function dateShift(day,n){return new Date(Date.parse(`${day}T00:00:00Z`)+n*DAY_MS).toISOString().slice(0,10);}
function jstParts(now){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new TypeError('now must be a valid Date');
  const d=new Date(now.getTime()+JST_OFFSET_MS);
  return {today:d.toISOString().slice(0,10),hour:d.getUTCHours()};
}
function mapStore(r){return r?{storeId:r.store_id,slug:r.slug,name:r.name,enabled:!!r.enabled,historyStart:r.history_start,createdAt:r.created_at,updatedAt:r.updated_at}:null;}
function mapDay(r){return r?{
  storeId:r.store_id,businessDate:r.business_date,state:r.state,retryAfter:r.retry_after,
  runOwner:r.run_owner,startedAt:r.started_at,leaseExpiresAt:r.lease_expires_at,
  attemptCount:r.attempt_count,notFoundCount:r.not_found_count,firstNotFoundAt:r.first_not_found_at,
  lastAttemptAt:r.last_attempt_at,lastSuccessAt:r.last_success_at,lastHttpStatus:r.last_http_status,
  lastErrorClass:r.last_error_class,lastErrorMessage:r.last_error_message,
  rawArtifactPath:r.raw_artifact_path,rawSha256:r.raw_sha256,updatedAt:r.updated_at
}:null;}
function mapControl(r){return r?{
  globalBlockUntil:r.global_block_until,lastRunStartedAt:r.last_run_started_at,
  lastRunEndedAt:r.last_run_ended_at,lastRunResult:r.last_run_result,updatedAt:r.updated_at
}:null;}

function tx(db,fn){
  db.exec('BEGIN IMMEDIATE');
  try{const out=fn();db.exec('COMMIT');return out}catch(error){try{db.exec('ROLLBACK')}catch{}throw error}
}

export function addCollectorStore(db,{storeId,slug,name,historyStart,nowIso}){
  assertDb(db);storeId=assertText(storeId,'storeId');slug=assertText(slug,'slug');name=assertText(name,'name');historyStart=assertDate(historyStart,'historyStart');nowIso=assertIso(nowIso,'nowIso');
  return tx(db,()=>{
    db.prepare(`INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at)
      VALUES(?,?,'{}',?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at`).run(storeId,name,nowIso,nowIso);
    db.prepare(`INSERT INTO collector_stores(store_id,slug,name,enabled,history_start,created_at,updated_at)
      VALUES(?,?,?,0,?,?,?)
      ON CONFLICT(store_id) DO UPDATE SET slug=excluded.slug,name=excluded.name,history_start=excluded.history_start,updated_at=excluded.updated_at`).run(storeId,slug,name,historyStart,nowIso,nowIso);
    return mapStore(db.prepare('SELECT * FROM collector_stores WHERE store_id=?').get(storeId));
  });
}

export function listCollectorStores(db){assertDb(db);return db.prepare('SELECT * FROM collector_stores ORDER BY name,store_id').all().map(mapStore);}

export function setCollectorStoreEnabled(db,{storeId,enabled,nowIso}){
  assertDb(db);storeId=assertText(storeId,'storeId');nowIso=assertIso(nowIso,'nowIso');
  if(typeof enabled!=='boolean')throw new TypeError('enabled must be boolean');
  const r=db.prepare('UPDATE collector_stores SET enabled=?,updated_at=? WHERE store_id=?').run(enabled?1:0,nowIso,storeId);
  if(!r.changes)throw new Error(`collector store not found: ${storeId}`);
  return mapStore(db.prepare('SELECT * FROM collector_stores WHERE store_id=?').get(storeId));
}

export function getCollectorDay(db,storeId,businessDate){
  assertDb(db);return mapDay(db.prepare('SELECT * FROM collector_days WHERE store_id=? AND business_date=?').get(storeId,businessDate));
}

function insertTarget(db,storeId,date,nowIso){
  db.prepare(`INSERT OR IGNORE INTO collector_days(store_id,business_date,state,updated_at)
    VALUES(?,?,'pending',?)`).run(storeId,date,nowIso);
}

export function ensureCollectorTargets(db,{now=new Date(),historyBackfill=false}={}){
  assertDb(db);const {today,hour}=jstParts(now),yesterday=dateShift(today,-1),nowIso=now.toISOString();
  const stores=db.prepare('SELECT * FROM collector_stores WHERE enabled=1 ORDER BY store_id').all();
  let inserted=0;
  tx(db,()=>{
    for(const store of stores){
      if(historyBackfill){
        for(let d=assertDate(store.history_start,'history_start');d<=yesterday;d=dateShift(d,1)){
          const r=db.prepare(`INSERT OR IGNORE INTO collector_days(store_id,business_date,state,updated_at) VALUES(?,?,'pending',?)`).run(store.store_id,d,nowIso);inserted+=r.changes;
        }
      }else if(hour>=4){
        const r=db.prepare(`INSERT OR IGNORE INTO collector_days(store_id,business_date,state,updated_at) VALUES(?,?,'pending',?)`).run(store.store_id,yesterday,nowIso);inserted+=r.changes;
      }
    }
  });
  return inserted;
}

export function recoverExpiredCollectorRuns(db,{nowIso}){
  assertDb(db);nowIso=assertIso(nowIso,'nowIso');
  const r=db.prepare(`UPDATE collector_days SET state='pending',run_owner=NULL,started_at=NULL,lease_expires_at=NULL,
    retry_after=NULL,last_error_class='stale_recovery',last_error_message='expired collector lease recovered',updated_at=?
    WHERE state='running' AND lease_expires_at IS NOT NULL AND lease_expires_at<=?`).run(nowIso,nowIso);
  return r.changes;
}

export function peekEligibleCollectorDay(db,{nowIso,todayJst}){
  assertDb(db);nowIso=assertIso(nowIso,'nowIso');todayJst=assertDate(todayJst,'todayJst');
  const r=db.prepare(`SELECT d.*,s.slug,s.name FROM collector_days d
    JOIN collector_stores s ON s.store_id=d.store_id
    WHERE d.state='pending' AND s.enabled=1 AND d.business_date<?
      AND (d.retry_after IS NULL OR d.retry_after<=?)
    ORDER BY d.business_date DESC,d.store_id ASC LIMIT 1`).get(todayJst,nowIso);
  if(!r)return null;
  return {...mapDay(r),slug:r.slug,name:r.name};
}

export function claimCollectorDay(db,{storeId,businessDate,owner,nowIso,leaseExpiresIso}){
  assertDb(db);storeId=assertText(storeId,'storeId');businessDate=assertDate(businessDate,'businessDate');owner=assertText(owner,'owner');nowIso=assertIso(nowIso,'nowIso');leaseExpiresIso=assertIso(leaseExpiresIso,'leaseExpiresIso');
  const r=db.prepare(`UPDATE collector_days SET state='running',retry_after=NULL,run_owner=?,started_at=?,lease_expires_at=?,
    attempt_count=attempt_count+1,last_attempt_at=?,updated_at=? WHERE store_id=? AND business_date=? AND state='pending'`).run(owner,nowIso,leaseExpiresIso,nowIso,nowIso,storeId,businessDate);
  return r.changes?getCollectorDay(db,storeId,businessDate):null;
}

export function resetCollectorDay(db,{storeId,businessDate,nowIso}){
  assertDb(db);storeId=assertText(storeId,'storeId');businessDate=assertDate(businessDate,'businessDate');nowIso=assertIso(nowIso,'nowIso');
  const r=db.prepare(`UPDATE collector_days SET state='pending',retry_after=NULL,run_owner=NULL,started_at=NULL,lease_expires_at=NULL,
    not_found_count=0,first_not_found_at=NULL,last_http_status=NULL,last_error_class=NULL,last_error_message=NULL,updated_at=?
    WHERE store_id=? AND business_date=? AND state IN ('collected','excluded')`).run(nowIso,storeId,businessDate);
  if(!r.changes)throw new Error(`collector day is not resettable: ${storeId} ${businessDate}`);
  return getCollectorDay(db,storeId,businessDate);
}

export function markCollectorFailure(db,{storeId,businessDate,nowIso,httpStatus=null,errorClass='collector_error',message=''}){
  assertDb(db);storeId=assertText(storeId,'storeId');businessDate=assertDate(businessDate,'businessDate');nowIso=assertIso(nowIso,'nowIso');
  const prev=getCollectorDay(db,storeId,businessDate);if(!prev)throw new Error(`collector day not found: ${storeId} ${businessDate}`);
  const notFound=httpStatus===404||httpStatus===410;
  const count=notFound?prev.notFoundCount+1:prev.notFoundCount;
  const first=notFound?(prev.firstNotFoundAt||nowIso):prev.firstNotFoundAt;
  const oldEnough=notFound&&first&&Date.parse(nowIso)-Date.parse(first)>=NOT_FOUND_WINDOW_MS;
  const state=notFound&&count>=3&&oldEnough?'excluded':'pending';
  const retryAfter=state==='excluded'?null:isoPlus(nowIso,RETRY_MS);
  db.prepare(`UPDATE collector_days SET state=?,retry_after=?,run_owner=NULL,started_at=NULL,lease_expires_at=NULL,
    not_found_count=?,first_not_found_at=?,last_http_status=?,last_error_class=?,last_error_message=?,updated_at=?
    WHERE store_id=? AND business_date=?`).run(state,retryAfter,count,first,httpStatus,errorClass,String(message||'').slice(0,1000),nowIso,storeId,businessDate);
  return getCollectorDay(db,storeId,businessDate);
}

export function markCollectorCollected(db,{storeId,businessDate,nowIso,httpStatus=200,rawArtifactPath=null,rawSha256=null}){
  assertDb(db);storeId=assertText(storeId,'storeId');businessDate=assertDate(businessDate,'businessDate');nowIso=assertIso(nowIso,'nowIso');
  const r=db.prepare(`UPDATE collector_days SET state='collected',retry_after=NULL,run_owner=NULL,started_at=NULL,lease_expires_at=NULL,
    last_success_at=?,last_http_status=?,last_error_class=NULL,last_error_message=NULL,raw_artifact_path=?,raw_sha256=?,updated_at=?
    WHERE store_id=? AND business_date=?`).run(nowIso,httpStatus,rawArtifactPath,rawSha256,nowIso,storeId,businessDate);
  if(!r.changes)throw new Error(`collector day not found: ${storeId} ${businessDate}`);
  return getCollectorDay(db,storeId,businessDate);
}

export function getCollectorControl(db){assertDb(db);return mapControl(db.prepare('SELECT * FROM collector_control WHERE id=1').get())||{globalBlockUntil:null,lastRunStartedAt:null,lastRunEndedAt:null,lastRunResult:null,updatedAt:null};}

export function setGlobalBlock(db,{untilIso,nowIso}){
  assertDb(db);untilIso=assertIso(untilIso,'untilIso');nowIso=assertIso(nowIso,'nowIso');
  db.prepare(`INSERT INTO collector_control(id,global_block_until,updated_at) VALUES(1,?,?)
    ON CONFLICT(id) DO UPDATE SET global_block_until=excluded.global_block_until,updated_at=excluded.updated_at`).run(untilIso,nowIso);
  return getCollectorControl(db);
}

export function setCollectorRunState(db,{startedAt=null,endedAt=null,result=null,nowIso}){
  assertDb(db);nowIso=assertIso(nowIso,'nowIso');
  db.prepare(`INSERT INTO collector_control(id,last_run_started_at,last_run_ended_at,last_run_result,updated_at) VALUES(1,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      last_run_started_at=COALESCE(excluded.last_run_started_at,collector_control.last_run_started_at),
      last_run_ended_at=COALESCE(excluded.last_run_ended_at,collector_control.last_run_ended_at),
      last_run_result=COALESCE(excluded.last_run_result,collector_control.last_run_result),
      updated_at=excluded.updated_at`).run(startedAt,endedAt,result,nowIso);
  return getCollectorControl(db);
}

export function collectorRetryIso(nowIso){return isoPlus(assertIso(nowIso,'nowIso'),RETRY_MS);}
export function collectorJstDate(now=new Date()){return jstParts(now).today;}
