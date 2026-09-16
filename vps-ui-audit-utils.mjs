function finite(value){const n=Number(value);return Number.isFinite(n)?n:null}
function observedDiffRow(row){
  const games=finite(row?.games),diff=finite(row?.diff),source=String(row?.diffSource||'').toLowerCase();
  return games!==null&&games>0&&diff!==null&&source!=='estimated'&&source!=='missing';
}
export function aggregateStoreRows(rows=[]){
  const list=Array.isArray(rows)?rows:[],diffRows=list.filter(observedDiffRow),totalGames=diffRows.reduce((sum,row)=>sum+Number(row.games),0),totalDiff=diffRows.reduce((sum,row)=>sum+Number(row.diff),0);
  const settings=list.map(row=>finite(row?.expectedSetting)).filter(value=>value!==null);
  return Object.freeze({
    rowCount:list.length,diffCount:diffRows.length,totalGames,totalDiff:diffRows.length?totalDiff:null,
    avgDiff:diffRows.length?totalDiff/diffRows.length:null,
    actualRate:totalGames>0?100*(1+totalDiff/(3*totalGames)):null,
    avgExpectedSetting:settings.length?settings.reduce((a,b)=>a+b,0)/settings.length:null
  });
}
export function machineStoreSummaries(rows=[]){
  const groups=new Map();
  for(const row of Array.isArray(rows)?rows:[]){const machine=String(row?.machine||'unknown'),name=String(row?.machineName||machine);if(!groups.has(machine))groups.set(machine,{machine,machineName:name,rows:[]});groups.get(machine).rows.push(row)}
  return Object.freeze([...groups.values()].sort((a,b)=>a.machine.localeCompare(b.machine,'ja')).map(group=>Object.freeze({...group,...aggregateStoreRows(group.rows),rows:undefined})));
}
export function normalizeMachineSelection(available=[],saved=null){
  const ids=[...new Set((Array.isArray(available)?available:[]).map(value=>String(value)))];
  if(!Array.isArray(saved))return ids;
  const selected=new Set(saved.map(value=>String(value)));
  return ids.filter(id=>selected.has(id));
}
export function machineFilterStorageKey(scope,shop){
  return `jugest:vps-machine-filter:v1:${String(scope||'data')}:${encodeURIComponent(String(shop||''))}`;
}
export function filterMachineSummaries(rows=[],selected=null){
  const list=Array.isArray(rows)?rows:[];
  if(!Array.isArray(selected))return list.slice();
  const allowed=new Set(selected.map(value=>String(value)));
  return list.filter(row=>allowed.has(String(row?.machine)));
}
const EXCLUSION_LABELS=Object.freeze({
  insufficient_history:'履歴が7日未満（ウォームアップ）',
  pre_insufficient_research_data:'PREの学習・検証データ不足',
  pre_cycle_incomplete:'PREモデル探索が収束前',
  missing_pre_research:'PRE予測を生成できなかった',
  missing_current_shadow:'現行版予測を生成できなかった',
  missing_outcome:'実績差枚がなく答え合わせ不可',
  outcome_hash_conflict:'実績データが途中で変化したため除外',
  unscored:'実績待ち・未採点'
});
export function exclusionReasonLabel(code){const key=String(code||'').trim();return EXCLUSION_LABELS[key]||key}
export const __test={finite,observedDiffRow,EXCLUSION_LABELS};
