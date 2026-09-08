import {createHash,randomUUID} from 'node:crypto';
import {open,readFile,rename,unlink} from 'node:fs/promises';
import {dirname} from 'node:path';

export const SHADOW_PROFILE_SCHEMA='jugest-axis-shadow-v1';
const EPSILON=1e-12;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

function deepFreeze(value){
  if(value===null||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const key of Reflect.ownKeys(value))deepFreeze(value[key]);
  return Object.freeze(value);
}
function requireText(value,field){
  if(typeof value!=='string'||value.length===0)throw new TypeError(`${field} must be a non-empty string`);
  return value;
}
function requireDate(value,field){
  requireText(value,field);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(`${value}T00:00:00Z`)))throw new TypeError(`${field} must be YYYY-MM-DD`);
  return value;
}
function requireIso(value,field){
  requireText(value,field);
  if(Number.isNaN(Date.parse(value)))throw new TypeError(`${field} must be an ISO timestamp`);
  return value;
}
function sortedCanonical(value){
  if(Array.isArray(value))return value.map(sortedCanonical);
  if(isRecord(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sortedCanonical(value[key])]));
  return value;
}
function identityPayload(profile){
  const copy=structuredClone(profile);
  delete copy.id;
  delete copy.trainedAt;
  return sortedCanonical(copy);
}
function computeId(profile){
  return `sha256:${createHash('sha256').update(JSON.stringify(identityPayload(profile))).digest('hex')}`;
}
function cloneRequiredObject(value,field){
  if(!isRecord(value))throw new TypeError(`${field} must be an object`);
  return structuredClone(value);
}
function validateSelectedForCreation(selectedAxes,decision){
  if(!Array.isArray(selectedAxes))throw new TypeError('selectedAxes must be an array');
  const seen=new Set();let sum=0;
  const selected=selectedAxes.map((axis,index)=>{
    if(!isRecord(axis))throw new TypeError(`selectedAxes[${index}] must be an object`);
    const id=requireText(axis.id,`selectedAxes[${index}].id`);
    if(seen.has(id))throw new TypeError(`duplicate selected axis: ${id}`);
    seen.add(id);
    if(!Number.isInteger(axis.version)||axis.version<1)throw new TypeError(`selectedAxes[${index}].version must be positive integer`);
    if(!finite(axis.weight)||axis.weight<0||axis.weight>1)throw new RangeError(`selectedAxes[${index}].weight must be from 0 to 1`);
    sum+=axis.weight;
    return{id,version:axis.version,weight:axis.weight};
  });
  if(decision==='SHADOW_CHAMPION'&&(selected.length===0||Math.abs(sum-1)>EPSILON))throw new RangeError('SHADOW_CHAMPION selected weights must sum to 1');
  if(decision==='CONTROL'&&selected.length>0&&Math.abs(sum-1)>EPSILON)throw new RangeError('CONTROL selected weights must sum to 1 when present');
  return selected;
}

export function createShadowProfile(input){
  if(!isRecord(input))throw new TypeError('profile input must be an object');
  const decision=input.decision;
  if(decision!=='SHADOW_CHAMPION'&&decision!=='CONTROL')throw new TypeError('decision must be SHADOW_CHAMPION or CONTROL');
  const selectedAxes=validateSelectedForCreation(input.selectedAxes,decision);
  if(!Array.isArray(input.reasons)||input.reasons.some(reason=>typeof reason!=='string'||!reason))throw new TypeError('reasons must be non-empty strings');
  const evaluationDates=cloneRequiredObject(input.evaluationDates,'evaluationDates');
  for(const phase of ['train','validation','holdout']){
    if(!Array.isArray(evaluationDates[phase]))throw new TypeError(`evaluationDates.${phase} must be an array`);
    evaluationDates[phase]=evaluationDates[phase].map((date,index)=>requireDate(date,`evaluationDates.${phase}[${index}]`));
  }
  const integrity=cloneRequiredObject(input.integrity,'integrity');
  for(const field of ['futureLeakage','allAxesApproved','deterministic'])if(typeof integrity[field]!=='boolean')throw new TypeError(`integrity.${field} must be boolean`);
  const profile={
    schema:SHADOW_PROFILE_SCHEMA,
    store:requireText(input.store,'store'),
    sourceSignature:requireText(input.sourceSignature,'sourceSignature'),
    trainedThrough:requireDate(input.trainedThrough,'trainedThrough'),
    trainedAt:requireIso(input.trainedAt??new Date().toISOString(),'trainedAt'),
    decision,
    selectedAxes,
    train:cloneRequiredObject(input.train,'train'),
    validation:cloneRequiredObject(input.validation,'validation'),
    holdout:cloneRequiredObject(input.holdout,'holdout'),
    control:cloneRequiredObject(input.control,'control'),
    fallback:cloneRequiredObject(input.fallback,'fallback'),
    evaluationDates,
    integrity,
    reasons:[...input.reasons]
  };
  profile.id=computeId(profile);
  return deepFreeze(profile);
}

