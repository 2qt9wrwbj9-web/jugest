import {hashCanonical} from '../canonical-json.mjs';

export const OUTCOME_PROXY_VERSION='canonical-diff-proxy-v1';
export const DATASET_VERSION='walk-forward-v1';

function text(value){return String(value??'').trim()}
function finite(value){const n=Number(value);return Number.isFinite(n)?n:null}
function tableNo(machine,index){return text(machine?.tableNo??machine?.table_no??machine?.machineKey??machine?.machine_key??index)}
function machineName(machine){return text(machine?.sourceMachineName??machine?.machineName??machine?.machine??machine?.category??'unknown')||'unknown'}
function lastDigit(value){const match=String(value).match(/(\d)(?!.*\d)/);return match?match[1]:'other'}
function weekday(date){return String(new Date(`${date}T00:00:00Z`).getUTCDay())}
function mean(values){const xs=values.filter(Number.isFinite);return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null}
function rate(values,predicate){const xs=values.filter(Number.isFinite);return xs.length?xs.filter(predicate).length/xs.length:null}

function normalizeDays(days){
  return [...(Array.isArray(days)?days:[])]
    .filter(day=>day&&/^\d{4}-\d{2}-\d{2}$/.test(String(day.date||'')))
    .map(day=>({date:String(day.date),machines:[...(Array.isArray(day.machines)?day.machines:[])].map((machine,index)=>({
      ...machine,
      __tableNo:tableNo(machine,index),
      __machineName:machineName(machine)
    }))}))
    .sort((a,b)=>a.date.localeCompare(b.date));
}

function historicalMachineFeatures(historyDays,targetMachine){
  const key=targetMachine.__tableNo;
  const records=[];
  for(const day of historyDays){
    const row=day.machines.find(machine=>machine.__tableNo===key);
    if(row)records.push({date:day.date,games:finite(row.games),bb:finite(row.bb),rb:finite(row.rb),diff:finite(row.diff)});
  }
  const features={};
  for(const windowDays of [1,3,7,14,30,90,180]){
    const rows=records.slice(-windowDays);
    const games=rows.map(row=>row.games),diffs=rows.map(row=>row.diff),bbs=rows.map(row=>row.bb),rbs=rows.map(row=>row.rb);
    const gameSum=games.filter(Number.isFinite).reduce((a,b)=>a+b,0);
    const bbSum=bbs.filter(Number.isFinite).reduce((a,b)=>a+b,0);
    const rbSum=rbs.filter(Number.isFinite).reduce((a,b)=>a+b,0);
    features[`hist_${windowDays}_games_mean`]=mean(games);
    features[`hist_${windowDays}_diff_mean`]=mean(diffs);
    features[`hist_${windowDays}_positive_diff_rate`]=rate(diffs,value=>value>0);
    features[`hist_${windowDays}_bb_per_game`]=gameSum>0?bbSum/gameSum:null;
    features[`hist_${windowDays}_rb_per_game`]=gameSum>0?rbSum/gameSum:null;
    features[`hist_${windowDays}_observed_days`]=rows.length;
  }
  return features;
}

function storeHistoryFeatures(historyDays){
  const out={};
  for(const windowDays of [3,7,14,30]){
    const days=historyDays.slice(-windowDays);
    const diffs=[];
    for(const day of days)for(const machine of day.machines){const value=finite(machine.diff);if(value!==null)diffs.push(value)}
    out[`store_${windowDays}_positive_diff_rate`]=rate(diffs,value=>value>0);
    out[`store_${windowDays}_diff_mean`]=mean(diffs);
  }
  return out;
}

