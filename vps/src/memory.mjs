import {readFile as fsReadFile} from 'node:fs/promises';
import {DEFAULT_RESOURCE_POLICY} from './config.mjs';

const MIB=1024*1024;

function toMiBFromKb(value){return value/1024;}
function clamp01(value){return Math.min(1,Math.max(0,value));}

export function parseMemInfo(text){
  if(typeof text!=='string')throw new TypeError('meminfo must be text');
  const values={};
  for(const line of text.split(/\r?\n/)){
    const match=/^([A-Za-z_()]+):\s+(\d+)\s+kB\s*$/.exec(line.trim());
    if(match)values[match[1]]=Number(match[2]);
  }
  for(const required of ['MemTotal','MemAvailable']){
    if(!Number.isFinite(values[required]))throw new TypeError(`meminfo missing ${required}`);
  }
  const swapTotal=Number.isFinite(values.SwapTotal)?values.SwapTotal:0;
  const swapFree=Number.isFinite(values.SwapFree)?values.SwapFree:0;
  return Object.freeze({
    memTotalMiB:toMiBFromKb(values.MemTotal),
    memAvailableMiB:toMiBFromKb(values.MemAvailable),
    swapTotalMiB:toMiBFromKb(swapTotal),
    swapFreeMiB:toMiBFromKb(swapFree),
    swapUsedMiB:toMiBFromKb(Math.max(0,swapTotal-swapFree))
  });
}

export function parseCgroupLimit(text){
  if(typeof text!=='string')throw new TypeError('cgroup limit must be text');
  const value=text.trim();
  if(value==='max')return null;
  if(!/^\d+$/.test(value))throw new TypeError('cgroup limit must be bytes or max');
  const bytes=Number(value);
  if(!Number.isFinite(bytes)||bytes<0)throw new TypeError('cgroup limit is invalid');
  return bytes/MIB;
}

function parseCgroupCurrent(text){
  if(typeof text!=='string'||!/^\d+\s*$/.test(text))throw new TypeError('cgroup current must be bytes');
  return Number(text.trim())/MIB;
}

async function optionalRead(readFile,path){
  try{return await readFile(path,'utf8');}
  catch(error){
    if(error?.code==='ENOENT'||error?.code==='EACCES'||error?.code==='ENOTDIR')return null;
    throw error;
  }
}

export async function readMemorySnapshot({readFile=fsReadFile}={}){
  const mem=parseMemInfo(await readFile('/proc/meminfo','utf8'));
  const [currentText,maxText]=await Promise.all([
    optionalRead(readFile,'/sys/fs/cgroup/memory.current'),
    optionalRead(readFile,'/sys/fs/cgroup/memory.max')
  ]);
  const cgroupCurrentMiB=currentText===null?null:parseCgroupCurrent(currentText);
  const cgroupLimitMiB=maxText===null?null:parseCgroupLimit(maxText);
  const effectiveLimitMiB=cgroupLimitMiB??mem.memTotalMiB;
  let effectiveAvailableMiB=mem.memAvailableMiB;
  let usedRatio=1-(mem.memAvailableMiB/mem.memTotalMiB);
  if(cgroupLimitMiB!==null&&cgroupCurrentMiB!==null){
    const cgroupRemaining=Math.max(0,cgroupLimitMiB-cgroupCurrentMiB);
    effectiveAvailableMiB=Math.min(mem.memAvailableMiB,cgroupRemaining);
    usedRatio=cgroupLimitMiB===0?1:cgroupCurrentMiB/cgroupLimitMiB;
  }
  return Object.freeze({
    hostTotalMiB:mem.memTotalMiB,
    hostAvailableMiB:mem.memAvailableMiB,
    cgroupLimitMiB,
    cgroupCurrentMiB,
    effectiveLimitMiB,
    effectiveAvailableMiB,
    usedRatio:clamp01(usedRatio),
    swapUsedMiB:mem.swapUsedMiB
  });
}

export function classifyPressure(snapshot,policy=DEFAULT_RESOURCE_POLICY){
  if(!snapshot||!Number.isFinite(snapshot.usedRatio)||!Number.isFinite(snapshot.effectiveAvailableMiB))throw new TypeError('valid memory snapshot required');
  if(snapshot.effectiveAvailableMiB<policy.emergencyReserveMiB||snapshot.usedRatio>=policy.emergencyUsedRatio)return'EMERGENCY';
  if(snapshot.usedRatio>=policy.pauseUsedRatio)return'PAUSE';
  if(snapshot.usedRatio>=policy.cautionUsedRatio)return'CAUTION';
  return'NORMAL';
}
