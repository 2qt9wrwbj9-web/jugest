import {createHash} from 'node:crypto';

const EPSILON=1e-12;
const numericKeyCompare=(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'});
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

function deepFreeze(value){
  if(value===null||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const key of Reflect.ownKeys(value))deepFreeze(value[key]);
  return Object.freeze(value);
}

function mean(values){
  return values.reduce((sum,value)=>sum+value,0)/values.length;
}

function validateDate(value,field){
  if(typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)||Number.isNaN(Date.parse(`${value}T00:00:00Z`))){
    throw new TypeError(`${field} must be a valid YYYY-MM-DD date`);
  }
  return value;
}

function validateRow(row,index){
  if(!isRecord(row))throw new TypeError(`row ${index} must be an object`);
  if(typeof row.key!=='string'||row.key.length===0)throw new TypeError(`row ${index} key must be a non-empty string`);
  for(const field of ['controlRank','controlScore','fixedBonus']){
    if(!finite(row[field]))throw new TypeError(`row ${row.key} ${field} must be finite`);
  }
  if(!isRecord(row.axes))throw new TypeError(`row ${row.key} axes must be an object`);
  for(const [axisId,value] of Object.entries(row.axes)){
    if(value!==null&&!finite(value))throw new TypeError(`row ${row.key} axis ${axisId} must be finite or null`);
  }
  for(const field of ['actualES','actualP4']){
    const value=row[field];
    if(value!==null&&value!==undefined&&!finite(value))throw new TypeError(`row ${row.key} ${field} must be finite or null`);
  }
}

export function validatePointInTimeSamples(samples){
  if(!Array.isArray(samples))throw new TypeError('samples must be an array');
  const cloned=structuredClone(samples);
  let previousDate=null;
  const dates=new Set();
  for(let index=0;index<cloned.length;index+=1){
    const sample=cloned[index];
    if(!isRecord(sample))throw new TypeError(`sample ${index} must be an object`);
    const targetDate=validateDate(sample.targetDate,`sample ${index} targetDate`);
    const trainingCutoff=validateDate(sample.trainingCutoff,`sample ${index} trainingCutoff`);
    if(trainingCutoff>=targetDate)throw new RangeError(`sample ${index} trainingCutoff must be before targetDate`);
    if(dates.has(targetDate))throw new TypeError(`duplicate targetDate: ${targetDate}`);
    if(previousDate!==null&&targetDate<=previousDate)throw new TypeError('samples must be sorted in strict chronological order');
    dates.add(targetDate);
    previousDate=targetDate;
    if(typeof sample.sourceSignature!=='string'||sample.sourceSignature.length===0){
      throw new TypeError(`sample ${index} sourceSignature must be a non-empty string`);
    }
    if(!Array.isArray(sample.rows))throw new TypeError(`sample ${index} rows must be an array`);
    const keys=new Set();
    sample.rows.forEach((row,rowIndex)=>{
      validateRow(row,rowIndex);
      if(keys.has(row.key))throw new TypeError(`duplicate row key ${row.key} on ${targetDate}`);
      keys.add(row.key);
    });
  }
  return deepFreeze(cloned);
}

function normalizeWeights(weights){
  if(!isRecord(weights))throw new TypeError('weights must be an object');
  const entries=Object.entries(weights);
  if(entries.length===0)throw new TypeError('weights must not be empty');
  let sum=0;
  for(const [axisId,value] of entries){
    if(typeof axisId!=='string'||axisId.length===0)throw new TypeError('axis id must be non-empty');
    if(!finite(value)||value<0)throw new RangeError(`weight ${axisId} must be a finite non-negative number`);
    sum+=value;
  }
  if(Math.abs(sum-1)>EPSILON)throw new RangeError('weights must sum to 1');
  return entries.filter(([,value])=>value>0);
}

function eligibleRows(rows,weightEntries){
  if(!Array.isArray(rows))throw new TypeError('rows must be an array');
  const seen=new Set();
  const eligible=[];
  for(let index=0;index<rows.length;index+=1){
    const row=rows[index];
    validateRow(row,index);
    if(seen.has(row.key))throw new TypeError(`duplicate row key: ${row.key}`);
    seen.add(row.key);
    if(!finite(row.actualES)||!finite(row.actualP4))continue;
    if(weightEntries.some(([axisId])=>!finite(row.axes[axisId])))continue;
    const candidateScore=row.fixedBonus+weightEntries.reduce((sum,[axisId,weight])=>sum+row.axes[axisId]*weight,0);
    eligible.push({...row,candidateScore});
  }
  return eligible;
}

function topLift(ranked,baseline,k){
  const top=ranked.slice(0,k);
  return Object.freeze({
    es:mean(top.map(row=>row.actualES))-baseline.es,
    p4:mean(top.map(row=>row.actualP4))-baseline.p4
  });
}