function targetRowsForDay({storeId,targetDay,historyDays,strongFraction}){
  const raw=targetDay.machines.map((machine,index)=>({
    storeId,
    targetDate:targetDay.date,
    machineKey:machine.__tableNo||String(index),
    tableNo:machine.__tableNo||String(index),
    machineName:machine.__machineName,
    outcomeScore:finite(machine.diff),
    features:Object.freeze({
      weekday:weekday(targetDay.date),
      date_last_digit:lastDigit(targetDay.date),
      machine_name:machine.__machineName,
      table_no:machine.__tableNo||String(index),
      table_last_digit:lastDigit(machine.__tableNo||String(index)),
      ...historicalMachineFeatures(historyDays,machine),
      ...storeHistoryFeatures(historyDays)
    })
  })).filter(row=>Number.isFinite(row.outcomeScore));
  const ranked=[...raw].sort((a,b)=>b.outcomeScore-a.outcomeScore||a.machineKey.localeCompare(b.machineKey));
  const strongCount=Math.max(1,Math.ceil(ranked.length*strongFraction));
  const strongKeys=new Set(ranked.slice(0,strongCount).map(row=>row.machineKey));
  return raw.map(row=>Object.freeze({...row,strong:strongKeys.has(row.machineKey),outcomeProxyVersion:OUTCOME_PROXY_VERSION}));
}

export function buildWalkForwardDataset({storeId,days,minHistoryDays=4,strongFraction=.20}={}){
  const id=text(storeId);if(!id)throw new TypeError('storeId is required');
  if(!Number.isInteger(minHistoryDays)||minHistoryDays<1)throw new TypeError('minHistoryDays must be a positive integer');
  if(!Number.isFinite(strongFraction)||strongFraction<=0||strongFraction>=1)throw new TypeError('strongFraction must be in (0,1)');
  const ordered=normalizeDays(days),samples=[];
  for(let index=minHistoryDays;index<ordered.length;index+=1){
    const targetDay=ordered[index];
    const historyDays=ordered.slice(0,index); // strictly before target day
    samples.push(...targetRowsForDay({storeId:id,targetDay,historyDays,strongFraction}));
  }
  const inputHash=hashCanonical({datasetVersion:DATASET_VERSION,outcomeProxyVersion:OUTCOME_PROXY_VERSION,storeId:id,minHistoryDays,strongFraction,samples});
  return Object.freeze({datasetVersion:DATASET_VERSION,outcomeProxyVersion:OUTCOME_PROXY_VERSION,storeId:id,minHistoryDays,strongFraction,samples:Object.freeze(samples),inputHash});
}

function rowsForDates(samples,dateSet){return samples.filter(sample=>dateSet.has(sample.targetDate))}

export function splitChronologicalSamples(samples,{trainRatio=.60,validationRatio=.20}={}){
  if(!Array.isArray(samples))throw new TypeError('samples must be an array');
  const dates=[...new Set(samples.map(sample=>String(sample.targetDate||'')).filter(Boolean))].sort();
  if(dates.length<3)return Object.freeze({trainDates:dates,validationDates:[],holdoutDates:[],train:[...samples],validation:[],holdout:[]});
  let trainCount=Math.floor(dates.length*trainRatio);
  let validationCount=Math.floor(dates.length*validationRatio);
  trainCount=Math.max(1,Math.min(trainCount,dates.length-2));
  validationCount=Math.max(1,Math.min(validationCount,dates.length-trainCount-1));
  const trainDates=dates.slice(0,trainCount);
  const validationDates=dates.slice(trainCount,trainCount+validationCount);
  const holdoutDates=dates.slice(trainCount+validationCount);
  const trainSet=new Set(trainDates),validationSet=new Set(validationDates),holdoutSet=new Set(holdoutDates);
  return Object.freeze({
    trainDates:Object.freeze(trainDates),validationDates:Object.freeze(validationDates),holdoutDates:Object.freeze(holdoutDates),
    train:Object.freeze(rowsForDates(samples,trainSet)),validation:Object.freeze(rowsForDates(samples,validationSet)),holdout:Object.freeze(rowsForDates(samples,holdoutSet))
  });
}

export const __test={normalizeDays,historicalMachineFeatures,storeHistoryFeatures,targetRowsForDay,lastDigit,weekday};
