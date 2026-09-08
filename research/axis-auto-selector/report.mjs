const EPSILON=1e-12;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
const deepFreeze=value=>{
 if(value===null||typeof value!=='object'||Object.isFrozen(value))return value;
 for(const key of Reflect.ownKeys(value))deepFreeze(value[key]);
 return Object.freeze(value);
};
function averageTop(receipts,side,k,field){
 const values=receipts.map(r=>r?.[side]?.[k]?.[field]).filter(finite);
 return mean(values);
}
function sideSummary(receipts,side){
 const utility=receipts.map(r=>r[`${side}Utility`]).filter(finite);
 const top={};
 for(const k of ['top3','top5','top10'])top[k]={es:averageTop(receipts,side,k,'es'),p4:averageTop(receipts,side,k,'p4')};
 return{meanUtility:mean(utility),scoredDays:utility.length,...top};
}
function deltaSide(left,right){
 const out={meanUtility:finite(left.meanUtility)&&finite(right.meanUtility)?left.meanUtility-right.meanUtility:null};
 for(const k of ['top3','top5','top10'])out[k]={
  es:finite(left[k].es)&&finite(right[k].es)?left[k].es-right[k].es:null,
  p4:finite(left[k].p4)&&finite(right[k].p4)?left[k].p4-right[k].p4:null
 };
 return out;
}
function phase2bSummary(receipts){
 if(!receipts.some(r=>r&&('selectorDecision'in r||'operationalDecision'in r)))return null;
 const selectorShadow=receipts.filter(r=>r.selectorDecision==='SHADOW_CHAMPION');
 const allowed=selectorShadow.filter(r=>r.operationalDecision==='SHADOW_CHAMPION');
 const blocked=selectorShadow.filter(r=>r.operationalDecision==='CONTROL');
 const coldStart=blocked.filter(r=>r.gate?.reason==='oos_insufficient_evidence');
 const operationalControlDays=receipts.filter(r=>r.operationalDecision!=='SHADOW_CHAMPION').length;
 const operationalScored=receipts.filter(r=>finite(r.controlUtility)&&finite(r.operationalUtility));
 let operationalShadowWins=0,operationalControlWins=0,operationalTies=0;
 for(const receipt of operationalScored){
  const delta=receipt.operationalUtility-receipt.controlUtility;
  if(delta>EPSILON)operationalShadowWins+=1;else if(delta<-EPSILON)operationalControlWins+=1;else operationalTies+=1;
 }
 const selectorDeltas=receipts.filter(r=>finite(r.controlUtility)&&finite(r.shadowUtility)).map(r=>r.shadowUtility-r.controlUtility);
 const operationalDeltas=operationalScored.map(r=>r.operationalUtility-r.controlUtility);
 const operationalVsSelector=receipts.filter(r=>finite(r.operationalUtility)&&finite(r.shadowUtility)).map(r=>r.operationalUtility-r.shadowUtility);
 const preventedLossDays=blocked.filter(r=>finite(r.utilityDelta)&&r.utilityDelta<-EPSILON).length;
 const missedGainDays=blocked.filter(r=>finite(r.utilityDelta)&&r.utilityDelta>EPSILON).length;

 const ensembleStats=Object.create(null);
 let previousShadowEnsemble=null,ensembleSwitches=0,gateTransitions=0;
 for(const receipt of selectorShadow){
  const key=receipt.ensembleKey;
  if(typeof key!=='string'||key.length===0)continue;
  if(previousShadowEnsemble!==null&&key!==previousShadowEnsemble)ensembleSwitches+=1;
  previousShadowEnsemble=key;
  const stat=ensembleStats[key]??{selectedDays:0,allowedDays:0,blockedDays:0,coldStartBlockedDays:0,maxEvidenceCount:0,gateTransitions:0};
  stat.selectedDays+=1;
  if(receipt.operationalDecision==='SHADOW_CHAMPION')stat.allowedDays+=1;else stat.blockedDays+=1;
  if(receipt.gate?.reason==='oos_insufficient_evidence')stat.coldStartBlockedDays+=1;
  if(Number.isInteger(receipt.gate?.evidenceCount))stat.maxEvidenceCount=Math.max(stat.maxEvidenceCount,receipt.gate.evidenceCount);
  if(receipt.gate?.stateBefore&&receipt.gate?.stateAfter&&receipt.gate.stateBefore!==receipt.gate.stateAfter){stat.gateTransitions+=1;gateTransitions+=1;}
  ensembleStats[key]=stat;
 }
 const byEnsemble=Object.fromEntries(Object.entries(ensembleStats).sort(([a],[b])=>a.localeCompare(b)));
 const control=sideSummary(operationalScored,'control'),selector=sideSummary(receipts.filter(r=>finite(r.shadowUtility)),'shadow'),operational=sideSummary(operationalScored,'operational');
 return{
  selectorShadowEligibleDays:selectorShadow.length,
  gateAllowedShadowDays:allowed.length,
  gateBlockedShadowDays:blocked.length,
  coldStartBlockedDays:coldStart.length,
  operationalControlDays,
  operationalAbstainRate:receipts.length?operationalControlDays/receipts.length:0,
  operationalShadowWins,operationalControlWins,operationalTies,
  operationalShadowWinRate:operationalScored.length?operationalShadowWins/operationalScored.length:0,
  preventedLossDays,missedGainDays,
  controlToSelectorMeanUtilityDelta:mean(selectorDeltas),
  controlToOperationalMeanUtilityDelta:mean(operationalDeltas),
  operationalToSelectorMeanUtilityDelta:mean(operationalVsSelector),
  distinctEnsembleKeys:Object.keys(byEnsemble).length,ensembleSwitches,gateTransitions,byEnsemble,
  control,selector,operational,
  controlToSelector:deltaSide(selector,control),
  controlToOperational:deltaSide(operational,control),
  operationalToSelector:deltaSide(operational,selector)
 };
}
export function summarizeWalkForward({receipts,warmupDays,totalSamples}={}){
 if(!Array.isArray(receipts))throw new TypeError('receipts must be an array');
 const scored=receipts.filter(r=>finite(r.controlUtility)&&finite(r.shadowUtility));
 let shadowWins=0,controlWins=0,ties=0;
 for(const receipt of scored){
  const delta=receipt.shadowUtility-receipt.controlUtility;
  if(delta>EPSILON)shadowWins+=1;else if(delta<-EPSILON)controlWins+=1;else ties+=1;
 }
 let ensembleChanges=0,previous=null;
 for(const receipt of receipts){
  if(previous!==null&&receipt.ensembleKey!==previous)ensembleChanges+=1;
  previous=receipt.ensembleKey;
 }
 const axisUse=Object.create(null);
 for(const receipt of receipts)for(const axis of receipt.selectedAxes||[]){
  const stat=axisUse[axis.id]??{days:0,weightTotal:0};stat.days+=1;stat.weightTotal+=axis.weight;axisUse[axis.id]=stat;
 }
 const axisUsage=Object.fromEntries(Object.entries(axisUse).sort(([a],[b])=>a.localeCompare(b)).map(([id,stat])=>[id,{days:stat.days,meanWeight:stat.days?stat.weightTotal/stat.days:null}]));
 const shadow=sideSummary(scored,'shadow'),control=sideSummary(scored,'control');
 const shadowChampionDays=receipts.filter(r=>r.decision==='SHADOW_CHAMPION').length,controlDays=receipts.length-shadowChampionDays;
 const phase2b=phase2bSummary(receipts);
 return deepFreeze({
  evaluatedDays:receipts.length,scoredDays:scored.length,warmupDays,totalSamples,
  shadowChampionDays,controlDays,abstainRate:receipts.length?controlDays/receipts.length:0,
  shadowWins,controlWins,ties,shadowWinRate:scored.length?shadowWins/scored.length:0,
  ensembleChanges,control,shadow,delta:deltaSide(shadow,control),axisUsage,
  ...(phase2b?{phase2b}:{})
 });
}
