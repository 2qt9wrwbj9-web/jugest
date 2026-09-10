import {createHash} from 'node:crypto';
import {PARSER_VERSION} from './ana-parser.mjs';

function assertText(value,name){if(typeof value!=='string'||!value.trim())throw new TypeError(`${name} is required`);return value.trim();}
function assertIso(value){const s=assertText(value,'nowIso');if(!Number.isFinite(Date.parse(s)))throw new TypeError('nowIso must be ISO date-time');return s;}
function assertDate(value){const s=assertText(value,'business date');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new TypeError('business date must be YYYY-MM-DD');return s;}

function canonicalValue(value,path='$'){
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'){
    if(!Number.isFinite(value))throw new TypeError(`non-finite number is unsupported at ${path}`);
    return value;
  }
  if(Array.isArray(value))return value.map((item,index)=>canonicalValue(item,`${path}[${index}]`));
  if(typeof value==='object'){
    const out={};
    for(const key of Object.keys(value).sort()){
      const item=value[key];
      if(item===undefined||typeof item==='function'||typeof item==='symbol'||typeof item==='bigint')throw new TypeError(`unsupported value at ${path}.${key}`);
      out[key]=canonicalValue(item,`${path}.${key}`);
    }
    return out;
  }
  throw new TypeError(`unsupported value at ${path}`);
}

export function canonicalJson(value){return JSON.stringify(canonicalValue(value));}
export function hashCanonical(value){return createHash('sha256').update(canonicalJson(value),'utf8').digest('hex');}

export function persistCollectedDay(db,{store,day,rawArtifact,nowIso,beforeCommit}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  if(!store||typeof store!=='object')throw new TypeError('store is required');
  if(!day||typeof day!=='object'||!Array.isArray(day.machines))throw new TypeError('day.machines is required');
  if(!rawArtifact||typeof rawArtifact!=='object')throw new TypeError('rawArtifact is required');
  const storeId=assertText(store.storeId,'store.storeId');
  const storeName=assertText(store.name,'store.name');
  const slug=assertText(store.slug,'store.slug');
  const businessDate=assertDate(day.date);
  const rawPath=assertText(rawArtifact.path,'rawArtifact.path');
  const rawSha=assertText(rawArtifact.sha256,'rawArtifact.sha256');
  nowIso=assertIso(nowIso);
  const normalizedHash=hashCanonical(day);
  const sourceMetadata=canonicalJson({source:'ana-slo-vps-native',slug});

  db.exec('BEGIN IMMEDIATE');
  try{
    db.prepare(`INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at)
      VALUES(?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,source_metadata_json=excluded.source_metadata_json,updated_at=excluded.updated_at`)
      .run(storeId,storeName,sourceMetadata,nowIso,nowIso);

    db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at)
      VALUES(?,?,?,?,?,'valid',?,?,?)
      ON CONFLICT(store_id,business_date) DO UPDATE SET
        parser_version=excluded.parser_version,
        source_hash=excluded.source_hash,
        normalized_payload_hash=excluded.normalized_payload_hash,
        quality_status=excluded.quality_status,
        raw_artifact_path=excluded.raw_artifact_path,
        updated_at=excluded.updated_at`)
      .run(storeId,businessDate,String(PARSER_VERSION),rawSha,normalizedHash,rawPath,nowIso,nowIso);

    db.prepare('DELETE FROM machine_day_data WHERE store_id=? AND business_date=?').run(storeId,businessDate);
    const insertMachine=db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)');
    day.machines.forEach((machine,index)=>insertMachine.run(storeId,businessDate,String(index).padStart(6,'0'),canonicalJson(machine)));

    const changed=db.prepare(`UPDATE collector_days SET state='collected',retry_after=NULL,run_owner=NULL,started_at=NULL,lease_expires_at=NULL,
      last_success_at=?,last_http_status=200,last_error_class=NULL,last_error_message=NULL,raw_artifact_path=?,raw_sha256=?,updated_at=?
      WHERE store_id=? AND business_date=? AND state IN ('running','pending')`)
      .run(nowIso,rawPath,rawSha,nowIso,storeId,businessDate);
    if(!changed.changes)throw new Error(`collector day cannot be marked collected: ${storeId} ${businessDate}`);

    if(beforeCommit!==undefined){if(typeof beforeCommit!=='function')throw new TypeError('beforeCommit must be a function');beforeCommit();}
    db.exec('COMMIT');
    return {storeId,businessDate,normalizedHash,rawSha256:rawSha,rawArtifactPath:rawPath,machineCount:day.machines.length};
  }catch(error){
    try{db.exec('ROLLBACK')}catch{}
    throw error;
  }
}
