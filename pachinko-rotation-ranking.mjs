// Read-only 30-business-day pachinko rotation ranking.
// A daily estimate contributes at most once to one machine; never mix candidate
// formulas with independently verified estimates.
export const RANK_WINDOW_DAYS=30;
export const MIN_RANK_DAYS=10;
export const MIN_DAILY_START=500;
function validNumber(value){return value!==null&&value!==undefined&&value!==''&&typeof value!=='boolean'&&Number.isFinite(Number(value))?Number(value):null}
function median(values){if(!values.length)return null;const s=[...values].sort((a,b)=>a-b),i=Math.floor((s.length-1)/2),j=Math.floor(s.length/2);return(s[i]+s[j])/2}
function rankingKey(record){return String(record?.identity||'').trim()}
export function buildPachinkoRotationRanking(matrix,{model='',minDays=MIN_RANK_DAYS,minStart=MIN_DAILY_START}={}){
 const dates=[...new Set((matrix?.dates||[]).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d))))].sort((a,b)=>b.localeCompare(a));
 const newest=dates[0]||'',start=newest?new Date(newest+'T00:00:00Z'):null;
 if(start)start.setUTCDate(start.getUTCDate()-(RANK_WINDOW_DAYS-1));
 const cutoff=start?.toISOString().slice(0,10)||'';
 const window=dates.filter(date=>date>=cutoff).slice(0,RANK_WINDOW_DAYS);
 const dateSet=new Set(window),machines=new Map(),seen=new Set();
 for(const r of Array.isArray(matrix?.records)?matrix.records:[]){
  if(!r||!dateSet.has(r.business_date)||model&&r.machine_model_key!==model)continue;
  const id=rankingKey(r),day=String(r.business_date||''),key=id+'|'+day;
  if(!id||seen.has(key))continue;
  seen.add(key);
  if(!machines.has(id))machines.set(id,{identity:id,machineNo:String(r.machine_no||''),machineModelKey:String(r.machine_model_key||''),verified:[],provisional:[],excluded:0,history:[]});
  const m=machines.get(id),start=validNumber(r.sample_size),verified=validNumber(r.estimated_k),candidate=validNumber(r.candidate_k);
  if(start===null||start<minStart){m.excluded++;continue}
  if(r.estimator_status==='verified'&&verified!==null&&verified>0){
    m.verified.push(verified);m.history.push({date:day,k:verified,status:'verified',start,recordId:r.record_id});
  }else if(r.estimator_status==='provisional'&&candidate!==null&&candidate>0){
    m.provisional.push(candidate);m.history.push({date:day,k:candidate,status:'provisional',start,recordId:r.record_id});
  }else{m.excluded++}
 }
 const entries=[...machines.values()].map(m=>{
  const verifiedDays=m.verified.length,candidateDays=m.provisional.length,eligible=verifiedDays>=minDays;
  const verifiedMean=verifiedDays?m.verified.reduce((a,b)=>a+b,0)/verifiedDays:null;
  const referenceMean=candidateDays?m.provisional.reduce((a,b)=>a+b,0)/candidateDays:null;
  return {...m,eligible,verifiedDays,candidateDays,medianK:median(m.verified),meanK:verifiedMean,
   referenceMedianK:median(m.provisional),referenceMeanK:referenceMean,
   history:m.history.sort((a,b)=>b.date.localeCompare(a.date))}
 });
 const eligible=entries.filter(x=>x.eligible).sort((a,b)=>b.medianK-a.medianK||b.verifiedDays-a.verifiedDays||a.machineNo.localeCompare(b.machineNo,'ja',{numeric:true}));
 return {windowDays:window.length,startDate:window.at(-1)||null,endDate:window[0]||null,minDays,minStart,
  ranked:eligible.map((r,i)=>({...r,rank:i+1})),
  insufficient:entries.filter(r=>!r.eligible&&r.verifiedDays>0).sort((a,b)=>b.verifiedDays-a.verifiedDays||b.medianK-a.medianK),
  provisional:entries.filter(r=>r.candidateDays>0).sort((a,b)=>b.candidateDays-a.candidateDays||b.referenceMedianK-a.referenceMedianK),
  observedMachines:entries.length};
}
export const __test={median,validNumber,rankingKey};
