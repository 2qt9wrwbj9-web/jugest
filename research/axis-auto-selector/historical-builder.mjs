import {createHash} from 'node:crypto';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const deepFreeze=value=>{
 if(value===null||typeof value!=='object'||Object.isFrozen(value))return value;
 for(const key of Reflect.ownKeys(value))deepFreeze(value[key]);
 return Object.freeze(value);
};
function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(`${value}T00:00:00Z`);
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function requireDate(value,field){if(value!==undefined&&value!==null&&!validDate(value))throw new TypeError(`${field} must be a valid YYYY-MM-DD date`)}
function requireStore(store){if(typeof store!=='string'||store.trim()==='')throw new TypeError('store must be a non-empty string');return store}
function requireRuntime(runtime){
 for(const method of ['normalizeDay','ensureExternalJudgedSync','predictStore'])if(typeof runtime?.[method]!=='function')throw new TypeError(`runtime.${method} is required`);
 return runtime;
}
function rowKey(row){return `${row.machine}|${String(row.tableNo)}`}
function canonicalMachine(row){
 return{
  machine:row.machine??null,tableNo:String(row.tableNo??''),games:finite(+row.games)?+row.games:null,diff:finite(+row.diff)?+row.diff:null,
  bb:finite(+row.bb)?+row.bb:null,rb:finite(+row.rb)?+row.rb:null,gamesSource:row.gamesSource??null,diffSource:row.diffSource??null,
  expectedSetting:finite(+row.expectedSetting)?+row.expectedSetting:null,p4:finite(+row.p4)?+row.p4:null,
  q:Array.isArray(row.q)?row.q.map(value=>finite(+value)?+value:null):null
 };
}
function canonicalHistory(days){
 return days.map(day=>({
  date:day.date,shop:day.shop,
  machines:[...(day.machines||[])].map(canonicalMachine).sort((a,b)=>a.machine.localeCompare(b.machine)||a.tableNo.localeCompare(b.tableNo,undefined,{numeric:true}))
 }));
}
function digest(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex')}
function preOutcomeRow(row){
 const key=rowKey(row),controlRank=+row.rank,controlScore=finite(+row.hybridScore)?+row.hybridScore:(finite(+row.aimScore)?+row.aimScore/100:NaN);
 if(!key||!Number.isInteger(controlRank)||controlRank<1||!finite(controlScore))return null;
 return{
  key,controlRank,controlScore,fixedBonus:finite(+row.hybridValidatedBonus)?+row.hybridValidatedBonus:0,
  axes:{
   'practical-v1':finite(+row.practicalSignal)?+row.practicalSignal:null,
   'model-v1':finite(+row.modelSignal)?+row.modelSignal:null,
   'strict-v1':finite(+row.strictSignal)?+row.strictSignal:null
  }
 };
}
function normalizeStoreDays({store,days,runtime}){
 if(!Array.isArray(days))throw new TypeError('days must be an array');
 const raw=days.filter(day=>isRecord(day)&&day.shop===store);
 if(raw.length===0)throw new TypeError(`store ${store} has no history days`);
 const normalized=raw.map((day,index)=>{
  if(!validDate(day.date))throw new TypeError(`day ${index} date must be a valid YYYY-MM-DD date`);
  const value=runtime.normalizeDay(structuredClone(day));
  if(!isRecord(value)||value.shop!==store||!validDate(value.date)||!Array.isArray(value.machines))throw new TypeError(`normalized day ${day.date} is invalid`);
  return structuredClone(value);
 }).sort((a,b)=>a.date.localeCompare(b.date));
 const seen=new Set();
 for(const day of normalized){if(seen.has(day.date))throw new TypeError(`duplicate store date: ${day.date}`);seen.add(day.date)}
 return normalized;
}

export function buildHistoricalSampleBundle({store,days,runtime,startDate=null,endDate=null,minPriorDays=1}={}){
 requireStore(store);requireRuntime(runtime);requireDate(startDate,'startDate');requireDate(endDate,'endDate');
 if(startDate&&endDate&&startDate>endDate)throw new RangeError('startDate must not be after endDate');
 if(!Number.isInteger(minPriorDays)||minPriorDays<1)throw new TypeError('minPriorDays must be a positive integer');
 const normalized=normalizeStoreDays({store,days,runtime});
 // External judgement is row-local. Judge each normalized store day once, then keep the strict < target slice for every prediction.
 runtime.ensureExternalJudgedSync(normalized,store);
 const samples=[],skipped=[];
 for(let targetIndex=0;targetIndex<normalized.length;targetIndex+=1){
  const targetBase=normalized[targetIndex],targetDate=targetBase.date;
  if(startDate&&targetDate<startDate)continue;
  if(endDate&&targetDate>endDate)continue;
  const sourceDays=normalized.slice(0,targetIndex);
  if(sourceDays.length<minPriorDays){skipped.push({targetDate,reason:'insufficient_prior_days',priorDays:sourceDays.length});continue}
  const trainingCutoff=sourceDays.at(-1)?.date;
  if(!trainingCutoff||trainingCutoff>=targetDate)throw new RangeError(`invalid training cutoff for ${targetDate}`);
  const prediction=runtime.predictStore(store,targetDate,sourceDays,{noCache:true});
  if(!isRecord(prediction)||!Array.isArray(prediction.rows)||prediction.rows.length===0){skipped.push({targetDate,reason:'no_prediction',priorDays:sourceDays.length});continue}
  const outcomes=new Map((targetBase.machines||[]).map(row=>[rowKey(row),row]));
  const prepared=[];
  for(const predicted of prediction.rows){
   const base=preOutcomeRow(predicted);if(!base)continue;
   const actual=outcomes.get(base.key);
   if(!actual||!finite(+actual.expectedSetting)||!finite(+actual.p4))continue;
   prepared.push({...base,actualES:+actual.expectedSetting,actualP4:+actual.p4});
  }
  if(prepared.length<10){skipped.push({targetDate,reason:'insufficient_matched_outcomes',matchedRows:prepared.length,priorDays:sourceDays.length});continue}
  prepared.sort((a,b)=>a.controlRank-b.controlRank||a.key.localeCompare(b.key,undefined,{numeric:true}));
  const preRows=prepared.map(({actualES,actualP4,...row})=>row);
  const sourceSignature=digest({store,targetDate,trainingCutoff,history:canonicalHistory(sourceDays),rows:preRows});
  samples.push({targetDate,trainingCutoff,sourceSignature,rows:prepared});
 }
 return deepFreeze({
  schema:'jugest-axis-samples-v1',store,
  source:{kind:'current-jugest-v4PredictStore',pointInTime:true,outcomeProxy:'external expectedSetting/p4'},
  range:{startDate:startDate??normalized[0].date,endDate:endDate??normalized.at(-1).date,availableDays:normalized.length},
  samples,buildAudit:{builtSamples:samples.length,skipped}
 });
}
