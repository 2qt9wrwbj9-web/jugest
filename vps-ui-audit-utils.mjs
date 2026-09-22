function finite(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null}
export function formatExpectedSetting(value){const n=finite(value);return n===null?'—':n.toFixed(2)}
function observedDiffRow(row){
  const games=finite(row?.games),diff=finite(row?.diff),source=String(row?.diffSource||'').toLowerCase();
  return games!==null&&games>0&&diff!==null&&source!=='estimated'&&source!=='missing';
}
function mapSettingFromPosterior(q){
  if(!Array.isArray(q)||!q.length)return null;
  const values=q.map(finite);if(values.some(value=>value===null))return null;
  const max=Math.max(...values),ties=[];
  for(let i=0;i<values.length;i++)if(values[i]===max)ties.push(i+1);
  return ties.length?ties.reduce((sum,value)=>sum+value,0)/ties.length:null;
}
export function aggregateStoreRows(rows=[]){
  const list=Array.isArray(rows)?rows:[],gameRows=list.map(row=>finite(row?.games)).filter(value=>value!==null&&value>0),diffRows=list.filter(observedDiffRow),totalGames=diffRows.reduce((sum,row)=>sum+Number(row.games),0),totalDiff=diffRows.reduce((sum,row)=>sum+Number(row.diff),0);
  const settings=list.map(row=>mapSettingFromPosterior(row?.q)).filter(value=>value!==null);
  return Object.freeze({
    rowCount:list.length,diffCount:diffRows.length,totalGames,totalDiff:diffRows.length?totalDiff:null,
    avgGames:gameRows.length?gameRows.reduce((sum,value)=>sum+value,0)/gameRows.length:null,
    avgDiff:diffRows.length?totalDiff/diffRows.length:null,
    actualRate:totalGames>0?100*(1+totalDiff/(3*totalGames)):null,
    avgExpectedSetting:settings.length?settings.reduce((sum,value)=>sum+value,0)/settings.length:null
  });
}
export function machineStoreSummaries(rows=[]){
  const groups=new Map();
  for(const row of Array.isArray(rows)?rows:[]){const machine=String(row?.machine||'unknown'),name=String(row?.machineName||machine);if(!groups.has(machine))groups.set(machine,{machine,machineName:name,rows:[]});groups.get(machine).rows.push(row)}
  return Object.freeze([...groups.values()].sort((a,b)=>a.machine.localeCompare(b.machine,'ja')).map(group=>Object.freeze({...group,...aggregateStoreRows(group.rows),rows:undefined})));
}
export function mergeStoreRows(displayRows=[],rawRows=[]){
  const display=Array.isArray(displayRows)?displayRows:[],raw=Array.isArray(rawRows)?rawRows:[];
  if(!raw.length)return display.map(row=>({...row}));
  const rawByKey=new Map(raw.map(row=>[`${row?.machine}|${row?.tableNo}`,row]));
  return display.map(shown=>{
    const source=rawByKey.get(`${shown?.machine}|${shown?.tableNo}`)||{};
    const shownGames=finite(shown?.games),rawGames=finite(source?.games),shownSetting=finite(shown?.expectedSetting),rawSetting=finite(source?.expectedSetting);
    return {...source,...shown,
      games:shownGames!==null&&shownGames>0?shownGames:rawGames,
      expectedSetting:shownSetting!==null?shownSetting:rawSetting,
      diffSource:source?.diffSource??shown?.diffSource,
      gamesSource:source?.gamesSource??shown?.gamesSource,
      q:Array.isArray(shown?.q)?shown.q:(Array.isArray(source?.q)?source.q:null)
    };
  });
}

const HEAT_BANDS=Object.freeze([
  Object.freeze({max:2.49,color:'#ffffff',text:'#172342'}),
  Object.freeze({max:3.49,color:'#60a5fa',text:'#102040'}),
  Object.freeze({max:4.49,color:'#fde047',text:'#3f3300'}),
  Object.freeze({max:6,color:'#ef4444',text:'#ffffff'})
]);
function settingHeatBand(value){
  const n=finite(value);if(n===null)return null;const v=Math.min(6,Math.max(1,n));
  return HEAT_BANDS.find(band=>v<=band.max)||HEAT_BANDS.at(-1);
}
export function settingHeatColor(value){return settingHeatBand(value)?.color||'#f1f3f7'}
export function settingHeatTextColor(value){return settingHeatBand(value)?.text||'#172342'}

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
export const __test={finite,observedDiffRow,mapSettingFromPosterior,EXCLUSION_LABELS};
