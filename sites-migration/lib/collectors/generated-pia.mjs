// Frozen PIA collector and scheduling rules. Source SHA-256: 6789374052265203d146c0d4b0d5c24b337fa45dcc2787265c3aeae3fa222de4
import {createHash} from 'node:crypto';
import '../../upstream/machine-names.js';

export const PIA_ENDPOINT='https://piagroupapp.com/api/stores/getRankingTop';
export const PIA_COLLECTOR_ID='pia-public:35';
export const PIA_SOURCE_STORE_ID='pia:35';
export const PIA_STORE_NAME='PIA大船1';
export const PIA_PARSER_BUILD='pia-rankingtop-v1';

const NAME_REGISTRY=globalThis.JugestMachineNames;
const JUGGLER_KEYS=['my6','my','im','go','fk','hp','gg','mr','um'];
// These are historical canonical-ingest SOURCE identifiers, not user-facing names.
// Never change them just to fix a display label: long-term feature grouping uses them.
const SOURCE_LABELS=Object.freeze({
  my6:'マイジャグラーⅥ',my:'マイジャグラーV',im:'ネオアイムジャグラーEX',
  go:'ゴーゴージャグラー3',fk:'ファンキージャグラー2',hp:'ハッピージャグラーVⅢ',
  gg:'ジャグラーガールズSS',mr:'ミスタージャグラー',um:'ウルトラミラクルジャグラー'
});
const MACHINE_ALIASES=JUGGLER_KEYS.map(key=>[key,SOURCE_LABELS[key],[NAME_REGISTRY.full(key),...NAME_REGISTRY.aliases(key)]]);
const machineToken=NAME_REGISTRY.token;
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

// PIA resets a replaced machine's rolling history to one row on installation.
// Before accepting shortened history, verify the transition against the last
// successfully stored snapshot. An unchanged machine must not lose history.
export function validatePiaSnapshot(data,{minMachineCount=80,previousSnapshot=null}={}){
  if(!data||data.status!==0||!Array.isArray(data.ranking))throw new Error('PIA RankingTop returned an invalid payload');
  const snapshotDate=validDate(data?.server_date_time?.date);
  if(!snapshotDate)throw new Error('PIA RankingTop did not include a valid server date');
  const groups=new Map();
  for(const row of data.ranking){
    if(Number(row?.store_id)!==35)throw new Error('PIA RankingTop mixed an unexpected store');
    const no=String(row?.machine_no??'');if(!no)throw new Error('PIA RankingTop row is missing machine_no');
    if(!groups.has(no))groups.set(no,[]);
    groups.get(no).push(row);
  }
  if(groups.size<minMachineCount)throw new Error(`PIA RankingTop machine count too small: ${groups.size}`);
  const previousGroups=new Map();
  for(const row of previousSnapshot?.ranking??[]){
    const no=String(row?.machine_no??'');
    if(!previousGroups.has(no))previousGroups.set(no,[]);
    previousGroups.get(no).push(row);
  }
  let shortened=0;
  for(const [no,rows] of groups){
    if(rows.length>30)throw new Error(`PIA RankingTop history exceeds 30 rows for machine ${no}`);
    const first=rows[0];
    if(rows.some(row=>String(row?.name??'')!==String(first?.name??'')||
      String(row?.sis_machine_code??'')!==String(first?.sis_machine_code??''))){
      throw new Error(`PIA RankingTop mixed machine identities for machine ${no}`);
    }
    if(rows.length===30)continue;
    shortened++;
    const prior=previousGroups.get(no);
    if(!previousSnapshot)throw new Error(`PIA RankingTop is not a 30-row rolling history for ${shortened} machine(s)`);
    if(!prior){
      if(rows.length===1)continue; // genuinely new machine number
      throw new Error(`PIA RankingTop has unverified short history for machine ${no}`);
    }
    const old=prior[0];
    const identityChanged=String(old?.name??'')!==String(first?.name??'')||
      String(old?.sis_machine_code??'')!==String(first?.sis_machine_code??'')||
      (Boolean(old?.store_machine_id)&&Boolean(first?.store_machine_id)&&
        String(old.store_machine_id)!==String(first.store_machine_id));
    if(identityChanged){
      if(rows.length===1)continue; // replacement's first recorded business day
    }else if(prior.length<30&&rows.length===prior.length+1){
      continue; // history grows one row per day until it reaches 30
    }
    throw new Error(`PIA RankingTop unexpected rolling history transition for machine ${no}: ${prior.length} -> ${rows.length}`);
  }
  return {snapshotDate,snapshotTime:String(data?.server_date_time?.time??''),rowCount:data.ranking.length,machineCount:groups.size,shortenedMachineCount:shortened};
}

