import {classifyPressure} from './memory.mjs';

function positive(value,name){if(!Number.isFinite(value)||value<=0)throw new TypeError(`${name} must be positive`)}
function clamp(value,min,max){return Math.min(max,Math.max(min,value));}

export function estimateLeaseMiB({persistedEwmaMiB,configuredFloorMiB,margin=1.25}={}){
  positive(configuredFloorMiB,'configuredFloorMiB');
  positive(margin,'margin');
  if(persistedEwmaMiB===null||persistedEwmaMiB===undefined)return Math.ceil(configuredFloorMiB);
  positive(persistedEwmaMiB,'persistedEwmaMiB');
  return Math.ceil(Math.max(configuredFloorMiB,persistedEwmaMiB*margin));
}

export function deriveHeapLimitMiB(leaseMiB){
  positive(leaseMiB,'leaseMiB');
  return clamp(Math.floor(leaseMiB*.65),96,768);
}

export function canAdmit({snapshot,policy,runningCount,leaseMiB,priority}={}){
  if(!Number.isInteger(runningCount)||runningCount<0)throw new TypeError('runningCount must be a non-negative integer');
  positive(leaseMiB,'leaseMiB');
  if(!Number.isInteger(priority))throw new TypeError('priority must be an integer');
  const pressure=classifyPressure(snapshot,policy);
  if(runningCount>=policy.maxAnalysisChildren)return Object.freeze({admit:false,reason:'max_children',pressure});
  if(pressure==='EMERGENCY')return Object.freeze({admit:false,reason:'emergency_pressure',pressure});
  if(pressure==='PAUSE')return Object.freeze({admit:false,reason:'pressure_pause',pressure});
  if(snapshot.effectiveAvailableMiB-leaseMiB<policy.hardReserveMiB)return Object.freeze({admit:false,reason:'hard_reserve',pressure});
  return Object.freeze({admit:true,reason:pressure==='CAUTION'?'fits_caution':'fits',pressure});
}

export function updateEwmaPeakMiB(previous,peak,alpha=.30){
  positive(peak,'peak');
  if(!Number.isFinite(alpha)||alpha<=0||alpha>1)throw new RangeError('alpha must be in (0, 1]');
  if(previous===null||previous===undefined)return peak;
  positive(previous,'previous');
  return previous*(1-alpha)+peak*alpha;
}

export function selectEmergencyVictims(children=[]){
  if(!Array.isArray(children))throw new TypeError('children must be an array');
  const rank={RESEARCH:0,FEATURE_BUILD:0,AXIS_DISCOVERY:0,BACKTEST:0,MODEL_SEARCH:0,BACKFILL:1};
  return children.filter(child=>Object.hasOwn(rank,child?.type)).map((child,index)=>({child,index})).sort((a,b)=>{
    const byType=rank[a.child.type]-rank[b.child.type];
    return byType||a.index-b.index;
  }).map(entry=>entry.child);
}
