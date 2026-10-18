import {DatabaseSync} from 'node:sqlite';
import {hashCanonical} from '../canonical-json.mjs';
import {ALLOCATION_MACHINE_KEYS,readAllocationRawArtifact,readAllocationPiaSeed,verifyAllocationProvenance} from './provenance.mjs';
import '../../../machine-names.js';

const keys=new Set(ALLOCATION_MACHINE_KEYS),names=globalThis.JugestMachineNames;
const unique=xs=>[...new Set(xs)];
const emptyInput=()=>({games:null,bb:null,rb:null,diff:null});
const strictNumber=n=>typeof n==='number'&&Number.isFinite(n)?n:null;
const text=v=>typeof v==='string'?v.trim():typeof v==='number'&&Number.isFinite(v)?String(v):'';
const parseJson=v=>{try{return JSON.parse(v)}catch{return null}};
function exactDate(date){const d=new Date(`${date}T00:00:00Z`);if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(+d)||d.toISOString().slice(0,10)!==date)throw new TypeError('date must be a real YYYY-MM-DD date');return date;}
function priorDate(date){const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
function failure(code,store,date){return {ok:false,code,store,date,snapshot:null,roster:{status:'unverified',complete:false,rows:[],reasons:[code]},groups:[],unsupported:[],quality:{status:'held',reasons:[code]}};}

// Synchronous canonical capture precedes all awaited archive I/O. Immutable raw
// files are checked against headers captured by this same read transaction.
function capture(dbPath,storeId,date){
  const db=new DatabaseSync(dbPath,{readOnly:true});
  try{
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000; BEGIN;');
    const stored=db.prepare('SELECT id,name,source_metadata_json,created_at,updated_at FROM stores WHERE id=?').get(storeId);
    if(!stored){db.exec('COMMIT');return {missing:'store_not_found'};}
    const header=db.prepare('SELECT * FROM store_days WHERE store_id=? AND business_date=?').get(storeId,date);
    const store={id:stored.id,name:stored.name,sourceMetadata:parseJson(stored.source_metadata_json)??{},createdAt:stored.created_at,updatedAt:stored.updated_at};
    if(!header){db.exec('COMMIT');return {missing:'day_not_found',store};}
    const rows=db.prepare('SELECT machine_key,payload_json FROM machine_day_data WHERE store_id=? AND business_date=? ORDER BY machine_key').all(storeId,date);
    const previousHeader=db.prepare('SELECT * FROM store_days WHERE store_id=? AND business_date=?').get(storeId,priorDate(date))??null;
    db.exec('COMMIT');return {store,header,rows,previousHeader};
  }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
  finally{db.close();}
}
function canonicalRows(records){
  const byNo=new Map(),invalid=[];
  for(const record of records){
    const payload=parseJson(record.payload_json);
    if(!payload||typeof payload!=='object'||Array.isArray(payload)){invalid.push('invalid_canonical_row');continue;}
    const tableNo=text(payload.tableNo),machine=keys.has(payload.machine)?payload.machine:null,input={games:strictNumber(payload.games),bb:strictNumber(payload.bb),rb:strictNumber(payload.rb),diff:strictNumber(payload.diff)};
    const row={payload,tableNo:tableNo||null,machine,input,reasons:tableNo?[]:['missing_table_id'],canonicalRowsN:1};
    const id=tableNo||`unknown:${hashCanonical({payload,record:record.machine_key})}`,old=byNo.get(id);
    if(!old){byNo.set(id,row);continue;}
    old.canonicalRowsN++;
    const signature=r=>hashCanonical({machine:r.machine,input:r.input,gamesSource:r.payload.gamesSource??null,diffSource:r.payload.diffSource??null,code:r.payload.sourceMachineCode??null,id:r.payload.sourceStoreMachineId??null});
    if(signature(old)!==signature(row)){
      old.reasons.push('conflicting_duplicate');old.relatedMachines=unique([old.machine,row.machine,...(old.relatedMachines??[])].filter(Boolean));
    }
  }
  return {byNo,invalid};
}
function joinRow(native,canonical,rawHash,kind){
  const machine=native?.machine??canonical?.machine??null,tableNo=native?.tableNo??canonical?.tableNo??null,reasons=unique([...(native?.reasons??[]),...(canonical?.reasons??[])]);
  if(!canonical)reasons.push('canonical_row_missing');
  if(!native)reasons.push('native_observation_unverified');
  if(native&&canonical&&native.machine!==canonical.machine)reasons.push('machine_identity_mismatch');
  if(canonical)for(const field of ['sourceMachineName','sourceRawMachineName']){
    const identity=names.resolve(canonical.payload[field]);if(keys.has(identity)&&identity!==canonical.machine)reasons.push('machine_identity_mismatch');
  }
  for(const field of ['sourceMachineCode','sourceStoreMachineId'])if(native&&canonical&&text(canonical.payload[field])&&native[field]&&text(canonical.payload[field])!==native[field])reasons.push('machine_identity_mismatch');
  const estimated=canonical?.payload.gamesSource&&canonical.payload.gamesSource!=='observed';
  if(estimated||canonical?.payload.gamesEstimated===true||canonical?.payload.estimatedGames===true)reasons.push('estimated_games');
  const numericMatch=Boolean(native&&canonical&&['games','bb','rb'].every(k=>native.input[k]!==null&&native.input[k]===canonical.input[k]));
  if(native&&canonical&&!numericMatch)reasons.push('canonical_native_mismatch');
  let input=native&&canonical?{...native.input}:canonical?{...canonical.input}:emptyInput();
  const diffObserved=Boolean(numericMatch&&native?.eligible&&native.input.diff!==null&&native.input.diff===canonical.input.diff&&(!canonical.payload.diffSource||canonical.payload.diffSource==='observed'));
  input.diff=diffObserved?input.diff:null;
  if(!canonical)input=emptyInput();
  const eligible=Boolean(machine&&native?.eligible&&numericMatch&&reasons.length===0);
  return {id:tableNo,tableNo,machine,sourceMachineName:native?.sourceMachineName??canonical?.payload.sourceMachineName??'',sourceMachineCode:native?.sourceMachineCode??text(canonical?.payload.sourceMachineCode),sourceStoreMachineId:native?.sourceStoreMachineId??text(canonical?.payload.sourceStoreMachineId),input,eligible,reasons:unique(reasons),warnings:unique(native?.warnings??[]),diffIssue:native?.diffIssue??null,canonicalRowsN:canonical?.canonicalRowsN??0,relatedMachines:unique([...(native?.relatedMachines??[]),...(canonical?.relatedMachines??[])]),provenance:{kind,observed:eligible,rawHash,gamesSource:native?.gamesSource??null,diffObserved,nativeValues:native?.nativeValues??null,canonicalInput:canonical?.input??null}};
}

/** Exact canonical store/day, read-only and independent of analysis/sync/PRE. */
export async function loadAllocationSnapshot({dbPath,rawRoot,storeId,date}={}){
  if(typeof dbPath!=='string'||!dbPath.trim())throw new TypeError('dbPath is required');
  if(typeof rawRoot!=='string'||!rawRoot.trim())throw new TypeError('rawRoot is required');
  if(typeof storeId!=='string'||!storeId.trim())throw new TypeError('storeId is required');
  exactDate(date);
  const captured=capture(dbPath,storeId,date);if(captured.missing)return failure(captured.missing,captured.store??null,date);
  const {store,header,rows:records,previousHeader}=captured,reasons=[];
  let artifact=null,previous=null;
  try{
    if(typeof header.source_hash!=='string'||!/^[a-f0-9]{64}$/.test(header.source_hash))reasons.push('raw_source_hash_missing');
    else artifact=await readAllocationRawArtifact({rawRoot,path:header.raw_artifact_path,expectedHash:header.source_hash});
  }
  catch(error){reasons.push(error?.message?.includes('hash')?'raw_hash_mismatch':'raw_artifact_unavailable');}
  if(artifact&&/^pia:\d+$/.test(storeId)){
    try{
      if(previousHeader?.raw_artifact_path){if(!/^[a-f0-9]{64}$/.test(previousHeader.source_hash??''))throw new Error('previous raw hash missing');previous=await readAllocationRawArtifact({rawRoot,path:previousHeader.raw_artifact_path,expectedHash:previousHeader.source_hash});}
      else previous=await readAllocationPiaSeed({rawRoot,storeId,date});
    }catch{reasons.push('previous_native_artifact_unavailable');}
  }
  const native=verifyAllocationProvenance({rawText:artifact?.rawText,previousRawText:previous?.rawText,storeId,date,storeName:store.name,source:store.sourceMetadata.source});
  const canonical=canonicalRows(records);reasons.push(...native.reasons,...canonical.invalid);
  if(header.quality_status!=='valid')reasons.push('canonical_quality_not_valid');
  const all=[],nativeNo=new Set();
  for(const row of native.rows){nativeNo.add(row.tableNo);all.push(joinRow(row,canonical.byNo.get(row.tableNo),artifact?.hash??null,native.kind));}
  for(const row of canonical.byNo.values())if(!nativeNo.has(row.tableNo))all.push(joinRow(null,row,artifact?.hash??null,native.kind));
  const groups=[];
  for(const machine of ALLOCATION_MACHINE_KEYS){
    const groupRows=all.filter(r=>r.machine===machine||r.relatedMachines.includes(machine));if(!groupRows.length)continue;
    const rosterVerified=native.roster.status==='verified',nInstalled=rosterVerified?native.roster.rows.filter(r=>r.machine===machine||r.relatedMachines?.includes(machine)).length:null;
    const nObserved=groupRows.filter(r=>r.eligible).length,groupReasons=unique([...groupRows.flatMap(r=>r.reasons),...(!rosterVerified?['roster_unverified']:[]),...canonical.invalid,...(header.quality_status!=='valid'?['canonical_quality_not_valid']:[])]);
    if(nInstalled!==null&&groupRows.length!==nInstalled)groupReasons.push('roster_mismatch');
    groups.push({machine,machineName:names.full(machine),nInstalled,nObserved,eligible:nInstalled!==null&&nInstalled>0&&nObserved===nInstalled&&groupReasons.length===0,reasons:unique(groupReasons),rows:groupRows,zeroGamesN:groupRows.filter(r=>r.eligible&&r.input.games===0).length,lowGamesN:groupRows.filter(r=>r.eligible&&r.input.games>0&&r.input.games<3000).length,diffN:groupRows.filter(r=>r.eligible&&r.provenance.diffObserved).length});
  }
  const unsupported=native.roster.rows.filter(r=>!r.machine).map(r=>({id:r.tableNo,tableNo:r.tableNo,machineName:r.sourceMachineName,sourceMachineName:r.sourceMachineName,sourceMachineCode:r.sourceMachineCode,sourceStoreMachineId:r.sourceStoreMachineId,machine:null,membershipVerified:r.membershipVerified,observationVerified:r.observationVerified,warnings:r.warnings??[],diffIssue:r.diffIssue??null,reasons:unique([...(r.reasons??[]),'unsupported_machine'])}));
  for(const row of all)if(!row.machine&&!unsupported.some(r=>r.tableNo===row.tableNo))unsupported.push({id:row.tableNo,tableNo:row.tableNo,machineName:row.sourceMachineName,sourceMachineName:row.sourceMachineName,machine:null,reasons:unique([...row.reasons,'unsupported_machine'])});
  const roster={...native.roster,hash:hashCanonical(native.roster),nInstalled:native.roster.status==='verified'?native.roster.rows.length:null,nObserved:groups.reduce((n,g)=>n+g.nObserved,0),nSupported:native.roster.rows.filter(r=>r.machine).length,nUnsupported:unsupported.length};
  const snapshot={date,source:native.source??store.sourceMetadata.source,sourceHash:header.source_hash??null,normalizedHash:header.normalized_payload_hash??null,rawHash:artifact?.hash??null,rosterHash:roster.hash,provenanceHash:hashCanonical({kind:native.kind,scope:native.verificationScope,previousHash:previous?.hash??null,rows:native.rows,reasons}),verificationScope:native.verificationScope,parserVersion:header.parser_version??null,updatedAt:header.updated_at??null};
  snapshot.inputHash=hashCanonical({storeId,date,header:{sourceHash:snapshot.sourceHash,normalizedHash:snapshot.normalizedHash,qualityStatus:header.quality_status,parserVersion:snapshot.parserVersion},canonicalRows:records.map(r=>({sequenceKey:r.machine_key,payload:r.payload_json})),rawHash:snapshot.rawHash,rosterHash:snapshot.rosterHash,provenanceHash:snapshot.provenanceHash});
  snapshot.id=snapshot.inputHash;
  const completeGroups=groups.length&&groups.every(g=>g.eligible)&&roster.status==='verified';
  return {ok:true,store,date,snapshot,roster,groups,unsupported,quality:{status:completeGroups?(native.observationsVerified?'verified':'partial'):'held',reasons:unique([...reasons,...groups.flatMap(g=>g.reasons)]),warnings:unique(all.flatMap(r=>r.warnings)),rawKind:native.kind,canonicalRowsN:records.length,observedN:groups.reduce((n,g)=>n+g.nObserved,0),duplicates:native.duplicates}};
}
