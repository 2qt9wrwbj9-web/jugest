import {createHash} from 'node:crypto';
import {archiveRawArtifact} from '../ingest/raw-archive.mjs';
import {ingestCollectorDay} from '../ingest/canonical-ingest.mjs';

export const PIA_ENDPOINT='https://piagroupapp.com/api/stores/getRankingTop';
export const PIA_COLLECTOR_ID='pia-public:35';
export const PIA_SOURCE_STORE_ID='pia:35';
export const PIA_STORE_NAME='PIA大船1';
export const PIA_PARSER_BUILD='pia-rankingtop-v1';

const MACHINE_ALIASES=[
  ['my','マイジャグラーV',['マイジャグラーV','マイジャグラー5','マイジャグV','マイジャグ5']],
  ['im','ネオアイムジャグラーEX',['ネオアイムジャグラーEX','ネオアイムジャグラー','ネオアイム']],
  ['go','ゴーゴージャグラー3',['ゴーゴージャグラー3','ゴーゴージャグラーIII','ゴージャグ3','ゴージャグIII']],
  ['fk','ファンキージャグラー2',['ファンキージャグラー2','ファンキージャグラーII','ファンキー2','ファンキーII']],
  ['hp','ハッピージャグラーVⅢ',['ハッピージャグラーVIII','ハッピージャグラーV3','ハッピーVIII','ハッピーV3']],
  ['gg','ジャグラーガールズSS',['ジャグラーガールズSS','ジャグラーガールズ','ガールズSS']],
  ['mr','ミスタージャグラー',['ミスタージャグラー','ミスター']],
  ['um','ウルトラミラクルジャグラー',['ウルトラミラクルジャグラー','ウルトラミラクル','ウルミラ']]
];

function machineToken(value=''){
  let text=String(value);
  try{text=text.normalize('NFKC')}catch{}
  return text.toUpperCase().replace(/\s+/g,'').replace(/[‐‑‒–—―]/g,'-').replace(/[・･]/g,'');
}
const ALIAS_TOKENS=MACHINE_ALIASES.map(([key,label,aliases])=>[key,label,aliases.map(machineToken)]);

function finite(value){const n=Number(value);return Number.isFinite(n)?n:null}
function validDate(value){
  const text=String(value??'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;
  const d=new Date(`${text}T00:00:00Z`);
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===text?text:null;
}
function previousDate(date){
  const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);
}
function dayDistance(from,to){return Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000)}
function sha256(text){return createHash('sha256').update(text,'utf8').digest('hex')}

function machineIdentity(name){
  const token=machineToken(name);
  for(const [key,label,aliases] of ALIAS_TOKENS)if(aliases.some(alias=>token.includes(alias)))return {key,label};
  return null;
}
export function isPiaJuggler(row){return machineToken(row?.name).includes('ジャグラー')}

const SIGNATURE_FIELDS=['store_id','machine_no','name','sis_machine_code','special','start','final_start','special_1','special_2','special_2d','special_out','special_safe','out','safe','difference'];
export function piaRowSignature(row){return JSON.stringify(SIGNATURE_FIELDS.map(key=>row?.[key]??null))}

export function normalizePiaJugglerRow(row){
  const identity=machineIdentity(row?.name);
  if(!identity)return null;
  const out=finite(row?.out),specialOut=finite(row?.special_out),bb=finite(row?.special_1),rb=finite(row?.special_2d),diff=finite(row?.difference);
  const tableNo=String(row?.machine_no??'').trim();
  if(!tableNo||out===null||specialOut===null||bb===null||rb===null||diff===null)return null;
  const games=Math.round((out-specialOut)/3);
  if(games<0||bb<0||rb<0)return null;
  return {
    machine:identity.key,category:'juggler',sourceMachineName:identity.label,
    sourceRawMachineName:String(row?.name??''),sourceMachineCode:String(row?.sis_machine_code??''),
    sourceStoreMachineId:String(row?.store_machine_id??''),tableNo,games,bb,rb,diff,
    gamesSource:'observed',diffSource:'observed'
  };
}

