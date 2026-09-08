import {sourceSignature as computeSourceSignature,validatePointInTimeSamples} from './evaluator.mjs';
import {createAxisRegistry} from './registry.mjs';
import {selectShadowEnsemble} from './selector.mjs';
import {createShadowProfile,readShadowProfiles,validateShadowProfile,writeShadowProfiles} from './profile.mjs';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const deepFreeze=value=>{
  if(value===null||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const key of Reflect.ownKeys(value))deepFreeze(value[key]);
  return Object.freeze(value);
};
const emptySummary=()=>({score:null,mean:null,sd:null,winRate:0,n:0,top3:null,top5:null,top10:null});
const summary=value=>isRecord(value)?structuredClone(value):emptySummary();

function requireStore(store){
  if(typeof store!=='string'||store.trim()==='')throw new TypeError('store must be a non-empty string');
  return store;
}
function selectedAxesFromSelection(selection,registry){
  if(selection.decision!=='SHADOW_CHAMPION')return[];
  return selection.selectedAxisIds.map(id=>{
    const axis=registry.get(id);
    if(!axis||axis.approved!==true)throw new TypeError(`selected axis is not approved: ${id}`);
    const weight=selection.weights?.[id];
    if(!finite(weight)||weight<=0)throw new TypeError(`selected axis weight is invalid: ${id}`);
    return{id:axis.id,version:axis.version,weight};
  });
}
function evaluationDates(split){
  const dates=phase=>Array.isArray(split?.[phase])?split[phase].map(sample=>sample.targetDate):[];
  return{train:dates('train'),validation:dates('validation'),holdout:dates('holdout')};
}
function profileSummaries(selection){
  return{
    train:summary(selection.train),
    validation:summary(selection.validation?.candidate),
    holdout:summary(selection.holdout?.candidate),
    control:{validation:summary(selection.validation?.control),holdout:summary(selection.holdout?.control)},
    fallback:{validation:summary(selection.validation?.fallback),holdout:summary(selection.holdout?.fallback)}
  };
}
async function persistCurrentProfile(profilePath,profile){
  const existing=await readShadowProfiles(profilePath);
  const next=existing.filter(item=>!(isRecord(item)&&item.store===profile.store));
  next.push(profile);
  next.sort((a,b)=>String(a?.store??'').localeCompare(String(b?.store??''))||String(a?.id??'').localeCompare(String(b?.id??'')));
  await writeShadowProfiles(profilePath,next);
}

export function rankShadowRows(rows,profile,registry=createAxisRegistry()){
  if(!Array.isArray(rows))throw new TypeError('rows must be an array');
  const profileCheck=validateShadowProfile(profile,{sourceSignature:profile?.sourceSignature,registry});
  if(!profileCheck.valid)throw new TypeError(`invalid shadow profile: ${profileCheck.reasons.join(',')}`);
  const copied=structuredClone(rows);
  const seen=new Set();
  for(let index=0;index<copied.length;index+=1){
    const row=copied[index];
    if(!isRecord(row))throw new TypeError(`row ${index} must be an object`);
    if(typeof row.key!=='string'||row.key.length===0)throw new TypeError(`row ${index} key must be a non-empty string`);
    if(seen.has(row.key))throw new TypeError(`duplicate row key: ${row.key}`);
    seen.add(row.key);
    for(const field of ['controlRank','controlScore','fixedBonus'])if(!finite(row[field]))throw new TypeError(`row ${row.key} ${field} must be finite`);
    if(!isRecord(row.axes))throw new TypeError(`row ${row.key} axes must be an object`);
  }

  if(profile.decision==='CONTROL'){
    return deepFreeze(copied
      .sort((a,b)=>a.controlRank-b.controlRank||String(a.key).localeCompare(String(b.key),undefined,{numeric:true,sensitivity:'base'}))
      .map(row=>({
        key:row.key,
        controlRank:row.controlRank,
        shadowRank:row.controlRank,
        controlScore:row.controlScore,
        shadowScore:row.controlScore,
        fixedBonus:row.fixedBonus,
        contributions:{},
        weights:{},
        shadowAvailable:true,
        disagreement:0,
        profileId:profile.id
      })));
  }

  const weights=Object.freeze(Object.fromEntries(profile.selectedAxes.map(axis=>[axis.id,axis.weight])));
  const scored=copied.map(row=>{
    const contributions={};
    let available=true,total=row.fixedBonus;
    for(const selected of profile.selectedAxes){
      const value=row.axes[selected.id];
      if(!finite(value)){
        available=false;
        contributions[selected.id]=null;
        continue;
      }
      const contribution=value*selected.weight;
      contributions[selected.id]=contribution;
      total+=contribution;
    }
    return{
      key:row.key,
      controlRank:row.controlRank,
      controlScore:row.controlScore,
      shadowScore:available?total:row.controlScore,
      fixedBonus:row.fixedBonus,
      contributions,
      weights:{...weights},
      shadowAvailable:available,
      profileId:profile.id
    };
  });
  scored.sort((a,b)=>b.shadowScore-a.shadowScore||a.controlRank-b.controlRank||String(a.key).localeCompare(String(b.key),undefined,{numeric:true,sensitivity:'base'}));
  scored.forEach((row,index)=>{row.shadowRank=index+1;row.disagreement=Math.abs(row.shadowRank-row.controlRank);});
  return deepFreeze(scored);
}

export async function runShadowEvaluation({store,samples,registry=createAxisRegistry(),config,profilePath=null,trainedAt}={}){
  requireStore(store);
  if(!registry||typeof registry.get!=='function'||typeof registry.approved!=='function')throw new TypeError('axis registry is required');
  const validated=validatePointInTimeSamples(samples);
  if(validated.length===0)throw new TypeError('samples must not be empty');
  const signature=computeSourceSignature(validated);
  const selection=selectShadowEnsemble({samples:validated,registry,config});
  const selectedAxes=selectedAxesFromSelection(selection,registry);
  const summaries=profileSummaries(selection);
  const allAxesApproved=selectedAxes.every(selected=>registry.get(selected.id)?.approved===true&&registry.get(selected.id)?.version===selected.version);
  const profile=createShadowProfile({
    store,
    sourceSignature:signature,
    trainedThrough:validated.at(-1).targetDate,
    ...(trainedAt?{trainedAt}:{}),
    decision:selection.decision,
    selectedAxes,
    train:summaries.train,
    validation:summaries.validation,
    holdout:summaries.holdout,
    control:summaries.control,
    fallback:summaries.fallback,
    evaluationDates:evaluationDates(selection.split),
    integrity:{futureLeakage:false,allAxesApproved,deterministic:true},
    reasons:[...selection.reasons]
  });
  if(profilePath!==null){
    if(typeof profilePath!=='string'||profilePath.length===0)throw new TypeError('profilePath must be a non-empty string');
    await persistCurrentProfile(profilePath,profile);
  }
  const rows=rankShadowRows(validated.at(-1).rows,profile,registry);
  return deepFreeze({
    shadowOnly:true,
    store,
    sourceSignature:signature,
    trainedThrough:profile.trainedThrough,
    decision:profile.decision,
    reasons:[...profile.reasons],
    profile,
    rows,
    selection:{
      candidateCount:selection.candidateCount??0,
      holdoutEvaluations:selection.holdoutEvaluations??0,
      eligibleAxisIds:[...(selection.eligibleAxisIds??[])],
      availability:structuredClone(selection.availability??{}),
      selectedAxisIds:[...(selection.selectedAxisIds??[])]
    }
  });
}
