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
function requireNonEmpty(value,name){if(typeof value!=='string'||value.trim()==='')throw new TypeError(`${name} must be a non-empty string`);return value}

export const DEFAULT_OOS_GATE_CONFIG=deepFreeze({
 minEvidenceDays:12,
 windowEligibleDays:24,
 releaseScore:.002,
 keepScore:0,
 uncertaintyPenalty:.12
});

function configWithDefaults(config=DEFAULT_OOS_GATE_CONFIG){
 if(!isRecord(config))throw new TypeError('config must be an object');
 const cfg={...DEFAULT_OOS_GATE_CONFIG,...config};
 if(!Number.isInteger(cfg.minEvidenceDays)||cfg.minEvidenceDays<1)throw new RangeError('minEvidenceDays must be a positive integer');
 if(!Number.isInteger(cfg.windowEligibleDays)||cfg.windowEligibleDays<cfg.minEvidenceDays)throw new RangeError('windowEligibleDays must be an integer >= minEvidenceDays');
 for(const field of ['releaseScore','keepScore','uncertaintyPenalty'])if(!finite(cfg[field])||cfg[field]<0)throw new RangeError(`${field} must be a finite non-negative number`);
 if(cfg.releaseScore<cfg.keepScore)throw new RangeError('releaseScore must be >= keepScore');
 return deepFreeze(cfg);
}
function validateReceiptStream(priorReceipts,targetDate){
 if(!Array.isArray(priorReceipts))throw new TypeError('priorReceipts must be an array');
 let previous=null;
 for(let index=0;index<priorReceipts.length;index+=1){
  const receipt=priorReceipts[index];
  if(!isRecord(receipt))throw new TypeError(`prior receipt ${index} must be an object`);
  if(!validDate(receipt.targetDate))throw new TypeError(`prior receipt ${index} targetDate must be a valid YYYY-MM-DD date`);
  if(previous!==null&&receipt.targetDate<=previous)throw new RangeError('priorReceipts must be in strict chronological order');
  if(receipt.targetDate>=targetDate)throw new RangeError(`prior receipt ${receipt.targetDate} must be before targetDate ${targetDate}`);
  requireNonEmpty(receipt.store,`prior receipt ${index} store`);
  if(!['CONTROL','SHADOW_CHAMPION'].includes(receipt.selectorDecision))throw new TypeError(`prior receipt ${index} selectorDecision is invalid`);
  requireNonEmpty(receipt.ensembleKey,`prior receipt ${index} ensembleKey`);
  previous=receipt.targetDate;
 }
}
function evidenceFor({priorReceipts,store,ensembleKey,windowEligibleDays}){
 const eligible=[];
 for(const receipt of priorReceipts){
  if(receipt.store!==store||receipt.selectorDecision!=='SHADOW_CHAMPION'||receipt.ensembleKey!==ensembleKey)continue;
  if(!finite(receipt.utilityDelta))throw new TypeError(`gate-eligible receipt ${receipt.targetDate} utilityDelta must be finite`);
  if(typeof receipt.preOutcomeHash!=='string'||receipt.preOutcomeHash.length===0)throw new TypeError(`gate-eligible receipt ${receipt.targetDate} preOutcomeHash must be a non-empty string`);
  eligible.push(receipt);
 }
 return eligible.slice(-windowEligibleDays);
}
function stats(evidence,uncertaintyPenalty){
 if(evidence.length===0)return{meanDelta:null,sdDelta:null,oosScore:null};
 const values=evidence.map(receipt=>receipt.utilityDelta);
 const meanDelta=values.reduce((sum,value)=>sum+value,0)/values.length;
 const sdDelta=Math.sqrt(values.reduce((sum,value)=>sum+(value-meanDelta)**2,0)/values.length);
 const oosScore=meanDelta-uncertaintyPenalty*sdDelta/Math.sqrt(values.length);
 if(!finite(meanDelta)||!finite(sdDelta)||!finite(oosScore))throw new RangeError('gate statistics must be finite');
 return{meanDelta,sdDelta,oosScore};
}
function resultBase({store,targetDate,ensembleKey,selectorDecision,previousState,cfg,evidence,statistics}){
 const evidenceDates=evidence.map(receipt=>receipt.targetDate);
 return{
  store,targetDate,ensembleKey,selectorDecision,stateBefore:previousState,
  evidenceCount:evidenceDates.length,evidenceDates,
  windowStart:evidenceDates[0]??null,windowEnd:evidenceDates.at(-1)??null,
  meanDelta:statistics.meanDelta,sdDelta:statistics.sdDelta,oosScore:statistics.oosScore,
  minEvidenceDays:cfg.minEvidenceDays,windowEligibleDays:cfg.windowEligibleDays,
  releaseScore:cfg.releaseScore,keepScore:cfg.keepScore,uncertaintyPenalty:cfg.uncertaintyPenalty
 };
}

export function evaluateOperationalGate({store,targetDate,ensembleKey,selectorDecision,priorReceipts=[],previousState='BLOCKED',config=DEFAULT_OOS_GATE_CONFIG}={}){
 requireNonEmpty(store,'store');requireNonEmpty(ensembleKey,'ensembleKey');
 if(!validDate(targetDate))throw new TypeError('targetDate must be a valid YYYY-MM-DD date');
 if(!['CONTROL','SHADOW_CHAMPION'].includes(selectorDecision))throw new TypeError('selectorDecision must be CONTROL or SHADOW_CHAMPION');
 if(!['BLOCKED','ALLOWED'].includes(previousState))throw new TypeError('previousState must be BLOCKED or ALLOWED');
 const cfg=configWithDefaults(config);
 validateReceiptStream(priorReceipts,targetDate);
 const evidence=evidenceFor({priorReceipts,store,ensembleKey,windowEligibleDays:cfg.windowEligibleDays});
 const statistics=stats(evidence,cfg.uncertaintyPenalty);
 const base=resultBase({store,targetDate,ensembleKey,selectorDecision,previousState,cfg,evidence,statistics});
 if(selectorDecision==='CONTROL')return deepFreeze({...base,operationalDecision:'CONTROL',stateAfter:previousState,reason:'selector_control'});
 if(evidence.length<cfg.minEvidenceDays)return deepFreeze({...base,operationalDecision:'CONTROL',stateAfter:'BLOCKED',reason:'oos_insufficient_evidence'});
 if(previousState==='ALLOWED'&&statistics.oosScore>=cfg.keepScore&&statistics.meanDelta>=0){
  return deepFreeze({...base,operationalDecision:'SHADOW_CHAMPION',stateAfter:'ALLOWED',reason:'oos_gate_kept'});
 }
 if(previousState!=='ALLOWED'&&statistics.oosScore>=cfg.releaseScore&&statistics.meanDelta>0){
  return deepFreeze({...base,operationalDecision:'SHADOW_CHAMPION',stateAfter:'ALLOWED',reason:'oos_gate_released'});
 }
 return deepFreeze({...base,operationalDecision:'CONTROL',stateAfter:'BLOCKED',reason:'oos_gate_blocked'});
}
