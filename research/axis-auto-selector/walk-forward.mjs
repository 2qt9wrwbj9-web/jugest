import {createHash} from 'node:crypto';
import {createAxisRegistry} from './registry.mjs';
import {scoreDay,validatePointInTimeSamples} from './evaluator.mjs';
import {DEFAULT_SELECTOR_CONFIG} from './selector.mjs';
import {rankShadowRows,runShadowEvaluation} from './shadow.mjs';
import {DEFAULT_OOS_GATE_CONFIG,evaluateOperationalGate} from './oos-gate.mjs';
import {summarizeWalkForward} from './report.mjs';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const deepFreeze=value=>{
 if(value===null||typeof value!=='object'||Object.isFrozen(value))return value;
 for(const key of Reflect.ownKeys(value))deepFreeze(value[key]);
 return Object.freeze(value);
};
function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(`${value}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function requireDate(value,field){if(value!==null&&value!==undefined&&!validDate(value))throw new TypeError(`${field} must be a valid YYYY-MM-DD date`)}
function digest(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex')}
function numericKeyCompare(a,b){return String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'})}
function controlKeys(sample){return [...sample.rows].sort((a,b)=>a.controlRank-b.controlRank||numericKeyCompare(a.key,b.key)).map(row=>row.key)}
function scoreByRank(sample,rankByKey){
 const rows=sample.rows.map(row=>({...row,fixedBonus:0,axes:{'__phase2-rank':-rankByKey.get(row.key)}}));
 return scoreDay(rows,{'__phase2-rank':1});
}
function ensembleKey(profile){
 return digest({decision:profile.decision,selectedAxes:(profile.selectedAxes||[]).map(axis=>({id:axis.id,version:axis.version,weight:axis.weight}))});
}
function selectedAxes(profile){return (profile.selectedAxes||[]).map(axis=>({id:axis.id,version:axis.version,weight:axis.weight}))}
function preOutcomeHash({sample,store,profile,historyThrough,selectorDecision,operationalDecision,eKey,gate,controlRankedKeys,shadowRankedKeys,operationalRankedKeys}){
 return digest({
  store,targetDate:sample.targetDate,trainingCutoff:sample.trainingCutoff,sourceSignature:sample.sourceSignature,
  historyThrough,profileId:profile.id,decision:profile.decision,selectorDecision,operationalDecision,ensembleKey:eKey,
  gate:{
   stateBefore:gate.stateBefore,stateAfter:gate.stateAfter,reason:gate.reason,
   evidenceCount:gate.evidenceCount,evidenceDates:gate.evidenceDates,windowStart:gate.windowStart,windowEnd:gate.windowEnd,
   meanDelta:gate.meanDelta,sdDelta:gate.sdDelta,oosScore:gate.oosScore,
   minEvidenceDays:gate.minEvidenceDays,windowEligibleDays:gate.windowEligibleDays,
   releaseScore:gate.releaseScore,keepScore:gate.keepScore,uncertaintyPenalty:gate.uncertaintyPenalty
  },
  selectedAxes:selectedAxes(profile),controlRankedKeys,shadowRankedKeys,operationalRankedKeys
 });
}
function requireBundle(bundle,requestedStore){
 if(bundle===null||typeof bundle!=='object'||Array.isArray(bundle))throw new TypeError('bundle must be an object');
 if(bundle.schema!=='jugest-axis-samples-v1')throw new TypeError('bundle schema must be jugest-axis-samples-v1');
 if(typeof bundle.store!=='string'||bundle.store.length===0)throw new TypeError('bundle store must be a non-empty string');
 if(requestedStore!==null&&requestedStore!==undefined&&requestedStore!==bundle.store)throw new TypeError(`requested store ${requestedStore} does not match bundle store ${bundle.store}`);
 return validatePointInTimeSamples(bundle.samples);
}

export async function runWalkForwardBacktest({bundle,store=null,warmupDays=DEFAULT_SELECTOR_CONFIG.minEvaluatedDays,startDate=null,endDate=null,registry=createAxisRegistry(),config=DEFAULT_SELECTOR_CONFIG,oosGateConfig=DEFAULT_OOS_GATE_CONFIG}={}){
 requireDate(startDate,'startDate');requireDate(endDate,'endDate');
 if(startDate&&endDate&&startDate>endDate)throw new RangeError('startDate must not be after endDate');
 if(!Number.isInteger(warmupDays)||warmupDays<0)throw new TypeError('warmupDays must be a non-negative integer');
 const samples=requireBundle(bundle,store);
 const history=[],receipts=[];
 let warmupCount=0;
 for(const sample of samples){
  if(endDate&&sample.targetDate>endDate)break;
  const inWindow=!startDate||sample.targetDate>=startDate;
  if(history.length<warmupDays||!inWindow){
   if(inWindow&&history.length<warmupDays)warmupCount+=1;
   history.push(sample);
   continue;
  }
  const historyThrough=history.at(-1)?.targetDate??null;
  const evaluation=await runShadowEvaluation({store:bundle.store,samples:history,registry,config});
  const profile=evaluation.profile,selectorDecision=profile.decision;
  const rankedShadow=rankShadowRows(sample.rows,profile,registry);
  const controlRankedKeys=controlKeys(sample),shadowRankedKeys=rankedShadow.map(row=>row.key),eKey=ensembleKey(profile);
  const gate=evaluateOperationalGate({
   store:bundle.store,targetDate:sample.targetDate,ensembleKey:eKey,selectorDecision,
   priorReceipts:receipts,config:oosGateConfig
  });
  const operationalDecision=gate.operationalDecision;
  const operationalRankedKeys=operationalDecision==='SHADOW_CHAMPION'?shadowRankedKeys:controlRankedKeys;
  const frozenPreOutcomeHash=preOutcomeHash({
   sample,store:bundle.store,profile,historyThrough,selectorDecision,operationalDecision,eKey,gate,
   controlRankedKeys,shadowRankedKeys,operationalRankedKeys
  });

  const shadowRankByKey=new Map(rankedShadow.map(row=>[row.key,row.shadowRank]));
  const controlRankByKey=new Map(sample.rows.map(row=>[row.key,row.controlRank]));
  const operationalRankByKey=new Map(operationalRankedKeys.map((key,index)=>[key,index+1]));
  const control=scoreByRank(sample,controlRankByKey),shadow=scoreByRank(sample,shadowRankByKey),operational=scoreByRank(sample,operationalRankByKey);
  const controlUtility=finite(control?.utility)?control.utility:null,shadowUtility=finite(shadow?.utility)?shadow.utility:null,operationalUtility=finite(operational?.utility)?operational.utility:null;
  receipts.push(deepFreeze({
   store:bundle.store,targetDate:sample.targetDate,trainingCutoff:sample.trainingCutoff,sourceSignature:sample.sourceSignature,
   historyThrough,historyCount:history.length,decision:profile.decision,selectorDecision,operationalDecision,reasons:[...profile.reasons],profileId:profile.id,
   ensembleKey:eKey,selectedAxes:selectedAxes(profile),gate,
   preOutcomeHash:frozenPreOutcomeHash,
   controlRankedKeys,shadowRankedKeys,operationalRankedKeys,
   controlUtility,shadowUtility,operationalUtility,
   utilityDelta:finite(controlUtility)&&finite(shadowUtility)?shadowUtility-controlUtility:null,
   operationalUtilityDelta:finite(controlUtility)&&finite(operationalUtility)?operationalUtility-controlUtility:null,
   control:control??null,shadow:shadow??null,operational:operational??null
  }));
  history.push(sample);
 }
 const summary=summarizeWalkForward({receipts,warmupDays:warmupCount,totalSamples:samples.filter(sample=>!endDate||sample.targetDate<=endDate).length});
 return deepFreeze({
  schema:'jugest-axis-walk-forward-v1',shadowOnly:true,phase2b:true,store:bundle.store,
  range:{startDate:startDate??samples[0]?.targetDate??null,endDate:endDate??samples.at(-1)?.targetDate??null},
  warmup:{requested:warmupDays,count:warmupCount},receipts,summary
 });
}
