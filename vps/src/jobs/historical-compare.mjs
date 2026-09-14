import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {openDatabase} from '../db.mjs';
import {migrate} from '../schema.mjs';
import {requestHistoricalComparisonRefresh} from '../analysis/historical-refresh-state.mjs';
import {advanceHistoricalCursor,compareHistoricalTarget,getHistoricalComparisonRun,loadHistoricalRunSnapshot,persistHistoricalComparisonDay} from '../research/historical-comparison.mjs';
import {SCORER_VERSION} from '../research/live-comparison.mjs';
import {deriveStoreMachineCount} from '../analysis/task-metrics.mjs';
import {hashCanonical} from '../canonical-json.mjs';

function decodeDescriptor(raw){
  if(!raw)throw new TypeError('job descriptor is required');let value;
  try{value=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'))}catch{throw new TypeError('invalid job descriptor')}
  if(!Number.isInteger(value?.id)||value?.type!=='HISTORICAL_COMPARE')throw new TypeError('HISTORICAL_COMPARE descriptor is required');return value;
}
function requiredText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function rssMiB(){return process.memoryUsage().rss/(1024*1024)}
function startHeartbeat(){const send=()=>process.send?.({type:'heartbeat',rssMiB:rssMiB(),at:new Date().toISOString()});send();const timer=setInterval(send,1000);timer.unref?.();return timer}
function nextTarget(days,target,snapshotLastDate){const eligible=days.filter(day=>day.date<=snapshotLastDate),index=eligible.findIndex(day=>day.date===target);return index>=0&&index+1<eligible.length?eligible[index+1].date:null}

export async function executeHistoricalCompare({dbPath,job,rootDir=fileURLToPath(new URL('../../..',import.meta.url)),now=()=>new Date()}={}){
  if(!job||job.type!=='HISTORICAL_COMPARE')throw new TypeError('HISTORICAL_COMPARE job is required');
  const payload=job.payload||{},storeId=requiredText(payload.storeId,'job.payload.storeId'),runId=Number(payload.runId),targetDate=requiredText(payload.targetDate,'job.payload.targetDate');
  if(!Number.isInteger(runId)||runId<1)throw new TypeError('job.payload.runId must be a positive integer');
  if(!fs.existsSync(rootDir))throw new Error(`JUGEST web root not found: ${rootDir}`);
  const db=openDatabase(dbPath);try{
    migrate(db);const run=getHistoricalComparisonRun(db,{storeId,runId});if(!run)return {status:'stale',storeId,runId,targetDate,outputHash:hashCanonical({status:'missing_run',storeId,runId,targetDate})};
    if(run.state==='stale'||run.state==='complete'||run.nextTargetDate!==targetDate)return {status:'stale',storeId,runId,targetDate,outputHash:hashCanonical({status:'cursor_moved',storeId,runId,targetDate,current:run.nextTargetDate})};
    const snapshotDays=loadHistoricalRunSnapshot(db,{runId});
    if(!snapshotDays.length)return {status:'stale',storeId,runId,targetDate,outputHash:hashCanonical({status:'missing_snapshot',storeId,runId,targetDate})};
    const store=db.prepare('SELECT name FROM stores WHERE id=?').get(storeId);if(!store?.name)throw new Error(`historical store missing: ${storeId}`);
    const nowIso=now().toISOString(),machineScale=deriveStoreMachineCount(snapshotDays),rowCount=snapshotDays.reduce((sum,day)=>sum+(Array.isArray(day.machines)?day.machines.length:0),0);
    process.send?.({type:'task_start',taskMeta:{taskKind:'HISTORICAL_COMPARE',phase:3,taskVersion:run.replayVersion,storeId,modelFingerprint:run.preFingerprint||null,storeMachineCount:machineScale.count,machineCountMethod:machineScale.method,dayCount:snapshotDays.length,rowCount,workloadUnits:rowCount,details:{runId,targetDate}}});
    const result=await compareHistoricalTarget({rootDir,storeId,shop:store.name,days:snapshotDays,targetDate,preState:run.preState});
    const next=nextTarget(snapshotDays,targetDate,run.snapshotLastDate);
    let advanced;
    db.exec('BEGIN IMMEDIATE');
    try{
      persistHistoricalComparisonDay(db,{runId,storeId,targetDate,prePrediction:result.prePrediction,currentPrediction:result.currentPrediction,outcomeInputHash:result.outcomeInputHash??result.preScore?.outcomeInputHash??null,preMetrics:result.preScore?.metrics??null,currentMetrics:result.currentScore?.metrics??null,winner:result.winner,excludedReason:result.excludedReason,preState:result.preState,scorerVersion:SCORER_VERSION,createdAt:nowIso});
      advanced=advanceHistoricalCursor(db,{runId,nextTargetDate:next,processedDelta:1,scoredDelta:result.excludedReason?0:1,excludedDelta:result.excludedReason?1:0,preState:result.preState,nowIso});
      db.exec('COMMIT');
    }catch(error){try{db.exec('ROLLBACK')}catch{}throw error}
    const refresh=requestHistoricalComparisonRefresh(db,{storeId,nowIso}),followupJobId=refresh.job?.id??null;
    return {status:result.excludedReason?'excluded':'scored',storeId,runId,targetDate,nextTargetDate:advanced.nextTargetDate,followupJobId,winner:result.winner,excludedReason:result.excludedReason,outputHash:hashCanonical({runId,storeId,targetDate,winner:result.winner,excludedReason:result.excludedReason,nextTargetDate:advanced.nextTargetDate})};
  }finally{db.close()}
}

async function main(){
  const descriptor=decodeDescriptor(process.argv[2]),dbPath=process.env.JUGEST_DB_PATH||'/var/lib/jugest/jugest.sqlite',rootDir=process.env.JUGEST_WEB_ROOT||fileURLToPath(new URL('../../..',import.meta.url));
  const heartbeat=startHeartbeat(),startedAt=Date.now(),startRssMiB=rssMiB();let peakRssMiB=startRssMiB;const sample=setInterval(()=>{peakRssMiB=Math.max(peakRssMiB,rssMiB())},100);sample.unref?.();
  try{const result=await executeHistoricalCompare({dbPath,job:descriptor,rootDir});peakRssMiB=Math.max(peakRssMiB,rssMiB());process.send?.({type:'complete',...result,resultHash:result.outputHash,durationMs:Date.now()-startedAt,startRssMiB,peakRssMiB,endRssMiB:rssMiB()})}
  finally{clearInterval(heartbeat);clearInterval(sample)}
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])main().catch(error=>{process.send?.({type:'error',message:String(error?.message||error),errorClass:String(error?.code||error?.name||'historical_compare_error'),rssMiB:rssMiB()});process.exitCode=1});

export const __test={decodeDescriptor,nextTarget};
