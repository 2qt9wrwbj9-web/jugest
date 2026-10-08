export const PREDICTION_POLICY_VERSION='prospective-jst-v1';
export function businessDateAt(nowIso=new Date().toISOString()){
  const ms=Date.parse(nowIso);if(!Number.isFinite(ms))throw new TypeError('nowIso must be an ISO time');
  return new Date(ms+9*3600000).toISOString().slice(0,10);
}
export function nextBusinessDate(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date)throw new TypeError('invalid business date');
  return new Date(Date.parse(`${date}T00:00:00Z`)+86400000).toISOString().slice(0,10);
}
export function operationalTargetDate({frontierDate,nowIso=new Date().toISOString()}={}){
  const fromHistory=nextBusinessDate(frontierDate),fromClock=nextBusinessDate(businessDateAt(nowIso));
  return fromHistory>fromClock?fromHistory:fromClock;
}
export function isProspectivePrediction({targetDate,sourceFrontierDate,createdAt}={}){
  const deadline=Date.parse(`${targetDate}T00:00:00+09:00`),at=Date.parse(createdAt);
  return Number.isFinite(at)&&Number.isFinite(deadline)&&at<deadline&&String(sourceFrontierDate)<String(targetDate);
}
export function sameCandidateSet(a,b){
  const identity=row=>`${String(row.tableNo??row.machineKey).trim()}\0${String(row.machineName??row.sourceMachineName??row.machine).trim()}`;
  const aa=a.map(identity).sort(),bb=b.map(identity).sort();
  return aa.length===bb.length&&new Set(aa).size===aa.length&&aa.every((k,i)=>k===bb[i]);
}
