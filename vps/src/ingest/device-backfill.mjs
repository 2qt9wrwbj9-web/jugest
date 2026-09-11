import {canonicalJson,hashCanonical} from '../canonical-json.mjs';
import {requestStoreAnalysisRefresh} from '../analysis/refresh-state.mjs';
import {archiveRawArtifact} from './raw-archive.mjs';

const ANALYSIS_VERSION='vps-runtime-v1';
const PARSER_VERSION='device-indexeddb-backfill-v1';

function requiredText(value,name){
  const text=String(value??'').trim();
  if(!text)throw new TypeError(`${name} is required`);
  return text;
}

function isoDate(value,name='date'){
  const text=requiredText(value,name);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))throw new TypeError(`${name} must be YYYY-MM-DD`);
  const parsed=new Date(`${text}T00:00:00Z`);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==text)throw new TypeError(`${name} must be a real date`);
  return text;
}

function isoTime(value){
  const text=requiredText(value,'nowIso');
  if(!Number.isFinite(Date.parse(text)))throw new TypeError('nowIso must be ISO date-time');
  return text;
}

export async function ingestDeviceBackfillDay(db,input={}){
  if(!db?.prepare||!db?.exec)throw new TypeError('db is required');
  const rawRoot=requiredText(input.rawRoot,'rawRoot');
  const channelId=requiredText(input.channelId,'channelId');
  const storeId=requiredText(input.sourceStoreId,'sourceStoreId');
  const shop=requiredText(input.shop,'shop');
  const businessDate=isoDate(input.date,'date');
  const nowIso=isoTime(input.nowIso??new Date().toISOString());
  const day=input.day;
  if(!day||typeof day!=='object'||!Array.isArray(day.machines)||!day.machines.length)throw new TypeError('day.machines is required');
  if(isoDate(day.date,'day.date')!==businessDate)throw new Error('day.date must match date');

  const normalizedHash=hashCanonical(day);
  const previous=db.prepare('SELECT normalized_payload_hash,parser_version,raw_artifact_path FROM store_days WHERE store_id=? AND business_date=?').get(storeId,businessDate);
  if(previous){
    const duplicate=previous.normalized_payload_hash===normalizedHash;
    return {
      inserted:false,
      duplicate,
      conflict:!duplicate,
      storeId,
      businessDate,
      normalizedHash,
      machineCount:day.machines.length,
      rawArtifactPath:previous.raw_artifact_path??null,
      jobId:null
    };
  }

  const archivePayload=canonicalJson({
    provenance:PARSER_VERSION,
    collectorChannelId:channelId,
    shop,
    exportedAt:nowIso,
    day
  });
  const artifact=await archiveRawArtifact({root:rawRoot,storeId,date:businessDate,rawText:archivePayload});
  const sourceMetadata=canonicalJson({source:PARSER_VERSION,collectorChannelId:channelId});
  let job=null;

  db.exec('BEGIN IMMEDIATE');
  try{
    const race=db.prepare('SELECT normalized_payload_hash,raw_artifact_path FROM store_days WHERE store_id=? AND business_date=?').get(storeId,businessDate);
    if(race){
      db.exec('COMMIT');
      const duplicate=race.normalized_payload_hash===normalizedHash;
      return {
        inserted:false,duplicate,conflict:!duplicate,storeId,businessDate,normalizedHash,
        machineCount:day.machines.length,rawArtifactPath:race.raw_artifact_path??null,jobId:null
      };
    }

    db.prepare(`INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at)
      VALUES(?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        updated_at=excluded.updated_at`)
      .run(storeId,shop,sourceMetadata,nowIso,nowIso);

    db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at)
      VALUES(?,?,?,?,?,'valid',?,?,?)`)
      .run(storeId,businessDate,PARSER_VERSION,artifact.sha256,normalizedHash,artifact.path,nowIso,nowIso);

    const insert=db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)');
    day.machines.forEach((machine,index)=>insert.run(storeId,businessDate,String(index).padStart(6,'0'),canonicalJson(machine)));

    const refresh=requestStoreAnalysisRefresh(db,{storeId,analysisVersion:ANALYSIS_VERSION,nowIso,dirty:true});
    job=refresh.job;
    db.exec('COMMIT');
  }catch(error){
    try{db.exec('ROLLBACK')}catch{}
    throw error;
  }

  return {
    inserted:true,
    duplicate:false,
    conflict:false,
    storeId,
    businessDate,
    normalizedHash,
    rawSha256:artifact.sha256,
    rawArtifactPath:artifact.path,
    machineCount:day.machines.length,
    jobId:job?.id??null
  };
}

export const __test={PARSER_VERSION};