export async function fetchPiaPublicSnapshot({fetchImpl=fetch,minMachineCount=80,previousSnapshot=null}={}){
  const body=new URLSearchParams({machine_type:'S',store_id:'35',limit:'5000'});
  const response=await fetchImpl(PIA_ENDPOINT,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body,signal:AbortSignal.timeout(20000)});
  if(!response?.ok)throw new Error(`PIA RankingTop HTTP ${response?.status??'error'}`);
  const rawText=await response.text();
  let data;try{data=JSON.parse(rawText)}catch{throw new Error('PIA RankingTop returned non-JSON data')}
  const meta=validatePiaSnapshot(data,{minMachineCount,previousSnapshot});
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
  let comparable=0,oneAdd=0,multiAdd=0,zeroAdd=0,newMachines=0,unsupported=0,normalizedComparable=0;
  const machines=[];
  for(const [no,rows] of current){
    const prior=previous.get(no);
    if(!prior){
      newMachines++;
      // A newly assigned table number has no previous group to diff against.
      // Only its first (single-row) day is unambiguous.
      if(rows.length===1){
        const normalized=normalizePiaJugglerRow(rows[0]);
        if(normalized)machines.push(normalized);else unsupported++;
      }
      continue;
    }
    comparable++;
    const added=addedRows(prior,rows);
    if(added.length===0){zeroAdd++;continue}
    if(added.length!==1){multiAdd++;continue}
    oneAdd++;
    const normalized=normalizePiaJugglerRow(added[0]);
    if(!normalized){unsupported++;continue}
    machines.push(normalized);normalizedComparable++;
  }
  machines.sort((a,b)=>Number(a.tableNo)-Number(b.tableNo)||a.tableNo.localeCompare(b.tableNo));
  const oneAddCoverage=comparable?oneAdd/comparable:0,normalizedCoverage=comparable?normalizedComparable/comparable:0;
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

const JST_OFFSET_MS=9*60*60*1000;
export function jstClock(date=new Date()){
  const shifted=new Date(date.getTime()+JST_OFFSET_MS);
  return {date:shifted.toISOString().slice(0,10),minutes:shifted.getUTCHours()*60+shifted.getUTCMinutes()};
}

export function shouldAttemptPiaCollection(db,{now=new Date(),targetHour=0,targetMinute=0,cooldownMs=30*60*1000}={}){
  const clock=jstClock(now),target=targetHour*60+targetMinute;
  if(clock.minutes<target)return {attempt:false,reason:'before_window',jstDate:clock.date};
  const state=db.prepare('SELECT last_snapshot_date,last_attempt_at FROM source_collector_state WHERE collector_id=?').get(PIA_COLLECTOR_ID);
  if(state?.last_snapshot_date===clock.date)return {attempt:false,reason:'done_today',jstDate:clock.date};
  if(state?.last_attempt_at){
    const elapsed=now.getTime()-Date.parse(state.last_attempt_at);
    if(Number.isFinite(elapsed)&&elapsed>=0&&elapsed<cooldownMs)return {attempt:false,reason:'cooldown',jstDate:clock.date};
  }
  return {attempt:true,reason:'due',jstDate:clock.date};
}