export function validatePiaSnapshot(data,{minMachineCount=80}={}){
  if(!data||data.status!==0||!Array.isArray(data.ranking))throw new Error('PIA RankingTop returned an invalid payload');
  const snapshotDate=validDate(data?.server_date_time?.date);
  if(!snapshotDate)throw new Error('PIA RankingTop did not include a valid server date');
  const counts=new Map();
  for(const row of data.ranking){
    if(Number(row?.store_id)!==35)throw new Error('PIA RankingTop mixed an unexpected store');
    const no=String(row?.machine_no??'');if(!no)throw new Error('PIA RankingTop row is missing machine_no');
    counts.set(no,(counts.get(no)||0)+1);
  }
  if(counts.size<minMachineCount)throw new Error(`PIA RankingTop machine count too small: ${counts.size}`);
  const irregular=[...counts].filter(([,count])=>count!==30);
  if(irregular.length)throw new Error(`PIA RankingTop is not a 30-row rolling history for ${irregular.length} machine(s)`);
  return {snapshotDate,snapshotTime:String(data?.server_date_time?.time??''),rowCount:data.ranking.length,machineCount:counts.size};
}

export async function fetchPiaPublicSnapshot({fetchImpl=fetch,minMachineCount=80}={}){
  const body=new URLSearchParams({machine_type:'S',store_id:'35',limit:'5000'});
  const response=await fetchImpl(PIA_ENDPOINT,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body,signal:AbortSignal.timeout(20000)});
  if(!response?.ok)throw new Error(`PIA RankingTop HTTP ${response?.status??'error'}`);
  const rawText=await response.text();
  let data;try{data=JSON.parse(rawText)}catch{throw new Error('PIA RankingTop returned non-JSON data')}
  const meta=validatePiaSnapshot(data,{minMachineCount});
  return {...meta,data,rawText,snapshotHash:sha256(rawText)};
}

function groupRows(snapshot){
  const map=new Map();
  for(const row of snapshot?.ranking??[]){
    if(!isPiaJuggler(row))continue;
    const no=String(row.machine_no);
    if(!map.has(no))map.set(no,[]);map.get(no).push(row);
  }
  return map;
}
function addedRows(previousRows,currentRows){
  const counts=new Map();
  for(const row of previousRows)counts.set(piaRowSignature(row),(counts.get(piaRowSignature(row))||0)+1);
  const out=[];
  for(const row of currentRows){
    const sig=piaRowSignature(row),n=counts.get(sig)||0;
    if(n>0)counts.set(sig,n-1);else out.push(row);
  }
  return out;
}

