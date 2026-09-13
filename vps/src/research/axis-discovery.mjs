import {hashCanonical} from '../canonical-json.mjs';

const CATEGORICAL_FIELDS=Object.freeze(['weekday','date_last_digit','machine_name','table_no','table_last_digit']);

function finite(value){const n=Number(value);return Number.isFinite(n)?n:null}
function clamp(value,min,max){return Math.min(max,Math.max(min,value))}
function normalCdf(x){
  // Abramowitz-Stegun normal CDF approximation; deterministic and dependency-free.
  const sign=x<0?-1:1,z=Math.abs(x)/Math.sqrt(2);
  const t=1/(1+.3275911*z);
  const erf=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-z*z);
  return .5*(1+sign*erf);
}
function twoProportionP(aSuccess,aTotal,bSuccess,bTotal){
  if(aTotal<=0||bTotal<=0)return 1;
  const p=(aSuccess+bSuccess)/(aTotal+bTotal),variance=p*(1-p)*(1/aTotal+1/bTotal);
  if(!(variance>0))return aSuccess/aTotal===bSuccess/bTotal?1:0;
  const z=Math.abs(aSuccess/aTotal-bSuccess/bTotal)/Math.sqrt(variance);
  return clamp(2*(1-normalCdf(z)),0,1);
}
function quantile(values,q){
  const xs=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!xs.length)return null;
  const pos=(xs.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos);
  return lo===hi?xs[lo]:xs[lo]+(xs[hi]-xs[lo])*(pos-lo);
}

export function predicateMatches(features,predicate){
  const value=features?.[predicate.field];
  if(predicate.op==='eq')return String(value)===String(predicate.value);
  const numeric=finite(value),threshold=finite(predicate.value);if(numeric===null||threshold===null)return false;
  if(predicate.op==='gte')return numeric>=threshold;
  if(predicate.op==='lte')return numeric<=threshold;
  return false;
}
export function axisMatches(sample,axis){return (axis?.predicates||[]).every(predicate=>predicateMatches(sample?.features,predicate))}

function evaluatePredicateSet(samples,predicates){
  const matched=[],unmatched=[];
  for(const sample of samples)(predicates.every(p=>predicateMatches(sample.features,p))?matched:unmatched).push(sample);
  const strongMatched=matched.filter(row=>row.strong).length,strongUnmatched=unmatched.filter(row=>row.strong).length;
  const strongRate=matched.length?strongMatched/matched.length:0;
  const otherRate=unmatched.length?strongUnmatched/unmatched.length:0;
  const baseline=samples.length?samples.filter(row=>row.strong).length/samples.length:0;
  return {support:matched.length,strongRate,otherRate,baseline,lift:strongRate-baseline,contrast:strongRate-otherRate,pValue:twoProportionP(strongMatched,matched.length,strongUnmatched,unmatched.length)};
}

function temporalFoldPass(samples,predicates,foldCount){
  const dates=[...new Set(samples.map(row=>row.targetDate))].sort();if(!dates.length)return 0;
  const folds=[];
  for(let i=0;i<foldCount;i+=1){
    const start=Math.floor(i*dates.length/foldCount),end=Math.floor((i+1)*dates.length/foldCount),set=new Set(dates.slice(start,end));
    const rows=samples.filter(row=>set.has(row.targetDate));if(rows.length)folds.push(rows);
  }
  if(!folds.length)return 0;
  let pass=0;
  for(const rows of folds){const stat=evaluatePredicateSet(rows,predicates);if(stat.support>0&&stat.contrast>0)pass+=1}
  return pass/folds.length;
}

function robustness(samples,predicates){
  const numericIndex=predicates.findIndex(p=>p.op==='gte'||p.op==='lte');
  if(numericIndex<0)return 1;
  const base=evaluatePredicateSet(samples,predicates);
  const p=predicates[numericIndex],threshold=Number(p.value),delta=Math.max(Math.abs(threshold)*.05,1e-9);
  let passed=0,total=0;
  for(const shifted of [threshold-delta,threshold+delta]){
    const copy=predicates.map((item,index)=>index===numericIndex?{...item,value:shifted}:item);
    const stat=evaluatePredicateSet(samples,copy);total+=1;if(stat.support>0&&stat.contrast>0&&stat.lift>=base.lift*.5)passed+=1;
  }
  return total?passed/total:0;
}

