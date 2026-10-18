import {createHash} from 'node:crypto';
import {open,realpath,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {gunzipSync} from 'node:zlib';
import '../../../machine-names.js';
import {derivePiaBusinessDay,piaRowSignature,validatePiaSnapshot} from '../collectors/pia-public.mjs';
import {hashCanonical} from '../canonical-json.mjs';

export const ALLOCATION_MACHINE_KEYS=Object.freeze(['my','my6','im','go','fk','hp','gg','mr','um']);
const keys=new Set(ALLOCATION_MACHINE_KEYS),names=globalThis.JugestMachineNames;
const emptyInput=()=>({games:null,bb:null,rb:null,diff:null});
const sha=text=>createHash('sha256').update(text).digest('hex');
const unique=xs=>[...new Set(xs)];
const inside=(root,path)=>path===root||path.startsWith(root+sep);
const scalar=value=>typeof value==='string'?value.trim():typeof value==='number'&&Number.isFinite(value)?String(value):'';
const parseJson=text=>{try{return JSON.parse(text)}catch{return null}};
function dateValid(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(`${value}T00:00:00Z`);return Number.isFinite(+d)&&d.toISOString().slice(0,10)===value;}
const shiftDate=(date,n)=>{const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
function observedNumber(value){
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value!=='string'||!value.trim()||!/^[-+]?\d+(?:\.\d+)?$/.test(value.trim()))return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
}
function inputReasons(input){
  const reasons=[];
  for(const field of ['games','bb','rb'])if(input[field]===null)reasons.push(`missing_${field}`);else if(!Number.isSafeInteger(input[field])||input[field]<0)reasons.push(`invalid_${field}`);
  if(['games','bb','rb'].every(k=>Number.isSafeInteger(input[k])&&input[k]>=0)){
    if(input.bb+input.rb>input.games)reasons.push('bonus_exceeds_games');
    if(input.games===0&&(input.bb!==0||input.rb!==0||(input.diff!==null&&input.diff!==0)))reasons.push('inconsistent_zero_games');
  }
  return reasons;
}
function makeRow({tableNo,machineName,machineCode='',storeMachineId='',input=emptyInput(),nativeValues=null,reasons=[],gamesSource='source-observed'}){
  const resolved=names.resolve(machineName),machine=keys.has(resolved)?resolved:null;
  // Detect zero-game contradictions against the original optional difference
  // before removing a value the legacy likelihood adapter cannot accept.
  reasons=[...reasons,...inputReasons(input),...(!tableNo?['missing_table_id']:[]),...(!machineName?['missing_machine_identity']:[])];
  const diffIssue=input.diff!==null&&!Number.isSafeInteger(input.diff)?'diff_not_safe_integer':null;
  if(diffIssue)input={...input,diff:null};
  return {id:tableNo||null,tableNo:tableNo||null,machine,sourceMachineName:machineName,sourceMachineCode:machineCode,sourceStoreMachineId:storeMachineId,input,nativeValues,gamesSource,diffIssue,warnings:diffIssue?[diffIssue]:[],membershipVerified:false,observationDateVerified:false,observationVerified:reasons.length===0,eligible:machine!==null&&reasons.length===0,reasons:unique(reasons),...(!machine?{unsupportedReason:'unsupported_machine'}:{})};
}
function report({kind='other',source=null,dateVerified=false,complete=false,rows=[],reasons=[],rosterReasons=reasons,duplicates={identical:0,conflicting:0},verificationScope='unverified',rawHash=null}){
  const status=complete?'verified':rows.length?'partial':'unverified';
  return {kind,source,dateVerified,observationsVerified:dateVerified&&rows.length>0&&rows.every(r=>r.observationVerified),verificationScope,rawHash,rows,roster:{status,complete,rows,reasons:unique(rosterReasons)},reasons:unique(reasons),duplicates};
}
function deduplicate(rows){
  const byTable=new Map(),duplicates={identical:0,conflicting:0};
  for(const row of rows){
    const key=row.tableNo||`missing:${byTable.size}`,old=byTable.get(key);
    if(!old){byTable.set(key,row);continue;}
    const signature=r=>hashCanonical({name:r.sourceMachineName,code:r.sourceMachineCode,id:r.sourceStoreMachineId,input:r.input,diffIssue:r.diffIssue,excludedDiff:r.diffIssue?observedNumber(r.nativeValues?.difference??r.nativeValues?.diff):null});
    if(signature(old)===signature(row)){duplicates.identical++;continue;}
    duplicates.conflicting++;old.eligible=false;old.reasons=unique([...old.reasons,...row.reasons,'conflicting_duplicate']);
    old.relatedMachines=unique([old.machine,row.machine,...(old.relatedMachines??[])].filter(Boolean));
    if(old.machine!==row.machine||(old.sourceMachineCode&&row.sourceMachineCode&&old.sourceMachineCode!==row.sourceMachineCode)||(old.sourceStoreMachineId&&row.sourceStoreMachineId&&old.sourceStoreMachineId!==row.sourceStoreMachineId))old.reasons=unique([...old.reasons,'ambiguous_machine_identity']);
  }
  return {rows:[...byTable.values()],duplicates};
}

/** Read immutable archives only within rawRoot; no source requests or collectors. */
export async function readAllocationRawArtifact({rawRoot,path,expectedHash=null,maxBytes=64*1024*1024}={}){
  if(typeof rawRoot!=='string'||!rawRoot.trim()||typeof path!=='string'||!path.trim())throw new TypeError('raw root and path are required');
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new TypeError('raw byte limit must be positive');
  const root=resolve(rawRoot),target=resolve(root,path);
  if(!inside(root,target))throw new Error('raw path is outside root');
  const [rootReal,targetReal]=await Promise.all([realpath(root),realpath(target)]);
  if(!inside(rootReal,targetReal))throw new Error('raw path is outside root');
  const handle=await open(targetReal,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let data;
  try{const info=await handle.stat();if(!info.isFile())throw new Error('raw archive must be a file');if(info.size>maxBytes)throw new Error('raw archive exceeds byte limit');data=await handle.readFile();}
  finally{await handle.close();}
  if(data.length>maxBytes)throw new Error('raw archive exceeds byte limit');
  if(data[0]===0x1f&&data[1]===0x8b)data=gunzipSync(data,{maxOutputLength:maxBytes});
  if(data.length>maxBytes)throw new Error('raw archive exceeds byte limit');
  const hash=sha(data);
  if(expectedHash&&hash!==expectedHash)throw new Error('raw hash mismatch');
  return {rawText:data.toString('utf8'),hash,bytes:data.length};
}

/** The collector seeds the first native snapshot outside canonical store_days. */
export async function readAllocationPiaSeed({rawRoot,storeId,date,maxCandidates=8}={}){
  if(!dateValid(date)||!/^pia:\d+$/.test(storeId??''))return null;
  const bucket=`s-${sha(`${storeId}:snapshot`).slice(0,24)}`,root=resolve(rawRoot),dir=join(root,bucket,date.slice(0,4),date.slice(5,7));
  let entries;
  try{
    const [rootReal,dirReal]=await Promise.all([realpath(root),realpath(dir)]);if(!inside(rootReal,dirReal))throw new Error('raw seed path is outside root');
    entries=await readdir(dirReal);
  }catch(error){if(error?.code==='ENOENT')return null;throw error;}
  const matched=entries.filter(name=>new RegExp(`^${date}\\.[a-f0-9]{64}\\.html\\.gz$`).test(name));
  if(matched.length!==1||matched.length>maxCandidates)return null;
  const filename=matched[0],expectedHash=filename.slice(date.length+1,date.length+65);
  return readAllocationRawArtifact({rawRoot,path:join(dir,filename),expectedHash});
}

function piaGroups(data){
  const map=new Map();for(const row of Array.isArray(data?.ranking)?data.ranking:[]){const no=scalar(row?.machine_no);if(!map.has(no))map.set(no,[]);map.get(no).push(row);}return map;
}
const piaIdentity=row=>JSON.stringify([scalar(row?.name),scalar(row?.sis_machine_code),scalar(row?.store_machine_id)]);
function piaKnownIdentity(rows){return Boolean(rows?.length&&rows.every(row=>scalar(row?.machine_no)&&scalar(row?.name))&&new Set(rows.map(piaIdentity)).size===1);}
function piaSignature(row){
  const values={...row};
  for(const field of ['store_id','machine_no','special','start','final_start','special_1','special_2','special_2d','special_out','special_safe','out','safe','difference']){
    const number=observedNumber(row?.[field]);if(number!==null)values[field]=number;
  }
  return `${piaRowSignature(values)}|${scalar(row?.store_machine_id)}`;
}
function piaAdded(previous,current){
  const counts=new Map();for(const row of previous){const sig=piaSignature(row);counts.set(sig,(counts.get(sig)??0)+1);}
  const added=[];for(const row of current){const sig=piaSignature(row),n=counts.get(sig)??0;if(n)counts.set(sig,n-1);else added.push(row);}return added;
}
function piaRow(row,reasons=[]){
  const out=observedNumber(row?.out),specialOut=observedNumber(row?.special_out),bb=observedNumber(row?.special_1),rb=observedNumber(row?.special_2d),diff=observedNumber(row?.difference);
  const validG=Number.isSafeInteger(out)&&Number.isSafeInteger(specialOut)&&out>=specialOut&&specialOut>=0;
  return makeRow({tableNo:scalar(row?.machine_no),machineName:scalar(row?.name),machineCode:scalar(row?.sis_machine_code),storeMachineId:scalar(row?.store_machine_id),input:{games:validG?Math.round((out-specialOut)/3):null,bb,rb,diff},nativeValues:{out:row?.out??null,special_out:row?.special_out??null,special_1:row?.special_1??null,special_2d:row?.special_2d??null,difference:row?.difference??null},reasons,gamesSource:'source-converted'});
}
function verifyPia({data,previous,storeId,date,rawHash}){
  const source='pia-public-ranking-top',rows=[],reasons=[],currentGroups=piaGroups(data),priorGroups=piaGroups(previous);
  const serverDate=data?.server_date_time?.date;
  if(data.backfill){
    for(const group of currentGroups.values())rows.push(piaRow(group[0],['historical_roster_unverified']));
    return report({kind:'source-derived',source,rows,reasons:['historical_roster_unverified'],rawHash});
  }
  const storeNumber=storeId?.match(/^pia:(\d+)$/)?.[1];
  if(!storeNumber||data.ranking.some(r=>observedNumber(r?.store_id)!==Number(storeNumber)))reasons.push('native_store_mismatch');
  if(!dateValid(serverDate)||serverDate!==shiftDate(date,1))reasons.push('native_date_mismatch');
  // Existing native collector requests at most 5,000 ranking rows. Reaching
  // that boundary does not prove that the response exhausted the store list.
  if(data.ranking.length>=5000)reasons.push('native_roster_truncated');
  const previousNative=previous?.status===0&&Array.isArray(previous.ranking)&&!previous.backfill&&previous.server_date_time?.date===date&&previous.ranking.every(r=>observedNumber(r?.store_id)===Number(storeNumber));
  const previousComplete=previousNative&&previous.ranking.length>0&&previous.ranking.length<5000&&[...priorGroups.values()].every(rows=>rows.length<=30&&piaKnownIdentity(rows));
  const previousValid=Boolean(previousNative&&previousComplete);
  if(!previousValid)reasons.push(previousNative?'pia_previous_snapshot_incomplete':'pia_previous_snapshot_missing');
  let historyValid=false,derived=null;
  if(previousValid){
    try{validatePiaSnapshot(data,{minMachineCount:1,previousSnapshot:previous});historyValid=true;}
    catch{reasons.push('pia_history_invalid');}
    if(historyValid)derived=derivePiaBusinessDay(previous,data,serverDate,{minComparable:1});
  }
  const globalValid=reasons.length===0&&historyValid;
  for(const [no,current] of currentGroups){
    const prior=priorGroups.get(no),added=previousValid?piaAdded(prior??[],current):[],dateUnique=Boolean(previousValid&&(prior?added.length===1:current.length===1));
    const identity=new Set(current.map(piaIdentity));
    // Membership is a separate source proof from selecting a daily record.
    // This rule is identical for supported and unsupported machine models.
    const stableMembership=piaKnownIdentity(current)&&piaKnownIdentity(prior)&&piaIdentity(current[0])===piaIdentity(prior[0]);
    const membershipVerified=Boolean(globalValid&&piaKnownIdentity(current)&&(dateUnique||stableMembership));
    const localReasons=[...(!globalValid?reasons:[]),...(identity.size!==1?['ambiguous_machine_identity']:[]),...(!dateUnique?['pia_day_ambiguous']:[]),...(!membershipVerified?['pia_roster_membership_ambiguous']:[])];
    let native;
    if(dateUnique)native=piaRow(prior?added[0]:current[0],localReasons);
    else native=makeRow({tableNo:no,machineName:scalar(current[0]?.name),machineCode:scalar(current[0]?.sis_machine_code),storeMachineId:scalar(current[0]?.store_machine_id),reasons:localReasons,gamesSource:'source-converted'});
    // Reuse the source's pure day derivation. Strict original-field validation
    // above precedes its historical Number() conversions, including null=>0.
    const normalized=derived?.machines.find(r=>r.tableNo===no);
    if(native.eligible&&normalized&&['games','bb','rb'].some(k=>normalized[k]!==native.input[k])){native.reasons.push('pia_derivation_mismatch');native.eligible=false;}
    native.membershipVerified=membershipVerified;
    native.observationDateVerified=Boolean(globalValid&&piaKnownIdentity(current)&&dateUnique);
    native.observationVerified=native.observationDateVerified&&native.reasons.length===0;
    rows.push(native);
  }
  if(previousValid)for(const [no,prior] of priorGroups)if(!currentGroups.has(no)){
    reasons.push('pia_removed_table_ambiguous');rows.push(makeRow({tableNo:no,machineName:scalar(prior[0]?.name),machineCode:scalar(prior[0]?.sis_machine_code),storeMachineId:scalar(prior[0]?.store_machine_id),reasons:['pia_removed_table_ambiguous']}));
  }
  const complete=globalValid&&currentGroups.size>0&&rows.every(r=>r.membershipVerified);
  const dateVerified=globalValid&&rows.length>0&&rows.every(r=>r.observationDateVerified);
  const rosterReasons=unique([...reasons,...rows.filter(r=>!r.membershipVerified).flatMap(r=>r.reasons)]);
  const observationReasons=rows.filter(r=>!r.observationVerified).flatMap(r=>r.reasons);
  const observationsComplete=dateVerified&&rows.every(r=>r.observationVerified);
  const verificationScope=!globalValid?'unverified':!complete?'native-adjacent-membership-unverified':observationsComplete?'native-adjacent-snapshots':'native-adjacent-membership-observations-partial';
  return report({kind:'source-native',source,dateVerified,complete,rows,reasons:unique([...rosterReasons,...observationReasons]),rosterReasons,verificationScope,rawHash});
}

function stripHtml(value=''){
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&#x([0-9a-f]+);/gi,(_,n)=>{const p=parseInt(n,16);return p<=0x10ffff?String.fromCodePoint(p):'';}).replace(/&#(\d+);/g,(_,n)=>{const p=Number(n);return p<=0x10ffff?String.fromCodePoint(p):'';}).replace(/&(amp|lt|gt|quot|apos|nbsp);/gi,(_,k)=>named[k.toLowerCase()]).replace(/\s+/g,' ').trim();
}
function htmlNumber(value){
  if(typeof value!=='string')return null;
  const normalized=value.normalize('NFKC').replace(/,/g,'').replace(/[−－–—]/g,'-').trim();return observedNumber(normalized);
}
function htmlStoreIdentity(heading){
  const label=heading.normalize('NFKC')
    .replace(/\b\d{4}[-/年]\d{1,2}[-/月]\d{1,2}(?:日|\b)/g,' ')
    .replace(/^\s*\([日月火水木金土](?:曜日)?\)\s*/,' ')
    .replace(/(?:\s+[-|]\s*|\s+)アナスロ\s*$/,'')
    .replace(/\s+[-|]\s*(?:データまとめ|スロットデータ|出玉データ|データ一覧)\s*$/,'')
    .replace(/^\s*[-|:]\s+/,'').trim();
  return names.token(label);
}
function verifyHtml({rawText,date,storeName,source,rawHash}){
  const reasons=[],rows=[],headings=[...rawText.matchAll(/<(?:title|h1)\b[^>]*>([\s\S]*?)<\/(?:title|h1)>/gi)].map(m=>stripHtml(m[1])),head=headings.join(' ');
  const dateWords=[date,date.replaceAll('-','/'),`${Number(date.slice(0,4))}年${Number(date.slice(5,7))}月${Number(date.slice(8,10))}日`,`${date.slice(0,4)}/${Number(date.slice(5,7))}/${Number(date.slice(8,10))}`];
  const headerDates=[...head.matchAll(/\b(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})(?:日|\b)/g)].map(m=>`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`);
  if(!dateWords.some(x=>head.includes(x))||headerDates.some(d=>d!==date))reasons.push('native_date_mismatch');
  const storeIdentities=headings.map(htmlStoreIdentity).filter(Boolean),expectedStore=names.token(storeName);
  if(!expectedStore||!storeIdentities.length||storeIdentities.some(identity=>identity!==expectedStore))reasons.push('native_store_mismatch');
  const fullIndex=rawText.indexOf('全データ一覧'),full=fullIndex>=0&&!/<[^>]+(?:rel\s*=\s*["']next["']|class\s*=\s*["'][^"']*pagination)|次のページ|次へ\s*<\/a>/i.test(rawText);
  if(!full)reasons.push('full_roster_unverified');
  if(!/^ana-slo(?:-ios-relay)?$/.test(source??''))reasons.push('native_source_unverified');
  for(const table of rawText.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)){
    if(fullIndex>=0&&table.index<fullIndex)continue;
    const tr=[...table[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1>/gi)].map(c=>({type:c[1].toLowerCase(),text:stripHtml(c[2])})));
    const header=tr.find(r=>r.some(c=>c.type==='h'))??tr[0];if(!header)continue;
    const labels=header.map(c=>c.text.replace(/\s/g,'')),idx=words=>labels.findIndex(x=>words.some(w=>x.toUpperCase().includes(w.toUpperCase())));
    const columns={machine:idx(['機種名','機種']),no:idx(['台番号','台番']),games:idx(['G数','総回転数','回転数','ゲーム数']),bb:idx(['BB','BIG']),rb:idx(['RB','REG']),diff:idx(['差枚'])};
    if(columns.machine<0||columns.no<0||columns.bb<0||columns.rb<0)continue;
    for(const cells of tr){
      if(cells===header||!cells.length)continue;
      const text=key=>cells[columns[key]]?.text??null,no=text('no'),name=text('machine');
      if((!name&&!no)||/^(平均|合計|総計|全台)$/.test(no))continue;
      const input={games:htmlNumber(text('games')),bb:htmlNumber(text('bb')),rb:htmlNumber(text('rb')),diff:htmlNumber(text('diff'))};
      rows.push(makeRow({tableNo:no,machineName:name??'',input,nativeValues:{games:text('games'),bb:text('bb'),rb:text('rb'),diff:text('diff')},reasons:reasons.filter(x=>x!=='full_roster_unverified')}));
    }
    // A single explicit all-data table is the roster. Auxiliary tables are
    // not concatenated into additional physical machines.
    break;
  }
  if(!rows.length)reasons.push('native_rows_missing');
  const dedup=deduplicate(rows),complete=reasons.length===0&&dedup.rows.length>0&&dedup.rows.every(r=>r.tableNo&&!r.reasons.some(x=>['ambiguous_machine_identity','missing_machine_identity'].includes(x)));
  for(const row of dedup.rows){row.membershipVerified=Boolean(complete&&row.tableNo&&row.sourceMachineName);row.observationDateVerified=!row.reasons.some(x=>['native_date_mismatch','native_store_mismatch','native_source_unverified'].includes(x));row.observationVerified=row.observationDateVerified&&row.reasons.length===0;}
  return report({kind:'source-native',source:'ana-slo',dateVerified:!reasons.some(x=>['native_date_mismatch','native_store_mismatch','native_source_unverified'].includes(x)),complete,...dedup,reasons,rawHash,verificationScope:complete?'native-exact-day-full-table':'unverified'});
}

/** Validate raw observations before any canonical or legacy numeric coercion. */
export function verifyAllocationProvenance({rawText,previousRawText=null,storeId,date,storeName='',source=null}={}){
  if(!dateValid(date))throw new TypeError('date must be a real YYYY-MM-DD date');
  if(typeof rawText!=='string')return report({reasons:['native_artifact_missing']});
  const rawHash=sha(rawText),data=parseJson(rawText);
  if(data&&typeof data==='object'&&(data.provenance==='device-indexeddb-backfill-v1'||data.day||Array.isArray(data.days)||data.format?.startsWith?.('juggler-external-import')))return report({kind:'device-repackaged',source,reasons:['native_artifact_repackaged'],rawHash});
  if(data?.status===0&&Array.isArray(data.ranking))return verifyPia({data,previous:parseJson(previousRawText),storeId,date,rawHash});
  if(/<table\b/i.test(rawText))return verifyHtml({rawText,date,storeName,source,rawHash});
  return report({source,reasons:['native_format_unverified'],rawHash});
}
