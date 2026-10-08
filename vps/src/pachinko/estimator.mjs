import {MODELS,identifyPachinkoModel} from './models.mjs';

export const PACHINKO_NUMERIC_FIELDS=Object.freeze(['special','start','final_start','special_1','special_2','special_2d','special_out','special_safe','out','safe','difference']);

// Missing/empty/boolean values must never become a manufactured zero.
export function pachinkoInteger(value){
  if(typeof value!=='number'&&!(typeof value==='string'&&/^-?\d+$/u.test(value)))return null;
  const n=Number(value);return Number.isSafeInteger(n)?n:null;
}

export function inspectPachinkoRaw(raw){
  const values={},diagnostics=[];
  for(const field of PACHINKO_NUMERIC_FIELDS){
    const value=pachinkoInteger(raw?.[field]);values[field]=value;
    if(value===null)diagnostics.push(`invalid_integer:${field}`);
    else if(field!=='difference'&&value<0)diagnostics.push(`negative_counter:${field}`);
  }
  const {out,safe,special_out,special_safe,difference,special,special_1,special_2d}=values;
  if(out!==null&&special_out!==null&&out<special_out)diagnostics.push('special_out_exceeds_out');
  if(safe!==null&&special_safe!==null&&safe<special_safe)diagnostics.push('special_safe_exceeds_safe');
  if(out!==null&&safe!==null&&difference!==null&&difference!==10*(safe-out))diagnostics.push('ball_counter_identity_mismatch');
  if(special!==null&&special_1!==null&&special_2d!==null&&special_1!==special+special_2d)diagnostics.push('hit_counter_identity_mismatch');
  return {values,diagnostics};
}

const methodKey=(id,version)=>JSON.stringify([id,version]);
const seaRatio=(starts,consumption)=>25*starts/consumption;
const SEA_METHOD=Object.freeze({
  modelKey:'OUMI5_SPECIAL_ALTA',id:'sea-normal-consumption-10',version:'1',
  estimate:seaRatio,
  sampleBand:sample=>sample===null?null:sample>=2000?'A':sample>=1000?'B':sample>=500?'C':'D',
  pool(rows){
    if(rows.some(row=>!Number.isSafeInteger(row.start)||row.start<=0||!Number.isSafeInteger(row.net_consumption)||row.net_consumption<=0))return null;
    const starts=rows.reduce((sum,row)=>sum+row.start,0),consumption=rows.reduce((sum,row)=>sum+row.net_consumption,0);
    return Number.isSafeInteger(starts)&&Number.isSafeInteger(consumption)?seaRatio(starts,consumption):null;
  }
});
// Status alone never selects a formula. Every usable method explicitly owns
// its model, version, calculation, observation bands and pooling denominator.
const METHODS=new Map([[methodKey(SEA_METHOD.id,SEA_METHOD.version),SEA_METHOD]]);
function estimateSea(model,stats){
  const method=METHODS.get(methodKey(model.estimatorId,model.estimatorVersion));
  if(!method||method.modelKey!==model.key){stats.diagnostics.push('unregistered_estimator_method');return {estimated_k:null,confidence:null,estimator_status:'unusable'}}
  if(model.estimatorStatus!=='verified'){stats.diagnostics.push('estimator_not_verified');return {estimated_k:null,confidence:null,estimator_status:model.estimatorStatus}}
  return {estimated_k:stats.diagnostics.length===0&&stats.sample>0&&stats.net>0?method.estimate(stats.sample,stats.net):null,
    confidence:method.sampleBand(stats.sample),estimator_status:'verified'};
}
function estimateProvisional(model,stats){
  stats.diagnostics.push('estimator_not_verified');
  return {estimated_k:null,confidence:null,estimator_status:model.estimatorStatus==='verified'?'unusable':model.estimatorStatus};
}
const MODEL_ESTIMATORS=new Map([
  ['OUMI5_SPECIAL_ALTA',estimateSea],['TOKYO_GHOUL_399',estimateProvisional],['TOKYO_GHOUL_999',estimateProvisional]
]);

