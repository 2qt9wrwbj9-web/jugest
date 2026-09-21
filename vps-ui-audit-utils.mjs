function finite(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null}
export function formatExpectedSetting(value){const n=finite(value);return n===null?'—':n.toFixed(2)}
function observedDiffRow(row){
  const games=finite(row?.games),diff=finite(row?.diff),source=String(row?.diffSource||'').toLowerCase();
  return games!==null&&games>0&&diff!==null&&source!=='estimated'&&source!=='missing';
}
export function aggregateStoreRows(rows=[]){
  const list=Array.isArray(rows)?rows:[],gameRows=list.map(row=>finite(row?.games)).filter(value=>value!==null&&value>0),diffRows=list.filter(observedDiffRow),totalGames=diffRows.reduce((sum,row)=>sum+Number(row.games),0),totalDiff=diffRows.reduce((sum,row)=>sum+Number(row.diff),0);
  const settingRows=list.map(row=>({games:finite(row?.games),setting:finite(row?.expectedSetting)})).filter(row=>row.games!==null&&row.games>0&&row.setting!==null);
  const settingGames=settingRows.reduce((sum,row)=>sum+row.games,0),weightedSetting=settingRows.reduce((sum,row)=>sum+row.games*row.setting,0);
  return Object.freeze({
    rowCount:list.length,diffCount:diffRows.length,totalGames,totalDiff:diffRows.length?totalDiff:null,
    avgGames:gameRows.length?gameRows.reduce((sum,value)=>sum+value,0)/gameRows.length:null,
    avgDiff:diffRows.length?totalDiff/diffRows.length:null,
    actualRate:totalGames>0?100*(1+totalDiff/(3*totalGames)):null,
    avgExpectedSetting:settingGames>0?weightedSetting/settingGames:null
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

const HEAT_STOPS=Object.freeze([
  Object.freeze({value:1,rgb:[255,255,255]}),
  Object.freeze({value:8/3,rgb:[77,144,254]}),
  Object.freeze({value:13/3,rgb:[255,218,72]}),
  Object.freeze({value:6,rgb:[232,65,65]})
]);
function clamp(value,min,max){return Math.min(max,Math.max(min,value))}
function interpolateRgb(a,b,t){return a.map((value,index)=>Math.round(value+(b[index]-value)*t))}
export function settingHeatColor(value){
  const n=finite(value);if(n===null)return '#f1f3f7';const v=clamp(n,1,6);
  let left=HEAT_STOPS[0],right=HEAT_STOPS.at(-1);
  for(let i=1;i<HEAT_STOPS.length;i++)if(v<=HEAT_STOPS[i].value){left=HEAT_STOPS[i-1];right=HEAT_STOPS[i];break}
  const span=right.value-left.value,t=span>0?(v-left.value)/span:0,rgb=interpolateRgb(left.rgb,right.rgb,clamp(t,0,1));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}
export function settingHeatTextColor(value){
  const color=settingHeatColor(value),match=color.match(/(\d+)[^\d]+(\d+)[^\d]+(\d+)/);if(!match)return '#172342';
  const [,r,g,b]=match.map(Number),yiq=(r*299+g*587+b*114)/1000;return yiq<150?'#ffffff':'#172342';
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
