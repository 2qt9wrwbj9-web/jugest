import {createVpsAnalyticsClient} from './vps-browser-analytics.mjs';
import {aggregateStoreRows,machineStoreSummaries,exclusionReasonLabel,normalizeMachineSelection,machineFilterStorageKey,filterMachineSummaries,mergeStoreRows} from './vps-ui-audit-utils.mjs';

let app=null,root=null,observer=null,scheduled=false,analyticsClient=null;
let preKey='',preData=null,preBusy=false,preError='',rawCache={key:'',days:[]};

function esc(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function bridge(){return globalThis.JUGEST_CORE_BRIDGE||null}
function activeShop(){return String(bridge()?.getActiveStore?.()||'').trim()}
function getAnalyticsClient(){return analyticsClient||(analyticsClient=createVpsAnalyticsClient())}
function fmtDiff(value){const n=Number(value);return Number.isFinite(n)?`${n>=0?'+':''}${Math.round(n).toLocaleString('ja-JP')}枚`:'—'}
function fmtRate(value){const n=Number(value);return Number.isFinite(n)?`${n.toFixed(2)}%`:'—'}
function fmtSetting(value){const n=Number(value);return Number.isFinite(n)?n.toFixed(2):'—'}
function fmtRaw(value,digits=3){const n=Number(value);return Number.isFinite(n)?n.toFixed(digits):'—'}
function schedule(){if(scheduled)return;scheduled=true;(globalThis.requestAnimationFrame||globalThis.setTimeout)(()=>{scheduled=false;reconcile()},0)}

function styleText(){return `
.vps-audit-summary{margin:12px 0 16px}.vps-audit-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.vps-audit-kpi{background:#fff;border:1px solid #e1e6f2;border-radius:14px;padding:11px}.vps-audit-kpi small{display:block;color:#77839b;font-size:10px;margin-bottom:4px}.vps-audit-kpi b{display:block;color:#172342;font-size:16px;font-variant-numeric:tabular-nums}.vps-audit-machine-title{font-size:12px;font-weight:800;color:#52617d;margin:14px 0 7px}.vps-audit-machines{display:grid;gap:8px}.vps-audit-machine{background:#fff;border:1px solid #e1e6f2;border-radius:14px;padding:11px}.vps-audit-machine>b{display:block;color:#172342;margin-bottom:7px}.vps-audit-machine-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.vps-audit-machine-grid span{background:#f7f9ff;border-radius:9px;padding:7px;min-width:0}.vps-audit-machine-grid small{display:block;color:#7b8599;font-size:9px}.vps-audit-machine-grid strong{display:block;color:#1c2948;font-size:12px;margin-top:2px;overflow:hidden;text-overflow:ellipsis}.vps-machine-filter{margin:8px 0 10px;border:1px solid #dfe5f1;border-radius:14px;background:#fff;overflow:hidden}.vps-machine-filter>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;cursor:pointer;color:#1f3158;font-size:12px;font-weight:800}.vps-machine-filter>summary::-webkit-details-marker{display:none}.vps-machine-filter>summary b{color:#3564d8;font-size:11px;font-variant-numeric:tabular-nums}.vps-machine-filter-panel{border-top:1px solid #edf0f6;padding:10px}.vps-machine-filter-actions{display:flex;gap:8px;margin-bottom:8px}.vps-machine-filter-actions button{appearance:none;border:1px solid #d7deeb;background:#f7f9ff;color:#315dc5;border-radius:10px;padding:8px 11px;font-size:11px;font-weight:800}.vps-machine-filter-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.vps-machine-filter-choice{display:flex;align-items:center;gap:8px;min-width:0;background:#f8faff;border:1px solid #e8ecf5;border-radius:10px;padding:9px 10px;color:#283754;font-size:11px;font-weight:700}.vps-machine-filter-choice input{width:17px;height:17px;accent-color:#3866e8;flex:0 0 auto}.vps-machine-filter-choice span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vps-pre-audit-note{font-size:11px;line-height:1.5;color:#61708c;background:#f4f7ff;border:1px solid #dce5ff;border-radius:11px;padding:9px 10px;margin:9px 0}.vps-pre-audit-row{display:grid;grid-template-columns:32px 1fr auto;gap:10px;align-items:start;background:#fff;border:1px solid #e2e7f1;border-radius:14px;padding:11px}.vps-pre-audit-row .rank{font-weight:900;color:#245fe7;text-align:center;padding-top:2px}.vps-pre-audit-main>b{display:block;color:#172342}.vps-pre-audit-main>small{display:block;color:#68758e;margin-top:4px;line-height:1.45}.vps-pre-audit-score{text-align:right}.vps-pre-audit-score b{display:block;color:#172342;font-size:20px}.vps-pre-audit-score small{display:block;color:#71809b;font-size:10px}.vps-pre-evidence{margin-top:7px;font-size:11px;color:#52617d}.vps-pre-evidence summary{font-weight:800;cursor:pointer}.vps-pre-evidence span{display:block;padding:6px 0;border-top:1px solid #edf0f6;line-height:1.45}.vps-exclusion-code{color:#8993a8;font-size:10px;margin-left:5px}.vps-audit-muted{font-size:12px;color:#69758e;padding:10px 0}@media(max-width:560px){.vps-audit-machine-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.vps-machine-filter-choices{grid-template-columns:1fr}}
`}
function ensureStyle(){if(!root||root.querySelector('style[data-vps-audit-store]'))return;const style=document.createElement('style');style.dataset.vpsAuditStore='';style.textContent=styleText();root.append(style)}

function kpi(label,value){return `<div class="vps-audit-kpi"><small>${esc(label)}</small><b>${esc(value)}</b></div>`}
function machineCards(rows,{trend=false}={}){return rows.map(row=>`<div class="vps-audit-machine"><b>${esc(row.machineName||row.machine)}</b><div class="vps-audit-machine-grid">${trend?`${kpi('平均設定',fmtSetting(row.avgExpectedSetting))}${kpi('平均出率',fmtRate(row.actualRate))}`:`${kpi('総差枚',fmtDiff(row.totalDiff))}${kpi('平均差枚',fmtDiff(row.avgDiff))}${kpi('平均出率',fmtRate(row.actualRate))}${kpi('平均設定',fmtSetting(row.avgExpectedSetting))}`}</div></div>`).join('')}
function readMachineSelection(scope,shop,available){
  try{
    const raw=globalThis.localStorage?.getItem(machineFilterStorageKey(scope,shop));
    if(raw===null||raw===undefined)return normalizeMachineSelection(available,null);
    const parsed=JSON.parse(raw);return normalizeMachineSelection(available,Array.isArray(parsed)?parsed:null);
  }catch{return normalizeMachineSelection(available,null)}
}
function writeMachineSelection(scope,shop,available,selected){
  const normalized=normalizeMachineSelection(available,selected),storage=globalThis.localStorage,key=machineFilterStorageKey(scope,shop);
  try{if(storage){if(normalized.length===available.length)storage.removeItem(key);else storage.setItem(key,JSON.stringify(normalized))}}catch{}
  return normalized;
}
function machineFilterHtml(scope,rows,selected){
  const selectedSet=new Set(selected.map(String)),count=selected.length,total=rows.length;
  return `<details class="vps-machine-filter" data-vps-machine-filter="${esc(scope)}"><summary><span>機種を選択</span><b>${count}/${total}</b></summary><div class="vps-machine-filter-panel"><div class="vps-machine-filter-actions"><button type="button" data-vps-machine-action="all">全選択</button><button type="button" data-vps-machine-action="none">全解除</button></div><div class="vps-machine-filter-choices">${rows.map(row=>`<label class="vps-machine-filter-choice"><input type="checkbox" data-vps-machine-choice value="${esc(row.machine)}"${selectedSet.has(String(row.machine))?' checked':''}><span>${esc(row.machineName||row.machine)}</span></label>`).join('')}</div></div></details>`;
}
function preserveFilterOpen(node,scope){return Boolean(node?.querySelector?.(`[data-vps-machine-filter="${scope}"]`)?.open)}
function restoreFilterOpen(screen,scope,open){if(open){const details=screen?.querySelector?.(`[data-vps-machine-filter="${scope}"]`);if(details)details.open=true}}
function rawDays(shop){
  const dates=bridge()?.getStoreDates?.(shop,400)||[],key=`${shop}|${dates.length}|${dates[0]||''}|${dates.at?.(-1)||''}`;
  if(rawCache.key===key)return rawCache.days;
  const all=bridge()?.getVpsBackfillDays?.()||[];rawCache={key,days:(Array.isArray(all)?all:[]).filter(day=>day?.shop===shop)};return rawCache.days;
}
function storeRows(shop,date){
  const display=bridge()?.getStoreDay?.(shop,date)?.rows||[],raw=rawDays(shop).find(day=>day?.date===date)?.machines;
  return mergeStoreRows(display,raw);
}

function reconcileStoreData(){
  const screen=root?.querySelector('.store-data-screen');if(!screen)return;
  const shop=activeShop(),date=String(screen.querySelector('[data-store-date]')?.value||'').trim(),rows=storeRows(shop,date);
  const overall=aggregateStoreRows(rows),allMachines=machineStoreSummaries(rows),available=allMachines.map(row=>String(row.machine)),selected=readMachineSelection('data',shop,available),machines=filterMachineSummaries(allMachines,selected),key=`${shop}|${date}|${rows.length}|${overall.totalDiff}|${JSON.stringify(selected)}`;
  let node=screen.querySelector('[data-vps-store-data-summary]');if(node?.dataset.key===key)return;const wasOpen=preserveFilterOpen(node,'data');
  const html=`<section class="vps-audit-summary" data-vps-store-data-summary data-key="${esc(key)}"><div class="vps-audit-kpis">${kpi('総差枚',fmtDiff(overall.totalDiff))}${kpi('平均差枚',fmtDiff(overall.avgDiff))}${kpi('平均出率',fmtRate(overall.actualRate))}</div><div class="vps-audit-machine-title">機種別</div>${machineFilterHtml('data',allMachines,selected)}<div class="vps-audit-machines">${machineCards(machines)||'<div class="vps-audit-muted">選択中の機種はありません。</div>'}</div></section>`;
  node?.remove();screen.querySelector('.data-toolbar')?.insertAdjacentHTML('afterend',html);restoreFilterOpen(screen,'data',wasOpen);
}

function trendRows(shop,screen){
  const period=String(screen.querySelector('[data-trend-period]')?.value||'30'),all=bridge()?.getStoreDates?.(shop,400)||[];
  const dates=period==='all'?all:all.slice(0,Math.max(1,Number(period)||30)),rows=[];
  for(const date of dates)for(const row of storeRows(shop,date))rows.push(row);
  return {period,dates,rows};
}
function reconcileTrend(){
  const screen=root?.querySelector('.store-trend-screen');if(!screen||!screen.querySelector('.trend-result-head'))return;
  const shop=activeShop(),source=trendRows(shop,screen),allMachines=machineStoreSummaries(source.rows),available=allMachines.map(row=>String(row.machine)),selected=readMachineSelection('trend',shop,available),machines=filterMachineSummaries(allMachines,selected),key=`${shop}|${source.period}|${source.dates[0]||''}|${source.rows.length}|${JSON.stringify(selected)}`;
  let node=screen.querySelector('[data-vps-trend-machine-summary]');if(node?.dataset.key===key)return;const wasOpen=preserveFilterOpen(node,'trend');
  const html=`<section class="vps-audit-summary" data-vps-trend-machine-summary data-key="${esc(key)}"><div class="vps-audit-machine-title">機種別の設定傾向 / 平均出率</div>${machineFilterHtml('trend',allMachines,selected)}<div class="vps-audit-machines">${machineCards(machines,{trend:true})||'<div class="vps-audit-muted">選択中の機種はありません。</div>'}</div></section>`;
  node?.remove();screen.querySelector('.trend-result-head')?.insertAdjacentHTML('afterend',html);restoreFilterOpen(screen,'trend',wasOpen);
}

function evidenceHtml(row){
  const evidence=Array.isArray(row?.evidence)?row.evidence:[];
  if(!evidence.length)return '<div class="vps-audit-muted">独立根拠なし</div>';
  return `<details class="vps-pre-evidence"><summary>根拠 ${Number(row.evidenceFamilyCount)||0}系統（該当${Number(row.evidenceMatchedCount)||0}件）</summary>${evidence.map(item=>`<span><b>${esc(item.label||item.familyKey||'根拠')}</b><br>信頼 ${Math.round(Number(item.confidence)||0)} / 母数 ${Number.isFinite(Number(item.support))?Math.round(Number(item.support)):'—'} / lift ${fmtRaw(item.lift,3)} / weight ${fmtRaw(item.weight,3)}</span>`).join('')}</details>`;
}
function renderPreAudit(storeRead){
  const rankings=Array.isArray(storeRead?.rankings)?storeRead.rankings:[];
  return `<div class="vps-pre-audit-note">狙い指数・根拠信頼は説明用の0〜100表示。PREの生score・順位計算自体は変更していません。</div>${rankings.slice(0,20).map(row=>`<div class="vps-pre-audit-row"><span class="rank">${Number(row.rank)||'—'}</span><div class="vps-pre-audit-main"><b>${esc(row.tableNo||row.machineKey)}番 ${esc(row.machineName||'')}</b><small>狙い ${Math.round(Number(row.aimScore)||0)} / 根拠信頼 ${Math.round(Number(row.evidenceConfidence)||0)}% / 独立 ${Number(row.evidenceFamilyCount)||0}系統</small>${evidenceHtml(row)}</div><div class="vps-pre-audit-score"><b>${Math.round(Number(row.aimScore)||0)}</b><small>raw ${fmtRaw(row.score,3)}</small></div></div>`).join('')}`;
}
async function loadPre(shop,targetDate){
  const key=`${shop}|${targetDate}`;if(preBusy||preKey===key&&preData)return;
  preKey=key;preData=null;preError='';preBusy=true;try{const payload=await getAnalyticsClient().getStoreRead(shop);if(preKey!==key)return;preData=payload?.storeRead||null}catch(error){if(preKey===key)preError=String(error?.message||error)}finally{if(preKey===key){preBusy=false;schedule()}}
}
function reconcilePre(){
  const plan=root?.querySelector('[data-vps-pre-plan]'),screen=plan?.closest?.('.workspace');if(!plan||!screen)return;
  const shop=activeShop(),targetDate=String(screen.querySelector('[data-plan-date]')?.value||'').trim(),key=`${shop}|${targetDate}`;
  if(!shop||!targetDate)return;if(preKey!==key||(!preData&&!preBusy&&!preError))void loadPre(shop,targetDate);
  const list=plan.querySelector('.vps-pre-list');if(!list)return;
  if(preBusy){if(!list.querySelector('[data-vps-audit-loading]'))list.insertAdjacentHTML('afterbegin','<div class="vps-audit-muted" data-vps-audit-loading>根拠監査データを取得中…</div>');return}
  const storeRead=preData;if(!storeRead||storeRead.targetDate!==targetDate)return;
  const hasAudit=Array.isArray(storeRead.rankings)&&storeRead.rankings.some(row=>Number.isFinite(Number(row.aimScore)));
  if(!hasAudit){if(!list.querySelector('[data-vps-audit-pending]'))list.insertAdjacentHTML('afterbegin','<div class="vps-pre-audit-note" data-vps-audit-pending>この固定PRE予測は旧スナップショットです。次回PRE更新時から根拠・信頼度を完全表示します。</div>');return}
  if(list.dataset.vpsAuditKey===key)return;list.innerHTML=renderPreAudit(storeRead);list.dataset.vpsAuditKey=key;
}

function reconcileExclusions(){
  for(const node of root?.querySelectorAll?.('.vps-compare-day-meta')||[]){
    if(node.dataset.vpsExclusionLabel)return;const match=String(node.textContent||'').trim().match(/^除外:\s*([a-z0-9_]+)$/i);if(!match)continue;
    const code=match[1],label=exclusionReasonLabel(code);node.innerHTML=`除外: ${esc(label)}<span class="vps-exclusion-code">${esc(code)}</span>`;node.dataset.vpsExclusionLabel=code;
  }
}
function handleMachineFilterChange(event){
  const input=event?.target?.closest?.('[data-vps-machine-choice]');if(!input){schedule();return}
  const panel=input.closest('[data-vps-machine-filter]'),scope=String(panel?.dataset?.vpsMachineFilter||''),shop=activeShop(),boxes=[...(panel?.querySelectorAll?.('[data-vps-machine-choice]')||[])],available=boxes.map(box=>String(box.value)),selected=boxes.filter(box=>box.checked).map(box=>String(box.value));
  if(scope&&shop)writeMachineSelection(scope,shop,available,selected);schedule();
}
function handleMachineFilterClick(event){
  const button=event?.target?.closest?.('[data-vps-machine-action]');if(!button)return;
  const panel=button.closest('[data-vps-machine-filter]'),scope=String(panel?.dataset?.vpsMachineFilter||''),shop=activeShop(),boxes=[...(panel?.querySelectorAll?.('[data-vps-machine-choice]')||[])],available=boxes.map(box=>String(box.value)),selected=button.dataset.vpsMachineAction==='all'?available:[];
  event.preventDefault();for(const box of boxes)box.checked=selected.includes(String(box.value));if(scope&&shop)writeMachineSelection(scope,shop,available,selected);schedule();
}
function reconcile(){if(!root)return;ensureStyle();reconcileStoreData();reconcileTrend();reconcilePre();reconcileExclusions()}
function attach(candidate){
  if(app===candidate&&root===candidate?.shadowRoot)return true;observer?.disconnect();app=candidate;root=candidate?.shadowRoot||null;if(!root)return false;
  observer=new MutationObserver(schedule);observer.observe(root,{childList:true,subtree:true});root.addEventListener('change',handleMachineFilterChange,true);root.addEventListener('click',handleMachineFilterClick,true);schedule();return true;
}
function boot(){const candidate=document.querySelector('jugest-app');if(attach(candidate))return;globalThis.setTimeout(boot,50)}
boot();

export const __test={fmtDiff,fmtRate,fmtSetting,renderPreAudit,machineFilterHtml,readMachineSelection,writeMachineSelection};