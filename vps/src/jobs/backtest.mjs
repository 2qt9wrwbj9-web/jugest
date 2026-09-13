import path from 'node:path';
import {openDatabase} from '../db.mjs';
import {migrate} from '../schema.mjs';
import {loadStoreDays} from '../analysis/store-data.mjs';
import {deriveStoreMachineCount} from '../analysis/task-metrics.mjs';
import {buildWalkForwardDataset,splitChronologicalSamples} from '../research/backtest.mjs';
import {evaluateModel,scoreSample} from '../research/model-search.mjs';
import {recordBacktestCompletion} from '../analysis/research-cycle.mjs';
import {canonicalJson,hashCanonical} from '../canonical-json.mjs';

const MIB=1024*1024;
const DEFAULT_DB='/var/lib/jugest/jugest.sqlite';
let peakRssMiB=process.memoryUsage().rss/MIB;
let startedAt=null,startRssMiB=null,cpuStart=null,taskMeta=null,heartbeat=null,announced=false;

function maxResourceRssMiB(){const value=Number(process.resourceUsage?.().maxRSS);return Number.isFinite(value)&&value>=0?value/1024:0}
function sample(){peakRssMiB=Math.max(peakRssMiB,process.memoryUsage().rss/MIB,maxResourceRssMiB());process.send?.({type:'heartbeat',rssMiB:peakRssMiB})}
function announce(meta){taskMeta=Object.freeze(meta);if(!announced){announced=true;process.send?.({type:'task_start',taskMeta})}}
function finishMetrics(){const endedAt=new Date().toISOString(),endRssMiB=process.memoryUsage().rss/MIB;peakRssMiB=Math.max(peakRssMiB,endRssMiB,maxResourceRssMiB());const cpu=cpuStart?process.cpuUsage(cpuStart):{user:0,system:0};return {phase:2,taskKind:'backtest',taskVersion:'walk-forward-v1',modelFingerprint:taskMeta?.modelFingerprint??null,storeId:taskMeta?.storeId??'',storeMachineCount:Number(taskMeta?.storeMachineCount)||0,dayCount:Number(taskMeta?.dayCount)||0,rowCount:Number(taskMeta?.rowCount)||0,workloadUnits:Number(taskMeta?.workloadUnits)||0,startedAt,endedAt,durationMs:startedAt?Math.max(0,Date.parse(endedAt)-Date.parse(startedAt)):0,startRssMiB,endRssMiB,peakRssMiB,cpuMs:(Number(cpu.user||0)+Number(cpu.system||0))/1000,details:taskMeta?.details??{}}}
function required(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function decode(){const encoded=process.argv[2];if(!encoded)throw new Error('missing job descriptor');return JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'))}
function modelRow(db,storeId,fingerprint){const row=db.prepare('SELECT model_json FROM research_model_registry WHERE store_id=? AND fingerprint=?').get(storeId,fingerprint);if(!row)throw Object.assign(new Error('research model missing'),{code:'research_model_missing'});return JSON.parse(row.model_json)}
function rankSplit(rows,model){
  const byDate=new Map();for(const row of rows){if(!byDate.has(row.targetDate))byDate.set(row.targetDate,[]);byDate.get(row.targetDate).push(row)}
  const ranked=[];for(const targetDate of [...byDate.keys()].sort()){const day=[...byDate.get(targetDate)].map(row=>({...row,predictionScore:scoreSample(row,model)})).sort((a,b)=>b.predictionScore-a.predictionScore||a.machineKey.localeCompare(b.machineKey));day.forEach((row,index)=>ranked.push({...row,rank:index+1}))}return ranked;
}
function persistSplit(db,{storeId,modelFingerprint,model,featureVersion,splitKind,rows,score,inputHash,createdAt}){
  if(!rows.length)return null;
  const dates=[...new Set(rows.map(row=>row.targetDate))].sort(),fromDate=dates[0],toDate=dates.at(-1);
  let existing=db.prepare(`SELECT id FROM backtest_runs WHERE store_id=? AND model_fingerprint=? AND feature_version=? AND split_kind=? AND input_hash=? LIMIT 1`).get(storeId,modelFingerprint,featureVersion,splitKind,inputHash);
  let runId;
  if(existing){runId=Number(existing.id);db.prepare('DELETE FROM backtest_predictions WHERE run_id=?').run(runId);db.prepare(`UPDATE backtest_runs SET model_json=?,from_date=?,to_date=?,prediction_count=?,score_json=?,created_at=? WHERE id=?`).run(canonicalJson(model),fromDate,toDate,rows.length,canonicalJson(score),createdAt,runId)}
  else{const out=db.prepare(`INSERT INTO backtest_runs(store_id,model_fingerprint,model_json,feature_version,split_kind,from_date,to_date,prediction_count,score_json,input_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(storeId,modelFingerprint,canonicalJson(model),featureVersion,splitKind,fromDate,toDate,rows.length,canonicalJson(score),inputHash,createdAt);runId=Number(out.lastInsertRowid)}
  const insert=db.prepare('INSERT INTO backtest_predictions(run_id,target_date,machine_key,rank,score,outcome_score,details_json) VALUES(?,?,?,?,?,?,?)');
  for(const row of rankSplit(rows,model))insert.run(runId,row.targetDate,row.machineKey,row.rank,row.predictionScore,row.outcomeScore,canonicalJson({strong:Boolean(row.strong),outcomeProxyVersion:row.outcomeProxyVersion}));
  return runId;
}

async function main(){
  const descriptor=decode();if(descriptor.type!=='BACKTEST')throw new Error(`unsupported job type: ${descriptor.type}`);
  const storeId=required(descriptor.payload?.storeId,'storeId'),featureVersion=required(descriptor.payload?.featureVersion,'featureVersion'),frontierDate=required(descriptor.payload?.frontierDate,'frontierDate'),modelFingerprint=required(descriptor.payload?.modelFingerprint,'modelFingerprint');
  startedAt=new Date().toISOString();startRssMiB=process.memoryUsage().rss/MIB;cpuStart=process.cpuUsage();const db=openDatabase(path.resolve(process.env.JUGEST_DB_PATH||DEFAULT_DB));
  try{
    migrate(db);sample();heartbeat=setInterval(sample,4000);heartbeat.unref?.();
    const loaded=loadStoreDays(db,storeId,{limit:180}),eligible=loaded.days.filter(day=>String(day.date||'')<=frontierDate),scale=deriveStoreMachineCount(eligible),rawRows=eligible.reduce((sum,day)=>sum+(day.machines?.length||0),0),model=modelRow(db,storeId,modelFingerprint);
    const dataset=buildWalkForwardDataset({storeId,days:eligible,minHistoryDays:4}),split=splitChronologicalSamples(dataset.samples);
    announce({phase:2,taskKind:'backtest',taskVersion:dataset.datasetVersion,modelFingerprint,storeId,storeMachineCount:scale.count,dayCount:eligible.length,rowCount:dataset.samples.length,workloadUnits:dataset.samples.length,startedAt,startRssMiB,details:{machineCountMethod:scale.method,frontierDate,canonicalRows:rawRows,outcomeProxyVersion:dataset.outcomeProxyVersion}});
    if(!split.train.length||!split.validation.length||!split.holdout.length){db.prepare("UPDATE research_loops SET state='idle',last_error='insufficient_data',updated_at=? WHERE store_id=?").run(new Date().toISOString(),storeId);sample();process.send?.({type:'complete',status:'insufficient_data',peakRssMiB,taskMetrics:finishMetrics(),nextJobId:null,resultHash:hashCanonical({storeId,modelFingerprint,status:'insufficient_data',inputHash:dataset.inputHash})});return}
    const trainScore=evaluateModel(split.train,model),validationScore=evaluateModel(split.validation,model),createdAt=new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try{
      persistSplit(db,{storeId,modelFingerprint,model,featureVersion,splitKind:'train',rows:split.train,score:trainScore,inputHash:hashCanonical({dataset:dataset.inputHash,split:'train',dates:split.trainDates}),createdAt});
      persistSplit(db,{storeId,modelFingerprint,model,featureVersion,splitKind:'validation',rows:split.validation,score:validationScore,inputHash:hashCanonical({dataset:dataset.inputHash,split:'validation',dates:split.validationDates}),createdAt});
      db.exec('COMMIT');
    }catch(error){try{db.exec('ROLLBACK')}catch{}throw error}
    const next=recordBacktestCompletion(db,{storeId,frontierDate,modelFingerprint,nowIso:new Date().toISOString()});sample();
    process.send?.({type:'complete',status:'backtested',peakRssMiB,taskMetrics:finishMetrics(),nextJobId:next.job?.id??null,resultHash:hashCanonical({storeId,modelFingerprint,datasetHash:dataset.inputHash,trainScore,validationScore})});
  }finally{if(heartbeat)clearInterval(heartbeat);try{db.close()}catch{}}
}

main().then(()=>process.exit(0)).catch(error=>{peakRssMiB=Math.max(peakRssMiB,process.memoryUsage().rss/MIB,maxResourceRssMiB());if(!taskMeta&&startedAt){try{const d=decode();announce({phase:2,taskKind:'backtest',taskVersion:'walk-forward-v1',modelFingerprint:String(d.payload?.modelFingerprint||''),storeId:String(d.payload?.storeId||''),storeMachineCount:0,dayCount:0,rowCount:0,workloadUnits:0,startedAt,startRssMiB,details:{frontierDate:String(d.payload?.frontierDate||'')}})}catch{}}process.send?.({type:'error',peakRssMiB,taskMetrics:finishMetrics(),errorClass:error?.code||'backtest_error',message:String(error?.message??error)},()=>process.exit(1));if(!process.connected)process.exit(1)});