export function poolPachinkoEstimates(modelKey,rows){
  if(!Array.isArray(rows)||rows.length===0||rows.some(row=>row.machine_model_key!==modelKey||row.estimator_status!=='verified'||!Number.isFinite(row.estimated_k)||row.estimated_k<=0))return null;
  const keys=new Set(rows.map(row=>methodKey(row.estimator_id,row.estimator_version)));if(keys.size!==1)return null;
  const method=METHODS.get([...keys][0]);return method?.modelKey===modelKey?method.pool(rows):null;
}

export function estimatePachinko(modelKey,raw){
  const model=MODELS.find(item=>item.key===modelKey),{values,diagnostics}=inspectPachinkoRaw(raw);
  const nonNegative=(field)=>values[field]!==null&&values[field]>=0;
  const normalOut=nonNegative('out')&&nonNegative('special_out')&&values.out>=values.special_out?values.out-values.special_out:null;
  const normalSafe=nonNegative('safe')&&nonNegative('special_safe')&&values.safe>=values.special_safe?values.safe-values.special_safe:null;
  const net=normalOut!==null&&normalSafe!==null?normalOut-normalSafe:null;
  const sample=nonNegative('start')?values.start:null;
  if(!model)diagnostics.push('unknown_model');
  if(sample===0)diagnostics.push('no_activity');
  if(net!==null&&net<=0)diagnostics.push('non_positive_net_consumption');
  const handler=MODEL_ESTIMATORS.get(modelKey);
  let result={estimated_k:null,confidence:null,estimator_status:'unusable'};
  if(model&&identifyPachinkoModel(raw)?.key!==model.key)diagnostics.push('model_identity_mismatch');
  else if(model&&handler)result=handler(model,{sample,net,diagnostics});
  return {...result,normal_out:normalOut,normal_safe:normalSafe,net_consumption:net,
    estimator_id:model?.estimatorId??null,estimator_version:model?.estimatorVersion??null,
    sample_size:sample,diagnostics};
}

// Candidate values are explicitly separate from verified estimates. The PIA
// special-state counter scope is not independently calibrated for Ghoul yet.
// Never persist these into p_records.estimated_k or mark their status verified.
const GH_CANDIDATE_METHODS=new Map(MODELS.filter(m=>m.estimatorStatus==='provisional'&&m.candidateMethodId).map(m=>[m.key,{id:m.candidateMethodId,version:m.candidateMethodVersion}]));
export function estimatePachinkoCandidate(modelKey,raw){
  const method=GH_CANDIDATE_METHODS.get(modelKey);
  const unavailable={candidate_k:null,candidate_method_id:method?.id??null,candidate_method_version:method?.version??null};
  if(!method||identifyPachinkoModel(raw)?.key!==modelKey)return unavailable;
  const {values,diagnostics}=inspectPachinkoRaw(raw);
  const {start,out,safe,special_out,special_safe}=values;
  if(diagnostics.length||!Number.isSafeInteger(start)||start<=0)return unavailable;
  const net=out-special_out-safe+special_safe;
  if(!Number.isSafeInteger(net)||net<=0)return unavailable;
  const k=25*start/net;
  return {...unavailable,candidate_k:Number.isFinite(k)&&k>0?k:null};
}
export function poolPachinkoCandidates(modelKey,rows){
  const method=GH_CANDIDATE_METHODS.get(modelKey);
  if(!method||!Array.isArray(rows)||!rows.length)return null;
  let starts=0,net=0;
  for(const row of rows){
    const weight=row.occurrence_count??1;
    if(row.machine_model_key!==modelKey||row.estimator_status!=='provisional'||row.candidate_method_id!==method.id||row.candidate_method_version!==method.version||
      !Number.isSafeInteger(weight)||weight<=0||!Number.isSafeInteger(row.start)||row.start<=0||
      !Number.isSafeInteger(row.net_consumption)||row.net_consumption<=0||!Number.isFinite(row.candidate_k)||row.candidate_k<=0)return null;
    starts+=row.start*weight;net+=row.net_consumption*weight;
  }
  const k=25*starts/net;
  return Number.isSafeInteger(starts)&&Number.isSafeInteger(net)&&net>0&&Number.isFinite(k)&&k>0?k:null;
}
