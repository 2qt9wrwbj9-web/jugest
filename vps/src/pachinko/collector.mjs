import {createHash} from 'node:crypto';
import {mkdir,writeFile,rename,access} from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {openPachinkoDatabase,migratePachinko} from './schema.mjs';
import {importPachinkoSnapshot} from './store.mjs';
import {validatePachinkoSnapshot} from './snapshot.mjs';

export const PACHINKO_ENDPOINT='https://piagroupapp.com/api/stores/getRankingTop';
export const PACHINKO_COLLECTOR_ID='pia:35-p';
export const PACHINKO_COLLECTOR_VERSION='pia-rankingtop-p-v1';
const JST_OFFSET=9*60*60*1000;
const sha=value=>createHash('sha256').update(value).digest('hex');

export function jstPachinkoClock(date=new Date()){
  const d=new Date(date.getTime()+JST_OFFSET);
  return {date:d.toISOString().slice(0,10),minutes:d.getUTCHours()*60+d.getUTCMinutes()};
}
function parseIso(value){const n=Date.parse(String(value||''));return Number.isFinite(n)?n:null}
function state(db){return db.prepare('SELECT * FROM p_collector_state WHERE collector_id=?').get(PACHINKO_COLLECTOR_ID)??null}
function writeState(db,patch){
  const old=state(db)??{};const now=patch.updated_at??new Date().toISOString();
  const row={collector_id:PACHINKO_COLLECTOR_ID,last_attempt_at:Object.hasOwn(patch,'last_attempt_at')?patch.last_attempt_at:(old.last_attempt_at??null),last_success_at:Object.hasOwn(patch,'last_success_at')?patch.last_success_at:(old.last_success_at??null),last_error:Object.hasOwn(patch,'last_error')?patch.last_error:(old.last_error??null),last_collected_server_date:Object.hasOwn(patch,'last_collected_server_date')?patch.last_collected_server_date:(old.last_collected_server_date??null),updated_at:now};
  db.prepare(`INSERT INTO p_collector_state(collector_id,last_attempt_at,last_success_at,last_error,last_collected_server_date,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(collector_id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,last_error=excluded.last_error,last_collected_server_date=excluded.last_collected_server_date,updated_at=excluded.updated_at`).run(row.collector_id,row.last_attempt_at,row.last_success_at,row.last_error,row.last_collected_server_date,row.updated_at);
  return row;
}

export async function archivePachinkoRaw({archiveRoot,rawText,observedAt=new Date().toISOString(),kind='response',metadata={}}={}){
  if(typeof archiveRoot!=='string'||!archiveRoot.trim())throw new TypeError('pachinko_archive_root_required');
  if(typeof rawText!=='string')throw new TypeError('pachinko_raw_text_required');
  const observedDate=new Date(observedAt);if(!Number.isFinite(observedDate.getTime()))throw new TypeError('invalid_pachinko_observed_at');
  const hash=sha(rawText),date=jstPachinkoClock(observedDate).date,dir=path.join(archiveRoot,date),file=path.join(dir,`${hash}.json.gz`),meta=path.join(dir,`${hash}.meta.json`);
  await mkdir(dir,{recursive:true});
  try{await access(file)}catch{
    const tmp=`${file}.tmp-${process.pid}`;await writeFile(tmp,gzipSync(rawText),{mode:0o600});await rename(tmp,file);
  }
  await writeFile(meta,JSON.stringify({sha256:hash,observed_at:observedAt,collector_version:PACHINKO_COLLECTOR_VERSION,kind,...metadata})+'\n',{mode:0o600});
  return {hash,path:file,metaPath:meta};
}