export function derivePiaBusinessDay(previousSnapshot,currentSnapshot,currentDate,{minComparable=20}={}){
  const previous=groupRows(previousSnapshot),current=groupRows(currentSnapshot);
  let comparable=0,oneAdd=0,multiAdd=0,zeroAdd=0,newMachines=0,unsupported=0;
  const machines=[];
  for(const [no,rows] of current){
    const prior=previous.get(no);
    if(!prior){newMachines++;continue}
    comparable++;
    const added=addedRows(prior,rows);
    if(added.length===0){zeroAdd++;continue}
    if(added.length!==1){multiAdd++;continue}
    oneAdd++;
    const normalized=normalizePiaJugglerRow(added[0]);
    if(!normalized){unsupported++;continue}
    machines.push(normalized);
  }
  machines.sort((a,b)=>Number(a.tableNo)-Number(b.tableNo)||a.tableNo.localeCompare(b.tableNo));
  const oneAddCoverage=comparable?oneAdd/comparable:0,normalizedCoverage=comparable?machines.length/comparable:0;
  const ready=comparable>=minComparable&&oneAddCoverage>=0.95&&normalizedCoverage>=0.90&&(multiAdd/comparable)<=0.05;
  const businessDate=previousDate(currentDate);
  const warnings=[];
  if(zeroAdd)warnings.push(`同一履歴で差分不能${zeroAdd}台`);
  if(multiAdd)warnings.push(`複数差分${multiAdd}台`);
  if(newMachines)warnings.push(`新規台${newMachines}台`);
  if(unsupported)warnings.push(`未対応機種${unsupported}台`);
  return {
    ready,businessDate,machines,
    diagnostics:{comparable,oneAdd,multiAdd,zeroAdd,newMachines,unsupported,oneAddCoverage,normalizedCoverage},
    day:{
      date:businessDate,source:'pia-public',sourceUrl:PIA_ENDPOINT,parserBuild:PIA_PARSER_BUILD,
      machines,quality:{score:Math.round(normalizedCoverage*100),grade:normalizedCoverage>=0.98?'A':normalizedCoverage>=0.95?'B':'C',warnings,totalMachines:machines.length,parserBuild:PIA_PARSER_BUILD}
    }
  };
}

function readState(db,collectorId=PIA_COLLECTOR_ID){return db.prepare('SELECT * FROM source_collector_state WHERE collector_id=?').get(collectorId)??null}
function writeState(db,patch){
  const prior=readState(db,patch.collector_id)??{};
  const row={
    collector_id:patch.collector_id,source_store_id:patch.source_store_id??prior.source_store_id??PIA_SOURCE_STORE_ID,
    last_snapshot_date:patch.last_snapshot_date??prior.last_snapshot_date??null,last_snapshot_hash:patch.last_snapshot_hash??prior.last_snapshot_hash??null,
    last_snapshot_json:patch.last_snapshot_json??prior.last_snapshot_json??null,last_result:patch.last_result??prior.last_result??null,
    last_ingested_date:patch.last_ingested_date??prior.last_ingested_date??null,last_attempt_at:patch.last_attempt_at??prior.last_attempt_at??null,
    last_success_at:patch.last_success_at??prior.last_success_at??null,last_error:Object.hasOwn(patch,'last_error')?patch.last_error:(prior.last_error??null),
    updated_at:patch.updated_at
  };
  db.prepare(`INSERT INTO source_collector_state(collector_id,source_store_id,last_snapshot_date,last_snapshot_hash,last_snapshot_json,last_result,last_ingested_date,last_attempt_at,last_success_at,last_error,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(collector_id) DO UPDATE SET source_store_id=excluded.source_store_id,last_snapshot_date=excluded.last_snapshot_date,last_snapshot_hash=excluded.last_snapshot_hash,last_snapshot_json=excluded.last_snapshot_json,last_result=excluded.last_result,last_ingested_date=excluded.last_ingested_date,last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,last_error=excluded.last_error,updated_at=excluded.updated_at`)
    .run(row.collector_id,row.source_store_id,row.last_snapshot_date,row.last_snapshot_hash,row.last_snapshot_json,row.last_result,row.last_ingested_date,row.last_attempt_at,row.last_success_at,row.last_error,row.updated_at);
  return row;
}