export function scoreDay(rows,weights){
  const weightEntries=normalizeWeights(weights);
  const eligible=eligibleRows(rows,weightEntries);
  if(eligible.length<10)return null;
  eligible.sort((a,b)=>{
    const scoreDelta=b.candidateScore-a.candidateScore;
    if(Math.abs(scoreDelta)>EPSILON)return scoreDelta;
    return numericKeyCompare(a.key,b.key);
  });
  const baseline=Object.freeze({
    es:mean(eligible.map(row=>row.actualES)),
    p4:mean(eligible.map(row=>row.actualP4))
  });
  const top3=topLift(eligible,baseline,3);
  const top5=topLift(eligible,baseline,5);
  const top10=topLift(eligible,baseline,10);
  const es=.45*top3.es+.35*top5.es+.20*top10.es;
  const p4=.45*top3.p4+.35*top5.p4+.20*top10.p4;
  return deepFreeze({
    utility:.72*es+.28*(p4*3),
    top3,top5,top10,baseline,
    rankedKeys:eligible.map(row=>row.key)
  });
}

export function evaluatePeriod(samples,weights){
  const validated=validatePointInTimeSamples(samples);
  const days=validated.map(sample=>scoreDay(sample.rows,weights)).filter(Boolean);
  if(days.length===0){
    return deepFreeze({score:null,mean:null,sd:null,winRate:0,n:0,top3:null,top5:null,top10:null});
  }
  const utilities=days.map(day=>day.utility);
  const average=mean(utilities);
  const sd=Math.sqrt(mean(utilities.map(value=>(value-average)**2)));
  const winRate=utilities.filter(value=>value>0).length/utilities.length;
  const aggregateTop=k=>Object.freeze({
    es:mean(days.map(day=>day[k].es)),
    p4:mean(days.map(day=>day[k].p4))
  });
  return deepFreeze({
    score:average-.12*sd/Math.sqrt(days.length)+.035*(winRate-.5),
    mean:average,
    sd,
    winRate,
    n:days.length,
    top3:aggregateTop('top3'),
    top5:aggregateTop('top5'),
    top10:aggregateTop('top10')
  });
}

function canonicalPreOutcomeSamples(samples){
  if(!Array.isArray(samples))throw new TypeError('samples must be an array');
  return samples.map((sample,index)=>{
    if(!isRecord(sample))throw new TypeError(`sample ${index} must be an object`);
    validateDate(sample.targetDate,`sample ${index} targetDate`);
    validateDate(sample.trainingCutoff,`sample ${index} trainingCutoff`);
    if(sample.trainingCutoff>=sample.targetDate)throw new RangeError(`sample ${index} trainingCutoff must be before targetDate`);
    if(typeof sample.sourceSignature!=='string'||sample.sourceSignature.length===0){
      throw new TypeError(`sample ${index} sourceSignature must be a non-empty string`);
    }
    if(!Array.isArray(sample.rows))throw new TypeError(`sample ${index} rows must be an array`);
    const rows=sample.rows.map((row,rowIndex)=>{
      validateRow(row,rowIndex);
      return{
        key:row.key,
        controlRank:row.controlRank,
        controlScore:row.controlScore,
        fixedBonus:row.fixedBonus,
        axes:Object.fromEntries(Object.entries(row.axes).sort(([a],[b])=>numericKeyCompare(a,b)))
      };
    }).sort((a,b)=>numericKeyCompare(a.key,b.key));
    return{targetDate:sample.targetDate,trainingCutoff:sample.trainingCutoff,sourceSignature:sample.sourceSignature,rows};
  });
}

export function sourceSignature(samples){
  const canonical=canonicalPreOutcomeSamples(samples);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function splitChronologically(samples,config){
  const validated=validatePointInTimeSamples(samples);
  if(!isRecord(config)||!isRecord(config.split))throw new TypeError('split config is required');
  for(const field of ['minEvaluatedDays','minTrainDays','minValidationDays','minHoldoutDays']){
    if(!Number.isInteger(config[field])||config[field]<0)throw new TypeError(`${field} must be a non-negative integer`);
  }
  for(const field of ['train','validation','holdout']){
    if(!finite(config.split[field])||config.split[field]<0||config.split[field]>1)throw new RangeError(`split.${field} must be from 0 to 1`);
  }
  const ratioSum=config.split.train+config.split.validation+config.split.holdout;
  if(Math.abs(ratioSum-1)>EPSILON)throw new RangeError('split ratios must sum to 1');
  if(validated.length<config.minEvaluatedDays){
    return deepFreeze({ok:false,reason:'insufficient_history',train:[],validation:[],holdout:[]});
  }
  const trainCount=Math.floor(validated.length*config.split.train);
  const validationCount=Math.floor(validated.length*config.split.validation);
  const holdoutCount=validated.length-trainCount-validationCount;
  if(trainCount<config.minTrainDays||validationCount<config.minValidationDays||holdoutCount<config.minHoldoutDays){
    return deepFreeze({ok:false,reason:'insufficient_split',train:[],validation:[],holdout:[]});
  }
  return deepFreeze({
    ok:true,
    train:validated.slice(0,trainCount),
    validation:validated.slice(trainCount,trainCount+validationCount),
    holdout:validated.slice(trainCount+validationCount)
  });
}
