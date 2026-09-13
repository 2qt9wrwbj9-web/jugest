import path from 'node:path';
import {openDatabase} from '../db.mjs';
import {migrate} from '../schema.mjs';
import {loadStoreDays} from '../analysis/store-data.mjs';
import {deriveStoreMachineCount} from '../analysis/task-metrics.mjs';
import {buildWalkForwardDataset,splitChronologicalSamples} from '../research/backtest.mjs';
import {discoverAxes} from '../research/axis-discovery.mjs';
import {searchModels} from '../research/model-search.mjs';
import {recordModelSearchCompletion} from '../analysis/research-cycle.mjs';
import {hashCanonical} from '../canonical-json.mjs';

const MIB=1024*1024;
const DEFAULT_DB='/var/lib/jugest/jugest.sqlite';
let peakRssMiB=process.memoryUsage().rss/MIB;
let startedAt=null,startRssMiB=null,cpuStart=null,taskMeta=null,heartbeat=null,announced=false;
function maxResourceRssMiB(){const value=Number(process.resourceUsage?.().maxRSS);return Number.isFinite(value)&&value>=0?value/1024:0}
function sample(){peakRssMiB=Math.max(peakRssMiB,process.memoryUsage().rss/MIB,maxResourceRssMiB());process.send?.({type:'heartbeat',rssMiB:peakRssMiB})}
function announce(meta){taskMeta=Object.freeze(meta);if(!announced){announced=true;process.send?.({type:'task_start',taskMeta})}}
function finishMetrics(){const endedAt=new Date().toISOString(),endRssMiB=process.memoryUsage().rss/MIB;peakRssMiB=Math.max(peakRssMiB,endRssMiB,maxResourceRssMiB());const cpu=cpuStart?process.cpuUsage(cpuStart):{user:0,system:0};return {phase:3,taskKind:'model_search',taskVersion:'store-read-model-v1',modelFingerprint:taskMeta?.modelFingerprint??null,storeId:taskMeta?.storeId??'',storeMachineCount:Number(taskMeta?.storeMachineCount)||0,dayCount:Number(taskMeta?.dayCount)||0,rowCount:Number(taskMeta?.rowCount)||0,workloadUnits:Number(taskMeta?.workloadUnits)||0,startedAt,endedAt,durationMs:startedAt?Math.max(0,Date.parse(endedAt)-Date.parse(startedAt)):0,startRssMiB,endRssMiB,peakRssMiB,cpuMs:(Number(cpu.user||0)+Number(cpu.system||0))/1000,details:taskMeta?.details??{}}}
function required(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function decode(){const encoded=process.argv[2];if(!encoded)throw new Error('missing job descriptor');return JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'))}
function loadModel(db,storeId,fingerprint){const row=db.prepare('SELECT model_json FROM research_model_registry WHERE store_id=? AND fingerprint=?').get(storeId,fingerprint);if(!row)throw Object.assign(new Error('research model missing'),{code:'research_model_missing'});return JSON.parse(row.model_json)}
function adaptiveMinSupport(sampleCount){return Math.max(8,Math.min(30,Math.floor(Math.max(1,sampleCount)*.02)))}

async function main(){
  const descriptor=decode();if(descriptor.type!=='MODEL_SEARCH')throw new Error(`unsupported job type: ${descriptor.type}`);
  const storeId=required(descriptor.payload?.storeId,'storeId'),featureVersion=required(descriptor.payload?.featureVersion,'featureVersion'),frontierDate=required(descriptor.payload?.frontierDate,'frontierDate'),championFingerprint=required(descriptor.payload?.modelFingerprint,'modelFingerprint'),round=Number(descriptor.payload?.round)||0;
  startedAt=new Date().toISOString();startRssMiB=process.memoryUsage().rss/MIB;cpuStart=process.cpuUsage();const db=openDatabase(path.resolve(process.env.JUGEST_DB_PATH||DEFAULT_DB));
  try{
    migrate(db);sample();heartbeat=setInterval(sample,4000);heartbeat.unref?.();
    const loaded=loadStoreDays(db,storeId,{limit:180}),eligible=loaded.days.filter(day=>String(day.date||'')<=frontierDate),scale=deriveStoreMachineCount(eligible),champion=loadModel(db,storeId,championFingerprint),dataset=buildWalkForwardDataset({storeId,days:eligible,minHistoryDays:4}),split=splitChronologicalSamples(dataset.samples);
    announce({phase:3,taskKind:'model_search',taskVersion:'store-read-model-v1',modelFingerprint:championFingerprint,storeId,storeMachineCount:scale.count,dayCount:eligible.length,rowCount:dataset.samples.length,workloadUnits:dataset.samples.length,startedAt,startRssMiB,details:{machineCountMethod:scale.method,frontierDate,round,holdoutSealed:true}});
    if(!split.train.length||!split.validation.length||!split.holdout.length){db.prepare("UPDATE research_loops SET state='idle',last_error='insufficient_data',updated_at=? WHERE store_id=?").run(new Date().toISOString(),storeId);sample();process.send?.({type:'complete',status:'insufficient_data',peakRssMiB,taskMetrics:finishMetrics(),axesDiscovered:0,candidatesEvaluated:0,promoted:false,nextJobId:null,resultHash:hashCanonical({storeId,championFingerprint,status:'insufficient_data'})});return}
    const minSupport=adaptiveMinSupport(split.train.length),axes=discoverAxes(split.train,{minSupport,maxAxes:32,fdrQ:.10,foldCount:4,maxPairSeeds:8}),search=searchModels({champion,axes,train:split.train,validation:split.validation,round,maxCandidates:128});
    const best=search.best;
    const completion=recordModelSearchCompletion(db,{storeId,frontierDate,championFingerprint,candidateModel:best?.model??null,improved:search.improved,validationScore:best?.validation?.top3Lift??search.baseline.top3Lift,scoreJson:{round,baseline:search.baseline,best:best?{fingerprint:best.model.fingerprint,train:best.train,validation:best.validation}:null,axesDiscovered:axes.length,candidatesEvaluated:search.candidatesEvaluated,minSupport},nowIso:new Date().toISOString()});
    sample();
    process.send?.({type:'complete',status:'searched',peakRssMiB,taskMetrics:finishMetrics(),axesDiscovered:axes.length,candidatesEvaluated:search.candidatesEvaluated,promoted:Boolean(completion.promotedFingerprint),candidateFingerprint:best?.model?.fingerprint??null,converged:Boolean(completion.converged),convergenceReason:completion.reason??null,nextJobId:completion.job?.id??null,resultHash:hashCanonical({storeId,championFingerprint,round,axes:axes.map(axis=>axis.id),search:{baseline:search.baseline,best:best?{fingerprint:best.model.fingerprint,validation:best.validation}:null,improved:search.improved},completion:{promotedFingerprint:completion.promotedFingerprint??null,converged:Boolean(completion.converged),reason:completion.reason??null}})});
  }finally{if(heartbeat)clearInterval(heartbeat);try{db.close()}catch{}}
}

main().then(()=>process.exit(0)).catch(error=>{peakRssMiB=Math.max(peakRssMiB,process.memoryUsage().rss/MIB,maxResourceRssMiB());if(!taskMeta&&startedAt){try{const d=decode();announce({phase:3,taskKind:'model_search',taskVersion:'store-read-model-v1',modelFingerprint:String(d.payload?.modelFingerprint||''),storeId:String(d.payload?.storeId||''),storeMachineCount:0,dayCount:0,rowCount:0,workloadUnits:0,startedAt,startRssMiB,details:{frontierDate:String(d.payload?.frontierDate||''),round:Number(d.payload?.round)||0}})}catch{}}process.send?.({type:'error',peakRssMiB,taskMetrics:finishMetrics(),errorClass:error?.code||'model_search_error',message:String(error?.message??error)},()=>process.exit(1));if(!process.connected)process.exit(1)});
