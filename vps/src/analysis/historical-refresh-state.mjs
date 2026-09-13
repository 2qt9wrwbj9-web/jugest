import {enqueueJob} from '../queue.mjs';
import {loadStoreDays} from './store-data.mjs';
import {ensureHistoricalComparisonRun,getHistoricalComparisonRun} from '../research/historical-comparison.mjs';

export const HISTORICAL_JOB_PRIORITY=80;
export const HISTORICAL_JOB_LEASE_MIB=768;

function requiredText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function validIso(value){const text=requiredText(value,'nowIso');if(!Number.isFinite(Date.parse(text)))throw new TypeError('nowIso must be ISO date-time');return text}

export function requestHistoricalComparisonRefresh(db,{storeId,nowIso}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId'),at=validIso(nowIso),loaded=loadStoreDays(db,id,{limit:3660});
  if(loaded.days.length<8)return Object.freeze({run:null,job:null,skipped:'insufficient_history'});
  const run=ensureHistoricalComparisonRun(db,{storeId:id,days:loaded.days,nowIso:at});
  if(!run.nextTargetDate||run.state==='complete')return Object.freeze({run,job:null,skipped:'complete'});
  const key=`historical-compare:${id}:${run.id}:${run.nextTargetDate}`;
  const job=enqueueJob(db,{type:'HISTORICAL_COMPARE',priority:HISTORICAL_JOB_PRIORITY,idempotencyKey:key,payload:{storeId:id,runId:run.id,targetDate:run.nextTargetDate,replayVersion:run.replayVersion},sizeClass:'large',estimatedLeaseMiB:HISTORICAL_JOB_LEASE_MIB,maxAttempts:3,createdAtIso:at});
  return Object.freeze({run,job,skipped:null});
}

export function bootstrapHistoricalComparisonRuns(db,{nowIso}={}){
  if(!db?.prepare)throw new TypeError('db is required');const at=validIso(nowIso),stores=db.prepare('SELECT id FROM stores ORDER BY id').all();let requested=0,skipped=0;
  for(const row of stores){
    const existing=getHistoricalComparisonRun(db,{storeId:row.id});
    if(existing?.state==='complete'){skipped+=1;continue}
    try{const result=requestHistoricalComparisonRefresh(db,{storeId:row.id,nowIso:at});if(result.job)requested+=1;else skipped+=1}catch{skipped+=1}
  }
  return Object.freeze({requested,skipped});
}
