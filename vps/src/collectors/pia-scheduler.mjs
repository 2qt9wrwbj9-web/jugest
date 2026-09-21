import {openDatabase} from '../db.mjs';
import {migrate} from '../schema.mjs';
import {collectPiaPublicOnce,PIA_COLLECTOR_ID} from './pia-public.mjs';
import {backfillPiaRollingHistory,shouldBackfillPiaRollingHistory} from './pia-backfill-once.mjs';
import {markCollectorActivity} from '../collector-activity.mjs';

const JST_OFFSET_MS=9*60*60*1000;
export function jstClock(date=new Date()){
  const shifted=new Date(date.getTime()+JST_OFFSET_MS);
  return {date:shifted.toISOString().slice(0,10),minutes:shifted.getUTCHours()*60+shifted.getUTCMinutes()};
}

export function shouldAttemptPiaCollection(db,{now=new Date(),targetHour=6,targetMinute=10,cooldownMs=30*60*1000}={}){
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

export async function runPiaCollectorTick({dbPath,rawRoot,fetchImpl=fetch,now=new Date(),logger=()=>{},targetHour=6,targetMinute=10,cooldownMs=30*60*1000,minMachineCount=80,enterCollectorBarrier=async()=>({ok:true,noCoordinator:true})}={}){
  const db=openDatabase(dbPath);
  try{
    migrate(db);
    const backfillDecision=shouldBackfillPiaRollingHistory(db);
    if(backfillDecision.attempt){
      markCollectorActivity({dbPath,nowMs:now.getTime()});
      await enterCollectorBarrier();
      try{
        const backfill=await backfillPiaRollingHistory(db,{rawRoot,fetchImpl,nowIso:now.toISOString(),minMachineCount});
        logger(JSON.stringify({level:'info',event:'pia_public_backfill_result',...backfill}));
      }finally{markCollectorActivity({dbPath,ttlMs:2_000})}
    }
    const decision=shouldAttemptPiaCollection(db,{now,targetHour,targetMinute,cooldownMs});
    if(!decision.attempt)return decision;
    markCollectorActivity({dbPath,nowMs:now.getTime()});
    await enterCollectorBarrier();
    try{
      const result=await collectPiaPublicOnce(db,{rawRoot,fetchImpl,nowIso:now.toISOString(),minMachineCount});
      logger(JSON.stringify({level:'info',event:'pia_public_collector_result',...result}));
      return {...decision,result};
    }finally{markCollectorActivity({dbPath,ttlMs:2_000})}
  }catch(error){
    logger(JSON.stringify({level:'error',event:'pia_public_collector_failed',message:String(error?.message??error)}));
    throw error;
  }finally{db.close()}
}

export function startPiaPublicCollectorScheduler({dbPath,rawRoot,fetchImpl=fetch,logger=()=>{},clock=()=>new Date(),intervalMs=5*60*1000,targetHour=6,targetMinute=10,cooldownMs=30*60*1000,minMachineCount=80,enterCollectorBarrier=async()=>({ok:true,noCoordinator:true})}={}){
  if(typeof dbPath!=='string'||!dbPath)throw new TypeError('dbPath is required');
  if(typeof rawRoot!=='string'||!rawRoot)throw new TypeError('rawRoot is required');
  let running=false,stopped=false;
  const tick=async()=>{
    if(stopped||running)return {attempt:false,reason:stopped?'stopped':'running'};
    running=true;
    try{return await runPiaCollectorTick({dbPath,rawRoot,fetchImpl,now:clock(),logger,targetHour,targetMinute,cooldownMs,minMachineCount,enterCollectorBarrier})}
    catch{return {attempt:true,reason:'failed'}}
    finally{running=false}
  };
  void tick();
  const timer=setInterval(()=>{void tick()},intervalMs);
  timer.unref?.();
  return {tick,stop(){stopped=true;clearInterval(timer)}};
}
