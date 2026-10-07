import path from 'node:path';
import {existsSync,realpathSync} from 'node:fs';

export const DEFAULT_PACHINKO_DB='/var/lib/jugest/pachinko.sqlite';
export const DEFAULT_PACHINKO_ARCHIVE='/var/lib/jugest/pachinko-raw';

function flag(value,defaultValue=false){
  if(value===undefined||value===null||value==='')return defaultValue;
  return !['0','false','no','off'].includes(String(value).trim().toLowerCase());
}
function int(value,fallback,{min,max}){
  const n=value===undefined||value===null||value===''?fallback:Number(value);
  if(!Number.isSafeInteger(n)||n<min||n>max)throw new TypeError('invalid_pachinko_config_integer');
  return n;
}
function identity(value){
  const resolved=path.resolve(String(value));
  let cursor=resolved;const tail=[];
  while(!existsSync(cursor)){
    const parent=path.dirname(cursor);if(parent===cursor)break;
    tail.unshift(path.basename(cursor));cursor=parent;
  }
  try{return path.join(realpathSync(cursor),...tail)}catch{return resolved}
}
function overlaps(a,b){
  if(!a||!b)return false;
  a=identity(a);b=identity(b);
  if(a===b)return true;
  const ap=a.endsWith(path.sep)?a:`${a}${path.sep}`,bp=b.endsWith(path.sep)?b:`${b}${path.sep}`;
  return a.startsWith(bp)||b.startsWith(ap);
}

export function readPachinkoConfig(env=process.env,{canonicalDbPath=null,relayDbPath=null,rootDir=null}={}){
  const dbPath=path.resolve(String(env.JUGEST_PACHINKO_DB||DEFAULT_PACHINKO_DB));
  const archiveRoot=path.resolve(String(env.JUGEST_PACHINKO_RAW_ROOT||DEFAULT_PACHINKO_ARCHIVE));
  const collectorEnabled=flag(env.JUGEST_PACHINKO_COLLECTOR_ENABLED,false);
  const timeoutMs=int(env.JUGEST_PACHINKO_TIMEOUT_MS,20_000,{min:1_000,max:120_000});
  const retryMs=int(env.JUGEST_PACHINKO_RETRY_MS,30*60*1000,{min:30*60*1000,max:24*60*60*1000});
  const windowStartMinutes=int(env.JUGEST_PACHINKO_WINDOW_START_MINUTES,30,{min:0,max:1439});
  const windowEndMinutes=int(env.JUGEST_PACHINKO_WINDOW_END_MINUTES,360,{min:1,max:1440});
  if(windowEndMinutes<=windowStartMinutes)throw new TypeError('invalid_pachinko_collection_window');
  for(const other of [canonicalDbPath,relayDbPath,rootDir])if(other&&overlaps(dbPath,other))throw new Error('pachinko_database_path_collision');
  if(overlaps(archiveRoot,dbPath)||[canonicalDbPath,relayDbPath,rootDir].some(other=>other&&overlaps(archiveRoot,other)))throw new Error('pachinko_archive_path_collision');
  return {dbPath,archiveRoot,collectorEnabled,timeoutMs,retryMs,windowStartMinutes,windowEndMinutes};
}

export const __test={flag,int,identity,overlaps};
