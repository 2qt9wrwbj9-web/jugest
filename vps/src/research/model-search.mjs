import {hashCanonical} from '../canonical-json.mjs';
import {axisMatches} from './axis-discovery.mjs';

export const MODEL_VERSION='store-read-model-v1';

function finite(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback}
function normalizePredicate(predicate){return {field:String(predicate?.field||''),op:String(predicate?.op||''),value:predicate?.value}}
function normalizeAxis(axis){
  return {
    id:String(axis?.id||hashCanonical({predicates:(axis?.predicates||[]).map(normalizePredicate)})),
    predicates:(axis?.predicates||[]).map(normalizePredicate),
    weight:finite(axis?.weight,1)
  };
}
export function canonicalModel(model={}){
  const axes=(model.axes||[]).map(normalizeAxis).filter(axis=>axis.id&&axis.weight!==0).sort((a,b)=>a.id.localeCompare(b.id));
  return {version:String(model.version||MODEL_VERSION),axes};
}
export function fingerprintModel(model={}){return hashCanonical(canonicalModel(model))}
export function baselineModel(){const model={version:MODEL_VERSION,axes:[]};return Object.freeze({...model,fingerprint:fingerprintModel(model)})}

export function scoreSample(sample,model){
  return canonicalModel(model).axes.reduce((sum,axis)=>axisMatches(sample,axis)?sum+axis.weight:sum,0);
}

function rankRows(rows,scoreAccessor){return [...rows].sort((a,b)=>scoreAccessor(b)-scoreAccessor(a)||String(a.machineKey).localeCompare(String(b.machineKey)))}
function topOverlap(predicted,actual,k){
  const count=Math.min(k,predicted.length,actual.length);if(!count)return {overlap:0,rate:0,lift:0};
  const actualSet=new Set(actual.slice(0,count).map(row=>row.machineKey));
  const overlap=predicted.slice(0,count).filter(row=>actualSet.has(row.machineKey)).length;
  const rate=overlap/count,expected=count/Math.max(1,actual.length);
  return {overlap,rate,lift:expected>0?rate/expected:0};
}
function spearman(predicted,actual){
  const n=Math.min(predicted.length,actual.length);if(n<2)return 0;
  const actualRank=new Map(actual.map((row,index)=>[row.machineKey,index+1]));
  let sum=0;
  for(let i=0;i<n;i+=1){const d=(i+1)-(actualRank.get(predicted[i].machineKey)??n);sum+=d*d}
  return 1-(6*sum)/(n*(n*n-1));
}

export function evaluateModel(samples,model){
  if(!Array.isArray(samples))throw new TypeError('samples must be an array');
  const byDate=new Map();
  for(const sample of samples){if(!byDate.has(sample.targetDate))byDate.set(sample.targetDate,[]);byDate.get(sample.targetDate).push(sample)}
  const daily=[];
  for(const date of [...byDate.keys()].sort()){
    const rows=byDate.get(date);
    const predicted=rankRows(rows,row=>scoreSample(row,model));
    const actual=rankRows(rows,row=>finite(row.outcomeScore,-Infinity));
    const top1=topOverlap(predicted,actual,1),top3=topOverlap(predicted,actual,3),top5=topOverlap(predicted,actual,5);
    daily.push({date,top1,top3,top5,rankCorrelation:spearman(predicted,actual)});
  }
  const avg=(selector)=>daily.length?daily.reduce((sum,row)=>sum+selector(row),0)/daily.length:0;
  return Object.freeze({
    dates:daily.length,
    top1Overlap:avg(row=>row.top1.rate),top3Overlap:avg(row=>row.top3.rate),top5Overlap:avg(row=>row.top5.rate),
    top1Lift:avg(row=>row.top1.lift),top3Lift:avg(row=>row.top3.lift),top5Lift:avg(row=>row.top5.lift),
    rankCorrelation:avg(row=>row.rankCorrelation)
  });
}

function modelFromAxes(axes){
  const normalized=axes.map(axis=>({...axis,weight:finite(axis.weight,1)}));
  const total=normalized.reduce((sum,axis)=>sum+Math.abs(axis.weight),0)||1;
  const model={version:MODEL_VERSION,axes:normalized.map(axis=>({...axis,weight:axis.weight/total}))};
  return Object.freeze({...model,fingerprint:fingerprintModel(model)});
}
function promotionDelta(score,base){
  return (score.top3Lift-base.top3Lift)*100+(score.top5Lift-base.top5Lift)*10+(score.rankCorrelation-base.rankCorrelation);
}
function passesPromotion(score,base){
  return score.top3Lift>base.top3Lift+1e-9&&score.top5Lift>=base.top5Lift-.05&&score.rankCorrelation>=base.rankCorrelation-.10;
}

export function searchModels({champion=baselineModel(),axes=[],train=[],validation=[],round=0,maxCandidates=128}={}){
  const baseValidation=evaluateModel(validation,champion),candidates=[],seen=new Set();
  const add=model=>{const fp=fingerprintModel(model);if(seen.has(fp)||fp===fingerprintModel(champion)||candidates.length>=maxCandidates)return;seen.add(fp);candidates.push({...model,fingerprint:fp})};
  const sorted=[...axes].sort((a,b)=>finite(b.lift)-finite(a.lift)||String(a.id).localeCompare(String(b.id)));
  for(const axis of sorted)add(modelFromAxes([{...axis,weight:1}]));
  const seeds=sorted.slice(0,Math.min(8,sorted.length));
  for(let i=0;i<seeds.length;i+=1)for(let j=i+1;j<seeds.length&&candidates.length<maxCandidates;j+=1){
    for(const weights of [[1,1],[2,1],[1,2]])add(modelFromAxes([{...seeds[i],weight:weights[0]},{...seeds[j],weight:weights[1]}]));
  }
  const championAxes=canonicalModel(champion).axes;
  if(championAxes.length){
    for(const axis of seeds)add(modelFromAxes([...championAxes,{...axis,weight:.5}]));
    for(let index=0;index<championAxes.length;index+=1){
      for(const factor of [.5,1.5])add(modelFromAxes(championAxes.map((axis,i)=>({...axis,weight:axis.weight*(i===index?factor:1)}))));
    }
  }
  const evaluated=candidates.map(model=>({model,train:evaluateModel(train,model),validation:evaluateModel(validation,model)}));
  evaluated.sort((a,b)=>promotionDelta(b.validation,baseValidation)-promotionDelta(a.validation,baseValidation)||b.validation.top3Lift-a.validation.top3Lift||a.model.fingerprint.localeCompare(b.model.fingerprint));
  const best=evaluated[0]??null;
  return Object.freeze({round:Number(round)||0,baseline:baseValidation,best,improved:Boolean(best&&passesPromotion(best.validation,baseValidation)),candidatesEvaluated:evaluated.length,candidates:evaluated});
}

export function shouldConverge({seenFingerprints=new Set(),proposedFingerprint,noImproveCount=0}={}){
  if(proposedFingerprint&&seenFingerprints?.has?.(proposedFingerprint))return Object.freeze({reason:'repeat',fingerprint:proposedFingerprint});
  if(Number(noImproveCount)>=5)return Object.freeze({reason:'no_improvement',count:Number(noImproveCount)});
  return null;
}

export const __test={normalizeAxis,rankRows,topOverlap,spearman,modelFromAxes,promotionDelta,passesPromotion};
