import {canonicalJson,hashCanonical} from '../canonical-json.mjs';
import {enqueueJob} from '../queue.mjs';
import {archiveRawArtifact} from './raw-archive.mjs';

const ANALYSIS_VERSION='vps-runtime-v1';

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

export async function ingestCollectorDay(db,input={}){
  if(!db?.prepare||!db?.exec)throw new TypeError('db is required');
  const rawRoot=requiredText(input.rawRoot,'rawRoot');
  const channelId=requiredText(input.channelId,'channelId');
  const storeId=requiredText(input.sourceStoreId,'sourceStoreId');
  const shop=requiredText(input.shop,'shop');
  const businessDate=isoDate(input.date,'date');
  const nowIso=isoTime(input.nowIso??new Date().toISOString());
  const parserBuild=requiredText(input.parserBuild??input.day?.parserBuild??input.day?.quality?.parserBuild??'unknown','parserBuild');
  const revision=Number.isFinite(+input.revision)?Math.max(0,Math.trunc(+input.revision)):0;
  const day=input.day;
  if(!day||typeof day!=='object'||!Array.isArray(day.machines))throw new TypeError('day.machines is required');
  if(isoDate(day.date,'day.date')!==businessDate)throw new Error('day.date must match date');
  if(typeof input.rawText!=='string'||!input.rawText.trim())throw new TypeError('rawText is required');

  const artifact=await archiveRawArtifact({root:rawRoot,storeId,date:businessDate,rawText:input.rawText});
  const normalizedHash=hashCanonical(day);
  const sourceMetadata=canonicalJson({
    source:'ana-slo-ios-relay',
    collectorChannelId:channelId,
    parserBuild,
    latestRevision:revision
  });
  let changed=false,job;

  db.exec('BEGIN IMMEDIATE');
  try{
    db.prepare(`INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at)
      VALUES(?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        source_metadata_json=excluded.source_metadata_json,
        updated_at=excluded.updated_at`)
      .run(storeId,shop,sourceMetadata,nowIso,nowIso);

    const previous=db.prepare('SELECT normalized_payload_hash FROM store_days WHERE store_id=? AND business_date=?').get(storeId,businessDate);
    changed=!previous||previous.normalized_payload_hash!==normalizedHash;

    db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at)
      VALUES(?,?,?,?,?,'valid',?,?,?)
      ON CONFLICT(store_id,business_date) DO UPDATE SET
        parser_version=excluded.parser_version,
        source_hash=excluded.source_hash,
        normalized_payload_hash=excluded.normalized_payload_hash,
        quality_status=excluded.quality_status,
        raw_artifact_path=excluded.raw_artifact_path,
        updated_at=excluded.updated_at`)
      .run(storeId,businessDate,parserBuild,artifact.sha256,normalizedHash,artifact.path,nowIso,nowIso);

    if(changed){
      db.prepare('DELETE FROM machine_day_data WHERE store_id=? AND business_date=?').run(storeId,businessDate);
      const insert=db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)');
      day.machines.forEach((machine,index)=>insert.run(storeId,businessDate,String(index).padStart(6,'0'),canonicalJson(machine)));
    }

    job=enqueueJob(db,{
      type:'DAILY_ANALYSIS',
      priority:20,
      idempotencyKey:`daily:${storeId}:${businessDate}:${normalizedHash}:${ANALYSIS_VERSION}`,
      payload:{storeId,businessDate,normalizedHash,analysisVersion:ANALYSIS_VERSION},
      sizeClass:'medium',
      estimatedLeaseMiB:512,
      maxAttempts:3,
      createdAtIso:nowIso
    });
    db.exec('COMMIT');
  }catch(error){
    try{db.exec('ROLLBACK')}catch{}
    throw error;
  }

  return {
    changed,
    storeId,
    businessDate,
    normalizedHash,
    rawSha256:artifact.sha256,
    rawArtifactPath:artifact.path,
    machineCount:day.machines.length,
    jobId:job.id
  };
}
