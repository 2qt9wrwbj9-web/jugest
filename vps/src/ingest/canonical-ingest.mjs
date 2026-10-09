import {canonicalJson,hashCanonical} from '../canonical-json.mjs';
import {requestStoreAnalysisRefresh} from '../analysis/refresh-state.mjs';
import {requestPredictionEvaluation} from '../analysis/prediction-refresh-state.mjs';
import {archiveRawArtifact} from './raw-archive.mjs';
import {inspectDay,saveDayIntegrity,saveIngestReceipt,readDayIntegrity,integrityFingerprint,machineIdentity,numericValue} from './day-integrity.mjs';

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
  const source=requiredText(input.source??'ana-slo-ios-relay','source');
  const channelId=String(input.channelId??'').trim();
  if(source==='ana-slo-ios-relay'&&!channelId)throw new TypeError('channelId is required');
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
  const extraMetadata=input.sourceMetadata&&typeof input.sourceMetadata==='object'&&!Array.isArray(input.sourceMetadata)?input.sourceMetadata:{};
  const sourceMetadata=canonicalJson({
    ...extraMetadata,
    source,
    ...(channelId?{collectorChannelId:channelId}:{}),
    parserBuild,
    latestRevision:revision
  });
  let changed=false,verificationChanged=false,sourceChanged=false,job=null,check=null,accepted=true;

  db.exec('BEGIN IMMEDIATE');
  try{
    db.prepare(`INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at)
      VALUES(?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        source_metadata_json=excluded.source_metadata_json,
        updated_at=excluded.updated_at`)
      .run(storeId,shop,sourceMetadata,nowIso,nowIso);

    const previous=db.prepare('SELECT normalized_payload_hash,source_hash,quality_status FROM store_days WHERE store_id=? AND business_date=?').get(storeId,businessDate);
    check=inspectDay(db,{storeId,date:businessDate,day,nowIso,expectedMachineKeys:input.expectedMachineKeys});
    const previousCheck=previous?readDayIntegrity(db,{storeId,date:businessDate}):null;
    // A failed/partial observation must not replace a known usable publication.
    const oldMachines=previous?db.prepare('SELECT payload_json FROM machine_day_data WHERE store_id=? AND business_date=?').all(storeId,businessDate).map(row=>JSON.parse(row.payload_json)):[];
    const incoming=new Map(day.machines.map(row=>[machineIdentity(row).key,row]));
    const lostObservedField=oldMachines.some(row=>{
      const identity=machineIdentity(row),next=incoming.get(identity.key);
      const sameMachine=next&&((row.machine&&next.machine&&String(row.machine)===String(next.machine))||machineIdentity(next).name===identity.name);
      return sameMachine&&['games','bb','rb','diff'].some(field=>numericValue(row[field])!==null&&numericValue(next[field])===null);
    });
    const explicitRoster=Array.isArray(input.expectedMachineKeys??day.quality?.expectedMachineKeys??day.expectedMachineKeys);
    const lostUnconfirmedMachine=!explicitRoster&&oldMachines.some(row=>!incoming.has(machineIdentity(row).key));
    accepted=!(previous?.quality_status==='valid'&&(!check.eligibleForAnalysis||(previousCheck?.status==='complete'&&check.status!=='complete')||lostObservedField||lostUnconfirmedMachine));
    saveIngestReceipt(db,{storeId,date:businessDate,normalizedHash,source,rawArtifactPath:artifact.path,accepted,check,nowIso});
    if(!accepted){
      db.exec('COMMIT');
      return {accepted:false,changed:false,storeId,businessDate,normalizedHash,rawSha256:artifact.sha256,rawArtifactPath:artifact.path,machineCount:day.machines.length,jobId:null,integrity:check};
    }
    changed=!previous||previous.normalized_payload_hash!==normalizedHash;
    verificationChanged=integrityFingerprint(previousCheck)!==integrityFingerprint(check);
    sourceChanged=previous?.source_hash!==artifact.sha256;
    const qualityStatus=check.eligibleForAnalysis?'valid':check.status==='invalid'?'invalid':check.status==='provisional'||check.status==='unpublished'?'pending':'partial';

    db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(store_id,business_date) DO UPDATE SET
        parser_version=excluded.parser_version,
        source_hash=excluded.source_hash,
        normalized_payload_hash=excluded.normalized_payload_hash,
        quality_status=excluded.quality_status,
        raw_artifact_path=excluded.raw_artifact_path,
        updated_at=excluded.updated_at`)
      .run(storeId,businessDate,parserBuild,artifact.sha256,normalizedHash,qualityStatus,artifact.path,nowIso,nowIso);

    if(changed){
      db.prepare('DELETE FROM machine_day_data WHERE store_id=? AND business_date=?').run(storeId,businessDate);
      const insert=db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)');
      day.machines.forEach((machine,index)=>insert.run(storeId,businessDate,String(index).padStart(6,'0'),canonicalJson(machine)));
    }
    const storedCount=Number(db.prepare('SELECT COUNT(*) n FROM machine_day_data WHERE store_id=? AND business_date=?').get(storeId,businessDate)?.n??0);
    if(storedCount!==day.machines.length)throw new Error('canonical saved machine count does not match received rows');
    saveDayIntegrity(db,{storeId,date:businessDate,normalizedHash,check,nowIso});

    const refresh=check.eligibleForAnalysis?requestStoreAnalysisRefresh(db,{
      storeId,
      analysisVersion:ANALYSIS_VERSION,
      nowIso,
      dirty:changed||verificationChanged||sourceChanged
    }):{job:null};
    job=refresh.job;
    requestPredictionEvaluation(db,{storeId,nowIso,dirty:changed||verificationChanged||sourceChanged});
    db.exec('COMMIT');
  }catch(error){
    try{db.exec('ROLLBACK')}catch{}
    throw error;
  }

  return {
    accepted,
    integrity:check,
    changed,
    verificationChanged,
    sourceChanged,
    storeId,
    businessDate,
    normalizedHash,
    rawSha256:artifact.sha256,
    rawArtifactPath:artifact.path,
    machineCount:day.machines.length,
    jobId:job?.id??null
  };
}
