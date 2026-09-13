import {mkdirSync,readFileSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';

export const COLLECTOR_ACTIVITY_TTL_MS=60_000;

function requiredDbPath(value){
  const text=String(value??'').trim();
  if(!text)throw new TypeError('dbPath is required');
  return text;
}

export function collectorActivityPath(dbPath){
  return `${requiredDbPath(dbPath)}.collector-activity`;
}

export function markCollectorActivity({dbPath,nowMs=Date.now(),ttlMs=COLLECTOR_ACTIVITY_TTL_MS}={}){
  const target=collectorActivityPath(dbPath);
  if(!Number.isFinite(nowMs))throw new TypeError('nowMs must be finite');
  if(!Number.isFinite(ttlMs)||ttlMs<=0)throw new TypeError('ttlMs must be positive');
  const until=Math.trunc(nowMs+ttlMs);
  const dir=path.dirname(target);
  mkdirSync(dir,{recursive:true});
  const temp=`${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try{
    writeFileSync(temp,String(until),{encoding:'utf8',mode:0o600});
    renameSync(temp,target);
  }finally{
    try{rmSync(temp,{force:true})}catch{}
  }
  return until;
}

export function isCollectorActivityRecent({dbPath,nowMs=Date.now()}={}){
  const target=collectorActivityPath(dbPath);
  if(!Number.isFinite(nowMs))throw new TypeError('nowMs must be finite');
  try{
    const until=Number(readFileSync(target,'utf8').trim());
    return Number.isFinite(until)&&until>nowMs;
  }catch{
    return false;
  }
}