export async function collectPiaPublicOnce(db,{rawRoot,fetchImpl=fetch,nowIso=new Date().toISOString(),minMachineCount=80}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  if(typeof rawRoot!=='string'||!rawRoot.trim())throw new TypeError('rawRoot is required');
  const prior=readState(db);
  let snapshot;
  try{snapshot=await fetchPiaPublicSnapshot({fetchImpl,minMachineCount})}
  catch(error){
    writeState(db,{collector_id:PIA_COLLECTOR_ID,source_store_id:PIA_SOURCE_STORE_ID,last_attempt_at:nowIso,last_result:'fetch_error',last_error:String(error?.message??error),updated_at:nowIso});
    throw error;
  }
  await archiveRawArtifact({root:rawRoot,storeId:`${PIA_SOURCE_STORE_ID}:snapshot`,date:snapshot.snapshotDate,rawText:snapshot.rawText});
  if(!prior?.last_snapshot_json){
    writeState(db,{collector_id:PIA_COLLECTOR_ID,source_store_id:PIA_SOURCE_STORE_ID,last_snapshot_date:snapshot.snapshotDate,last_snapshot_hash:snapshot.snapshotHash,last_snapshot_json:snapshot.rawText,last_result:'seeded',last_attempt_at:nowIso,last_success_at:nowIso,last_error:null,updated_at:nowIso});
    return {status:'seeded',snapshotDate:snapshot.snapshotDate,rowCount:snapshot.rowCount,machineCount:snapshot.machineCount};
  }
  if(snapshot.snapshotDate===prior.last_snapshot_date){
    // The source date can lag behind JST midnight; honor the retry cooldown.
    writeState(db,{collector_id:PIA_COLLECTOR_ID,last_attempt_at:nowIso,last_result:'already_collected',last_error:null,updated_at:nowIso});
    return {status:'already_collected',snapshotDate:snapshot.snapshotDate};
  }
  const gap=dayDistance(prior.last_snapshot_date,snapshot.snapshotDate);
  if(gap<=0)throw new Error(`PIA snapshot date moved backwards: ${prior.last_snapshot_date} -> ${snapshot.snapshotDate}`);
  if(gap>1){
    writeState(db,{collector_id:PIA_COLLECTOR_ID,last_snapshot_date:snapshot.snapshotDate,last_snapshot_hash:snapshot.snapshotHash,last_snapshot_json:snapshot.rawText,last_result:'gap_seeded',last_attempt_at:nowIso,last_success_at:nowIso,last_error:`snapshot gap ${gap} days; dates were not inferred`,updated_at:nowIso});
    return {status:'gap_seeded',snapshotDate:snapshot.snapshotDate,gapDays:gap};
  }
  const previousSnapshot=JSON.parse(prior.last_snapshot_json);
  const derived=derivePiaBusinessDay(previousSnapshot,snapshot.data,snapshot.snapshotDate,{minComparable:Math.min(20,minMachineCount)});
  if(!derived.ready){
    writeState(db,{collector_id:PIA_COLLECTOR_ID,last_attempt_at:nowIso,last_result:'not_ready',last_error:`PIA rolling history not ready: ${JSON.stringify(derived.diagnostics)}`,updated_at:nowIso});
    return {status:'not_ready',snapshotDate:snapshot.snapshotDate,...derived.diagnostics};
  }
  const ingest=await ingestCollectorDay(db,{
    rawRoot,source:'pia-public-ranking-top',sourceStoreId:PIA_SOURCE_STORE_ID,shop:PIA_STORE_NAME,date:derived.businessDate,
    parserBuild:PIA_PARSER_BUILD,revision:1,day:derived.day,rawText:snapshot.rawText,nowIso,
    sourceMetadata:{visibility:'public',publicStoreId:35,endpoint:PIA_ENDPOINT,snapshotDate:snapshot.snapshotDate,historyWindowDays:30}
  });
  writeState(db,{collector_id:PIA_COLLECTOR_ID,last_snapshot_date:snapshot.snapshotDate,last_snapshot_hash:snapshot.snapshotHash,last_snapshot_json:snapshot.rawText,last_result:'ingested',last_ingested_date:derived.businessDate,last_attempt_at:nowIso,last_success_at:nowIso,last_error:null,updated_at:nowIso});
  return {status:'ingested',snapshotDate:snapshot.snapshotDate,businessDate:derived.businessDate,machineCount:derived.machines.length,diagnostics:derived.diagnostics,ingest};
}

export const __test={machineToken,machineIdentity,addedRows,groupRows,previousDate,dayDistance,readState,writeState};