export async function fetchPachinkoSnapshot({fetchImpl=fetch,timeoutMs=20_000,archiveRoot=null,observedAt=new Date().toISOString()}={}){
  const body=new URLSearchParams({machine_type:'P',store_id:'35',limit:'20000'});
  let response;
  try{response=await fetchImpl(PACHINKO_ENDPOINT,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8','accept':'application/json'},body,signal:AbortSignal.timeout(timeoutMs)})}
  catch(error){throw new Error(`pachinko_fetch_failed:${String(error?.message||error)}`)}
  if(!response?.ok)throw new Error(`pachinko_http_${response?.status??'error'}`);
  const rawText=await response.text();
  if(archiveRoot)await archivePachinkoRaw({archiveRoot,rawText,observedAt,kind:'http-success'});
  let payload;try{payload=JSON.parse(rawText)}catch{throw new Error('pachinko_non_json_response')}
  const meta=validatePachinkoSnapshot(payload,{maxRows:20000});
  if(archiveRoot)await archivePachinkoRaw({archiveRoot,rawText,observedAt,kind:'validated-public-pia',metadata:{server_date:meta.serverDate,server_time:meta.serverTime,row_count:meta.rowCount,machine_count:meta.machineCount,source:'pia-public-ranking-top',request:{machine_type:'P',store_id:'35',limit:'20000'}}});
  return {rawText,payload,meta};
}

export function shouldAttemptPachinkoCollection(db,{now=new Date(),retryMs=30*60*1000,windowStartMinutes=30,windowEndMinutes=360}={}){
  const clock=jstPachinkoClock(now);
  if(clock.minutes<windowStartMinutes||clock.minutes>=windowEndMinutes)return {attempt:false,reason:'outside_window',jstDate:clock.date};
  const row=state(db);
  if(row?.last_collected_server_date===clock.date)return {attempt:false,reason:'done_today',jstDate:clock.date};
  const last=parseIso(row?.last_attempt_at);
  if(last!==null&&now.getTime()-last>=0&&now.getTime()-last<retryMs)return {attempt:false,reason:'cooldown',jstDate:clock.date};
  return {attempt:true,reason:'due',jstDate:clock.date};
}

export async function collectPachinkoOnce(db,{archiveRoot,fetchImpl=fetch,timeoutMs=20_000,now=new Date()}={}){
  const observedAt=now.toISOString();writeState(db,{last_attempt_at:observedAt,updated_at:observedAt});
  try{
    const fetched=await fetchPachinkoSnapshot({fetchImpl,timeoutMs,archiveRoot,observedAt});
    const result=importPachinkoSnapshot(db,{payload:fetched.payload,rawText:fetched.rawText,observedAt,collectorVersion:PACHINKO_COLLECTOR_VERSION,provenance:{source:'pia-public-ranking-top',visibility:'public',endpoint:PACHINKO_ENDPOINT,publicStoreId:35,request:{machine_type:'P',store_id:'35',limit:'20000'}}});
    if(result.collectionReady)writeState(db,{last_success_at:observedAt,last_error:null,last_collected_server_date:fetched.meta.serverDate,updated_at:observedAt});
    else writeState(db,{last_error:`not_ready:${result.status}`,updated_at:observedAt});
    return {...result,serverDate:fetched.meta.serverDate,serverTime:fetched.meta.serverTime,rowCount:fetched.meta.rowCount,machineCount:fetched.meta.machineCount};
  }catch(error){writeState(db,{last_error:String(error?.message||error),updated_at:observedAt});throw error}
}

export async function runPachinkoCollectorTick({dbPath,archiveRoot,fetchImpl=fetch,timeoutMs=20_000,retryMs=30*60*1000,windowStartMinutes=30,windowEndMinutes=360,now=new Date(),logger=()=>{}}={}){
  const db=openPachinkoDatabase(dbPath);try{
    migratePachinko(db);
    const decision=shouldAttemptPachinkoCollection(db,{now,retryMs,windowStartMinutes,windowEndMinutes});if(!decision.attempt)return decision;
    const result=await collectPachinkoOnce(db,{archiveRoot,fetchImpl,timeoutMs,now});logger(JSON.stringify({level:'info',event:'pachinko_collector_result',...result}));return {...decision,result};
  }catch(error){logger(JSON.stringify({level:'error',event:'pachinko_collector_failed',message:String(error?.message||error)}));throw error}finally{db.close()}
}

export function startPachinkoCollectorScheduler({dbPath,archiveRoot,fetchImpl=fetch,timeoutMs=20_000,retryMs=30*60*1000,windowStartMinutes=30,windowEndMinutes=360,clock=()=>new Date(),intervalMs=5*60*1000,logger=()=>{}}={}){
  if(typeof dbPath!=='string'||!dbPath)throw new TypeError('dbPath is required');if(typeof archiveRoot!=='string'||!archiveRoot)throw new TypeError('archiveRoot is required');
  let running=false,stopped=false,timer=null,current=null;
  const tick=async()=>{
    if(stopped||running)return {attempt:false,reason:stopped?'stopped':'running'};
    running=true;
    current=(async()=>{try{return await runPachinkoCollectorTick({dbPath,archiveRoot,fetchImpl,timeoutMs,retryMs,windowStartMinutes,windowEndMinutes,now:clock(),logger})}catch{return {attempt:true,reason:'failed'}}})();
    try{return await current}finally{running=false;current=null}
  };
  const schedule=()=>{if(stopped)return;const now=clock().getTime(),elapsed=((now%intervalMs)+intervalMs)%intervalMs;timer=setTimeout(()=>{void tick();schedule()},intervalMs-elapsed);timer.unref?.()};
  void tick();schedule();return {tick,async stop(){stopped=true;if(timer)clearTimeout(timer);try{await current}catch{}}};
}

export const __test={state,writeState,parseIso,sha};