function candidatePredicates(samples){
  const out=[];
  for(const field of CATEGORICAL_FIELDS){
    const values=[...new Set(samples.map(row=>row.features?.[field]).filter(value=>value!==null&&value!==undefined).map(String))].sort();
    for(const value of values)out.push([{field,op:'eq',value}]);
  }
  const numericFields=[...new Set(samples.flatMap(row=>Object.keys(row.features||{}).filter(key=>key.startsWith('hist_')||key.startsWith('store_')))].sort();
  for(const field of numericFields){
    const values=samples.map(row=>finite(row.features?.[field])).filter(Number.isFinite);
    for(const q of [.25,.5,.75]){
      const threshold=quantile(values,q);if(threshold===null)continue;
      out.push([{field,op:'gte',value:threshold}],[{field,op:'lte',value:threshold}]);
    }
  }
  return out;
}

function applyBenjaminiHochberg(candidates,q){
  const sorted=[...candidates].sort((a,b)=>a.pValue-b.pValue||a.id.localeCompare(b.id));
  let cutoff=-1;
  for(let i=0;i<sorted.length;i+=1)if(sorted[i].pValue<=((i+1)/sorted.length)*q)cutoff=i;
  const accepted=new Set(cutoff>=0?sorted.slice(0,cutoff+1).map(row=>row.id):[]);
  return candidates.map(row=>({...row,fdrAccepted:accepted.has(row.id)}));
}

function makeAxis(samples,predicates,foldCount){
  const stats=evaluatePredicateSet(samples,predicates);
  const normalized=predicates.map(p=>Object.freeze({...p}));
  return {
    id:hashCanonical({version:'axis-v1',predicates:normalized}),
    predicates:normalized,
    support:stats.support,strongRate:stats.strongRate,otherRate:stats.otherRate,baselineRate:stats.baseline,
    lift:stats.lift,contrast:stats.contrast,pValue:stats.pValue,
    foldPassRate:temporalFoldPass(samples,normalized,foldCount),robustness:robustness(samples,normalized),fdrAccepted:false
  };
}

export function discoverAxes(samples,{minSupport=20,maxAxes=32,fdrQ=.05,foldCount=4,maxPairSeeds=8}={}){
  if(!Array.isArray(samples))throw new TypeError('samples must be an array');
  const singles=candidatePredicates(samples)
    .map(predicates=>makeAxis(samples,predicates,foldCount))
    .filter(axis=>axis.support>=minSupport&&axis.contrast>0&&axis.foldPassRate>=.75&&axis.robustness>=.5);
  let guarded=applyBenjaminiHochberg(singles,fdrQ).filter(axis=>axis.fdrAccepted);
  guarded.sort((a,b)=>b.lift-a.lift||b.contrast-a.contrast||a.id.localeCompare(b.id));

  const seeds=guarded.slice(0,maxPairSeeds),pairs=[];
  for(let i=0;i<seeds.length;i+=1)for(let j=i+1;j<seeds.length;j+=1){
    const predicates=[...seeds[i].predicates,...seeds[j].predicates];
    const fields=new Set(predicates.map(p=>p.field));
    if(fields.size!==predicates.length)continue;
    const axis=makeAxis(samples,predicates,foldCount);
    if(axis.support>=minSupport&&axis.contrast>0&&axis.foldPassRate>=.75&&axis.robustness>=.5)pairs.push(axis);
  }
  const guardedPairs=applyBenjaminiHochberg(pairs,fdrQ).filter(axis=>axis.fdrAccepted);
  const all=[...guarded,...guardedPairs];
  const unique=new Map(all.map(axis=>[axis.id,axis]));
  return [...unique.values()].sort((a,b)=>b.lift-a.lift||b.contrast-a.contrast||a.id.localeCompare(b.id)).slice(0,maxAxes).map(axis=>Object.freeze(axis));
}

export const __test={normalCdf,twoProportionP,quantile,evaluatePredicateSet,temporalFoldPass,robustness,candidatePredicates,applyBenjaminiHochberg};
