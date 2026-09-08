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
function deltaSide(shadow,control){
 const out={meanUtility:finite(shadow.meanUtility)&&finite(control.meanUtility)?shadow.meanUtility-control.meanUtility:null};
 for(const k of ['top3','top5','top10'])out[k]={
  es:finite(shadow[k].es)&&finite(control[k].es)?shadow[k].es-control[k].es:null,
  p4:finite(shadow[k].p4)&&finite(control[k].p4)?shadow[k].p4-control[k].p4:null
 };
 return out;
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
 return deepFreeze({
  evaluatedDays:receipts.length,scoredDays:scored.length,warmupDays,totalSamples,
  shadowChampionDays,controlDays,abstainRate:receipts.length?controlDays/receipts.length:0,
  shadowWins,controlWins,ties,shadowWinRate:scored.length?shadowWins/scored.length:0,
  ensembleChanges,control,shadow,delta:deltaSide(shadow,control),axisUsage
 });
}