export function validateShadowProfile(profile,{sourceSignature,registry}={}){
  const reasons=[];
  try{
    if(!isRecord(profile))return{valid:false,reasons:['profile_not_object']};
    if(profile.schema!==SHADOW_PROFILE_SCHEMA)reasons.push('schema_mismatch');
    if(typeof sourceSignature!=='string'||profile.sourceSignature!==sourceSignature)reasons.push('stale_source_signature');
    if(profile.decision!=='SHADOW_CHAMPION'&&profile.decision!=='CONTROL')reasons.push('invalid_decision');
    if(!Array.isArray(profile.selectedAxes))reasons.push('selected_axes_invalid');
    else{
      const seen=new Set();let sum=0;
      for(const selected of profile.selectedAxes){
        if(!isRecord(selected)||typeof selected.id!=='string'||!selected.id){reasons.push('selected_axis_invalid');continue;}
        if(seen.has(selected.id))reasons.push(`axis_duplicate:${selected.id}`);
        seen.add(selected.id);
        if(!finite(selected.weight)||selected.weight<0||selected.weight>1)reasons.push(`axis_weight_invalid:${selected.id}`);
        else sum+=selected.weight;
        const current=registry?.get?.(selected.id);
        if(!current){reasons.push(`axis_missing:${selected.id}`);continue;}
        if(current.version!==selected.version)reasons.push(`axis_version_mismatch:${selected.id}`);
        if(current.approved!==true)reasons.push(`axis_unapproved:${selected.id}`);
      }
      if(profile.selectedAxes.length>0&&Math.abs(sum-1)>EPSILON)reasons.push('weights_not_normalized');
      if(profile.decision==='SHADOW_CHAMPION'&&profile.selectedAxes.length===0)reasons.push('shadow_axes_missing');
    }
    if(!isRecord(profile.integrity))reasons.push('integrity_missing');
    else{
      if(profile.integrity.futureLeakage!==false)reasons.push('future_leakage_integrity_failed');
      if(profile.integrity.allAxesApproved!==true)reasons.push('axis_approval_integrity_failed');
      if(profile.integrity.deterministic!==true)reasons.push('determinism_integrity_failed');
    }
    if(typeof profile.id!=='string'||profile.id!==computeId(profile))reasons.push('profile_id_mismatch');
  }catch(error){
    reasons.push(`malformed_profile:${error?.message||'unknown'}`);
  }
  return{valid:reasons.length===0,reasons:[...new Set(reasons)]};
}

export async function readShadowProfiles(path){
  try{
    const raw=await readFile(path,'utf8');
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed))throw new TypeError('shadow profile file must contain an array');
    return parsed;
  }catch(error){
    if(error?.code==='ENOENT')return[];
    throw error;
  }
}

export async function writeShadowProfiles(path,profiles){
  if(!Array.isArray(profiles))throw new TypeError('profiles must be an array');
  const temp=`${path}.tmp-${process.pid}-${randomUUID()}`;
  let handle=null;
  try{
    handle=await open(temp,'wx',0o600);
    await handle.writeFile(`${JSON.stringify(profiles,null,2)}\n`,'utf8');
    await handle.sync();
    await handle.close();handle=null;
    await rename(temp,path);
    try{
      const dirHandle=await open(dirname(path),'r');
      try{await dirHandle.sync();}finally{await dirHandle.close();}
    }catch{}
  }catch(error){
    if(handle){try{await handle.close();}catch{}}
    try{await unlink(temp);}catch{}
    throw error;
  }
}
