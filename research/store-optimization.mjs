/** Offline research only. Never imported by the app. p4 scores are inferred outcomes, NOT true settings. */
import { createHash } from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
export const candidateGrid=()=>[30,60,90,180].flatMap(windowDays=>[1,2].map(maxDims=>({id:`${windowDays}d-${maxDims}dim`,windowDays,maxDims})));
export async function evaluateWalkForward({days,shop,predictor,candidates,outerDates,minHistoryDays=45,innerDays=12,k=5}){
 if(!Number.isInteger(k)||k<1||!Number.isInteger(innerDays)||innerDays<1)throw Error('invalid evaluation size');
 if(!candidates?.length||candidates[0].id!=='baseline'||new Set(candidates.map(c=>c.id)).size!==candidates.length)throw Error('first candidate must be unique baseline');
 if(candidates.some(c=>!Number.isInteger(c.windowDays)||c.windowDays<1))throw Error('invalid windowDays');
 const source=structuredClone(days.filter(d=>d.shop===shop)).sort((a,b)=>a.date.localeCompare(b.date));
 const keys=new Set();
 for(const d of source){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||new Date(d.date).toISOString().slice(0,10)!==d.date)throw Error('invalid date');
  if(keys.has(d.date))throw Error('duplicate store date');keys.add(d.date);
  // Strict import contract: late/corrected data needs a point-in-time adapter, not backdating.
  if(d.availableDate&&d.availableDate!==d.date)throw Error('availableDate requires point-in-time adapter');
  if(!Array.isArray(d.machines)||new Set(d.machines.map(r=>String(r.tableNo))).size!==d.machines.length)throw Error('duplicate/missing machine IDs');
  if(d.machines.some(r=>!Number.isFinite(r.p4)||r.p4<0||r.p4>1))throw Error('p4 must be finite [0,1]');
 }
 if(new Set(outerDates).size!==outerDates.length)throw Error('duplicate outer date');
 const predict=async(candidate,targetDate)=>{
  const earliest=new Date(Date.parse(targetDate)-candidate.windowDays*864e5).toISOString().slice(0,10);
  const history=source.filter(d=>d.date<targetDate&&d.date>=earliest);
  if(history.length<minHistoryDays)return null;
  // A fresh immutable payload prevents accidental mutation and excludes target/future outcomes.
  // Predictors must be isolated/pure: this cannot police a callback's globals or closures.
  const input=freeze(structuredClone({history,targetDate,shop,candidate}));
  const prediction=await predictor(input);
  if(!Array.isArray(prediction)||new Set(prediction.map(String)).size!==prediction.length)throw Error('duplicate/invalid prediction');
  const ranking=prediction.slice(0,k).map(String);
  if(ranking.length!==k)return null;
  return {ranking,hash:hash({input,prediction:ranking})};
 };
 const score=(prediction,date)=>{
  if(!prediction)return null;
  const actual=new Map(source.find(d=>d.date===date)?.machines.map(r=>[String(r.tableNo),r.p4])||[]);
  const values=prediction.ranking.map(id=>actual.get(id));
  return values.every(Number.isFinite)?mean(values):null;
 };
 const folds=[];
 for(const targetDate of [...outerDates].sort()){
  if(!keys.has(targetDate))throw Error('missing outer outcome');
  const selectionDates=source.filter(d=>d.date<targetDate).slice(-innerDays).map(d=>d.date);
  const scores=[];
  for(const candidate of candidates){const values=[];for(const date of selectionDates)values.push(score(await predict(candidate,date),date));scores.push({id:candidate.id,values});}
  // Paired, identical validation dates: incomplete candidates are ineligible, never cherry-picked.
  const selection=scores.map(s=>({id:s.id,n:s.values.filter(Number.isFinite).length,score:s.values.length===innerDays&&s.values.every(Number.isFinite)?mean(s.values):null}));
  const eligible=selection.filter(s=>s.score!==null).sort((a,b)=>b.score-a.score||candidates.findIndex(c=>c.id===a.id)-candidates.findIndex(c=>c.id===b.id));
  const selected=eligible[0]?.id||'baseline';
  // Freeze both predictions before inspecting either outer outcome.
  const basePred=await predict(candidates[0],targetDate),selectedPred=selected==='baseline'?basePred:await predict(candidates.find(c=>c.id===selected),targetDate);
  const baseline=score(basePred,targetDate),optimized=score(selectedPred,targetDate);
  folds.push({targetDate,selectionDates,selection,selected,baseline,optimized,delta:baseline!==null&&optimized!==null?optimized-baseline:null,predictionHashes:{baseline:basePred?.hash||null,selected:selectedPred?.hash||null}});
 }
 return {schema:'jugest-store-research-v1',shop,k,metric:'mean inferred p4 among top K (not true-setting precision)',decision:'RESEARCH_ONLY',inputHash:hash(source),configHash:hash({candidates,outerDates,minHistoryDays,innerDays,k}),folds,pairedDays:folds.filter(f=>f.delta!==null).length,meanDelta:mean(folds.map(f=>f.delta).filter(Number.isFinite))};
}
