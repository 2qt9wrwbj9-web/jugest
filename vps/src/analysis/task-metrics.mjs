import {canonicalJson} from '../canonical-json.mjs';

function requireDb(db){if(!db?.prepare)throw new TypeError('db is required')}
function requiredText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function nonNegativeInt(value,name){const n=Number(value);if(!Number.isFinite(n)||n<0)throw new TypeError(`${name} must be non-negative`);return Math.trunc(n)}
function nullableNumber(value,name){if(value==null)return null;const n=Number(value);if(!Number.isFinite(n)||n<0)throw new TypeError(`${name} must be null or non-negative`);return n}
function validIso(value,name){const text=requiredText(value,name);if(!Number.isFinite(Date.parse(text)))throw new TypeError(`${name} must be ISO date-time`);return text}

export function sizeBucket(machineCount){
  const v=Math.max(0,Math.trunc(Number(machineCount)||0));
  if(v<=100)return '1-100';
  if(v<=200)return '101-200';
  if(v<=300)return '201-300';
  if(v<=500)return '301-500';
  return '501+';
}

function machineIdentity(machine,index){
  const tableNo=String(machine?.tableNo??'').trim();
  if(tableNo)return `table:${tableNo}`;
  const machineKey=String(machine?.machineKey??machine?.machine_key??'').trim();
  if(machineKey)return `key:${machineKey}`;
  return `index:${index}`;
}

function uniqueMachineCount(day){
  const machines=Array.isArray(day?.machines)?day.machines:[];
  return new Set(machines.map((machine,index)=>machineIdentity(machine,index))).size;
}

export function deriveStoreMachineCount(days){
  const ordered=[...(Array.isArray(days)?days:[])].filter(Boolean);
  const latest=ordered.at(-1);
  const latestCount=uniqueMachineCount(latest);
  if(latestCount>0)return {count:latestCount,method:'latest'};
  const counts=ordered.slice(-7).map(uniqueMachineCount).filter(n=>n>0).sort((a,b)=>a-b);
  const count=counts.length?counts[Math.floor((counts.length-1)/2)]:0;
  return {count,method:'median7'};
}

export function persistTaskMetric(db,metric={}){
  requireDb(db);
  const jobId=metric.jobId==null?null:nonNegativeInt(metric.jobId,'jobId');
  const storeId=requiredText(metric.storeId,'storeId');
  const phase=nonNegativeInt(metric.phase,'phase');
  if(![1,2,3].includes(phase))throw new TypeError('phase must be 1, 2, or 3');
  const taskKind=requiredText(metric.taskKind,'taskKind');
  const taskVersion=requiredText(metric.taskVersion,'taskVersion');
  const modelFingerprint=metric.modelFingerprint==null?null:String(metric.modelFingerprint);
  const storeMachineCount=nonNegativeInt(metric.storeMachineCount,'storeMachineCount');
  const dayCount=nonNegativeInt(metric.dayCount,'dayCount');
  const rowCount=nonNegativeInt(metric.rowCount,'rowCount');
  const workloadUnits=nonNegativeInt(metric.workloadUnits,'workloadUnits');
  const startedAt=validIso(metric.startedAt,'startedAt');
  const endedAt=validIso(metric.endedAt,'endedAt');
  const durationMs=nonNegativeInt(metric.durationMs,'durationMs');
  const startRssMiB=nullableNumber(metric.startRssMiB,'startRssMiB');
  const endRssMiB=nullableNumber(metric.endRssMiB,'endRssMiB');
  const peakRssMiB=nullableNumber(metric.peakRssMiB,'peakRssMiB');
  const cpuMs=nullableNumber(metric.cpuMs,'cpuMs');
  const status=requiredText(metric.status,'status');
  if(!['succeeded','failed','cancelled'].includes(status))throw new TypeError('invalid status');
  const errorClass=metric.errorClass==null?null:String(metric.errorClass);
  const detailsJson=canonicalJson(metric.details&&typeof metric.details==='object'?metric.details:{});
  const inserted=db.prepare(`INSERT INTO analysis_task_metrics(
    job_id,store_id,phase,task_kind,task_version,model_fingerprint,store_machine_count,store_size_bucket,
    day_count,row_count,workload_units,started_at,ended_at,duration_ms,start_rss_mib,end_rss_mib,peak_rss_mib,cpu_ms,status,error_class,details_json
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    jobId,storeId,phase,taskKind,taskVersion,modelFingerprint,storeMachineCount,sizeBucket(storeMachineCount),
    dayCount,rowCount,workloadUnits,startedAt,endedAt,durationMs,startRssMiB,endRssMiB,peakRssMiB,cpuMs,status,errorClass,detailsJson
  );
  return Number(inserted.lastInsertRowid);
}

export const __test={uniqueMachineCount,machineIdentity};
