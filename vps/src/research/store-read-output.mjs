import {canonicalJson,hashCanonical} from '../canonical-json.mjs';
import {buildLivePredictionRows} from './backtest.mjs';
import {scoreSample} from './model-search.mjs';

export const STORE_READ_SNAPSHOT_TYPE='store-read-active';
export const STORE_READ_VERSION='store-read-v1';

function required(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function validDate(value,name){const text=required(value,name);if(!/^\d{4}-\d{2}-\d{2}$/.test(text))throw new TypeError(`${name} must be YYYY-MM-DD`);return text}
function nextDate(date){const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
function safeJson(text,fallback=null){try{return JSON.parse(text)}catch{return fallback}}

export function getActiveStoreModel(db,{storeId}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=required(storeId,'storeId');
  const row=db.prepare('SELECT * FROM active_store_models WHERE store_id=?').get(id);
  if(!row)return null;
  return Object.freeze({
    storeId:id,
    fingerprint:row.fingerprint,
    model:safeJson(row.model_json,{}),
    featureVersion:row.feature_version,
    sourceFrontierDate:row.source_frontier_date,
    holdoutScore:row.holdout_score==null?null:Number(row.holdout_score),
    activatedAt:row.activated_at,
    updatedAt:row.updated_at
  });
}

export function persistStoreReadSnapshot(db,{storeId,modelFingerprint,model,featureVersion,frontierDate,days,holdoutScore=null,nowIso=new Date().toISOString()}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=required(storeId,'storeId'),fingerprint=required(modelFingerprint,'modelFingerprint'),version=required(featureVersion,'featureVersion'),frontier=validDate(frontierDate,'frontierDate'),at=required(nowIso,'nowIso');
  const targetDate=nextDate(frontier);
  const rows=buildLivePredictionRows({storeId:id,days,targetDate});
  const rankings=rows.map(row=>({
    machineKey:row.machineKey,
    tableNo:row.tableNo,
    machineName:row.machineName,
    score:scoreSample(row,model)
  })).sort((a,b)=>b.score-a.score||String(a.machineKey).localeCompare(String(b.machineKey))).map((row,index)=>Object.freeze({...row,rank:index+1}));
  const payload=Object.freeze({
    status:rankings.length?'ready':'insufficient_data',
    storeId:id,
    modelFingerprint:fingerprint,
    featureVersion:version,
    asOfDate:frontier,
    targetDate,
    machineCount:rankings.length,
    holdoutScore:holdoutScore==null?null:Number(holdoutScore),
    rankings:Object.freeze(rankings)
  });
  const payloadJson=canonicalJson(payload),payloadHash=hashCanonical(payload);
  db.prepare(`INSERT INTO client_snapshots(store_id,snapshot_type,version,business_date,payload_json,payload_hash,updated_at)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(store_id,snapshot_type,version) DO UPDATE SET
      business_date=excluded.business_date,payload_json=excluded.payload_json,payload_hash=excluded.payload_hash,updated_at=excluded.updated_at`)
    .run(id,STORE_READ_SNAPSHOT_TYPE,STORE_READ_VERSION,targetDate,payloadJson,payloadHash,at);
  return Object.freeze({payload,payloadHash,targetDate});
}

export function activateStoreModel(db,{storeId,fingerprint,model,featureVersion,frontierDate,days,holdoutScore=null,nowIso=new Date().toISOString()}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=required(storeId,'storeId'),fp=required(fingerprint,'fingerprint'),version=required(featureVersion,'featureVersion'),frontier=validDate(frontierDate,'frontierDate'),at=required(nowIso,'nowIso');
  db.prepare(`INSERT INTO active_store_models(store_id,fingerprint,model_json,feature_version,source_frontier_date,holdout_score,activated_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(store_id) DO UPDATE SET
      fingerprint=excluded.fingerprint,model_json=excluded.model_json,feature_version=excluded.feature_version,
      source_frontier_date=excluded.source_frontier_date,holdout_score=excluded.holdout_score,
      activated_at=excluded.activated_at,updated_at=excluded.updated_at`)
    .run(id,fp,canonicalJson(model),version,frontier,holdoutScore==null?null:Number(holdoutScore),at,at);
  const snapshot=persistStoreReadSnapshot(db,{storeId:id,modelFingerprint:fp,model,featureVersion:version,frontierDate:frontier,days,holdoutScore,nowIso:at});
  return Object.freeze({active:getActiveStoreModel(db,{storeId:id}),snapshot});
}

export function refreshActiveStoreReadSnapshot(db,{storeId,days,frontierDate,nowIso=new Date().toISOString()}={}){
  const active=getActiveStoreModel(db,{storeId});
  if(!active)return null;
  return persistStoreReadSnapshot(db,{storeId:active.storeId,modelFingerprint:active.fingerprint,model:active.model,featureVersion:active.featureVersion,frontierDate,days,holdoutScore:active.holdoutScore,nowIso});
}

export const __test={nextDate,safeJson};
