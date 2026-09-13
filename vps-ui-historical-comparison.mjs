import {createVpsAnalyticsClient} from './vps-browser-analytics.mjs';

let root=null;
let observer=null;
let scheduled=false;
let comparisonMode='live';
let comparisonData=null;
let comparisonShop='';
let comparisonBusy=false;
let comparisonError='';
let analyticsClient=null;

function esc(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function bridge(){return globalThis.JUGEST_CORE_BRIDGE||null}
function activeShop(){return String(bridge()?.getActiveStore?.()||'').trim()}
function getAnalyticsClient(){return analyticsClient||(analyticsClient=createVpsAnalyticsClient())}
function fmtNumber(value,digits=2){const n=Number(value);return Number.isFinite(n)?n.toLocaleString('ja-JP',{maximumFractionDigits:digits,minimumFractionDigits:digits}):'—'}
function fmtPct(value,digits=1){const n=Number(value);return Number.isFinite(n)?`${(n*100).toFixed(digits)}%`:'—'}
function fmtSigned(value,digits=2){const n=Number(value);if(!Number.isFinite(n))return '—';return `${n>0?'+':''}${n.toFixed(digits)}`}
function winnerLabel(value){return value==='pre_research'?'新版':value==='current_shadow'?'現行版':value==='tie'?'引き分け':'未採点'}
function schedule(){if(scheduled)return;scheduled=true;(globalThis.requestAnimationFrame||globalThis.setTimeout)(()=>{scheduled=false;reconcile()},0)}

function styleText(){return `
.vps-compare-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 16px}.vps-compare-tab{min-height:44px;border:1px solid #d9e0ee;border-radius:13px;background:#fff;color:#52617d;font:inherit;font-weight:800}.vps-compare-tab[aria-selected="true"]{background:#245fe7;color:#fff;border-color:#245fe7}.vps-historical-comparison{margin:0}.vps-historical-progress{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0;color:#52617d;font-size:12px}.vps-historical-progress progress{flex:1;min-width:80px}.vps-historical-note{font-size:12px;line-height:1.55;color:#69758e}.vps-historical-mode-badge{display:inline-flex;padding:6px 10px;border-radius:999px;background:#eef3ff;color:#315fd5;font-size:11px;font-weight:900;letter-spacing:.08em;margin-bottom:10px}
`}
function ensureStyle(){if(document.querySelector('style[data-vps-historical-comparison]'))return;const style=document.createElement('style');style.dataset.vpsHistoricalComparison='';style.textContent=styleText();document.head.append(style)}
function comparisonWrap(){const wrap=root?.querySelector('.vps-settings-overlay .vps-settings-wrap');if(!wrap)return null;return wrap.querySelector('h1')?.textContent?.trim()==='PRE版 精度比較'?wrap:null}
function tabsHtml(){return `<div class="vps-compare-tabs" data-vps-comparison-tabs><button type="button" class="vps-compare-tab" data-vps-comparison-mode="live" aria-selected="${comparisonMode==='live'}">LIVE</button><button type="button" class="vps-compare-tab" data-vps-comparison-mode="historical" aria-selected="${comparisonMode==='historical'}">過去検証</button></div>`}
function metricRows(summary){
  const pre=summary?.newEngine||{},cur=summary?.currentEngine||{};
  return `<tr><td>Top1 lift</td><td>${fmtNumber(pre.top1?.lift)}</td><td>${fmtNumber(cur.top1?.lift)}</td></tr><tr><td>Top3 lift</td><td>${fmtNumber(pre.top3?.lift)}</td><td>${fmtNumber(cur.top3?.lift)}</td></tr><tr><td>Top5 lift</td><td>${fmtNumber(pre.top5?.lift)}</td><td>${fmtNumber(cur.top5?.lift)}</td></tr><tr><td>順位相関</td><td>${fmtNumber(pre.rankCorrelation,3)}</td><td>${fmtNumber(cur.rankCorrelation,3)}</td></tr><tr><td>Coverage</td><td>${fmtPct(pre.coverage)}</td><td>${fmtPct(cur.coverage)}</td></tr>`;
}
function historicalDayHtml(row){
  const quality=row?.excludedReason?'—':`新版 ${fmtNumber(row?.preMetrics?.quality)} / 現行 ${fmtNumber(row?.currentMetrics?.quality)}`;
  const debug={outcomeInputHash:row?.outcomeInputHash??null,preFingerprint:row?.preFingerprint??null,preFeatureVersion:row?.preFeatureVersion??null,preFrontierDate:row?.preFrontierDate??null,scorerVersion:row?.scorerVersion??null};
  return `<div class="vps-compare-day"><div class="vps-compare-day-head"><span>${esc(row?.targetDate||'')}</span><span>${esc(row?.excludedReason?'未採点':winnerLabel(row?.winner))}</span></div><div class="vps-compare-day-meta">${esc(row?.excludedReason?`除外: ${row.excludedReason}`:quality)}</div><details class="vps-compare-debug"><summary>監査情報</summary><code>${esc(JSON.stringify(debug,null,2))}</code></details></div>`;
}
function historicalHtml(){
  if(comparisonBusy)return '<section class="vps-settings-card vps-historical-comparison" data-vps-historical-panel><div class="vps-compare-empty"><b>過去検証を読み込み中…</b><span>固定snapshotを時系列で再現しています。</span></div></section>';
  if(comparisonError)return `<section class="vps-settings-card vps-historical-comparison" data-vps-historical-panel><h2>読み込みエラー</h2><p>${esc(comparisonError)}</p><div class="vps-settings-actions"><button type="button" data-vps-historical-refresh class="primary">再読み込み</button></div></section>`;
  const historical=comparisonData?.historical;
  if(!historical)return '<section class="vps-settings-card vps-historical-comparison" data-vps-historical-panel><div class="vps-compare-empty"><b>過去検証を準備中</b><span>保存済み履歴からwalk-forward比較runを作成しています。</span></div></section>';
  const processed=Number(historical.processed)||0,total=Number(historical.totalCandidates)||0,progress=total?Math.min(1,processed/total):1,recent=Array.isArray(historical.rows)?historical.rows.slice(0,10):[];
  return `<section class="vps-settings-card vps-historical-comparison" data-vps-historical-panel><span class="vps-historical-mode-badge">HISTORICAL WALK-FORWARD</span><h2>${esc(comparisonShop||'選択中の店舗')}</h2><p>各対象日の前日以前だけを使い、新版PREと現行版を時系列で再現した過去検証。LIVE実績とは別集計です。</p><div class="vps-historical-progress"><progress max="1" value="${progress}"></progress><b>${processed}/${total}</b></div><div class="vps-compare-grid"><div class="vps-compare-kpi"><small>採点日数</small><strong>${Number(historical.scored)||0}</strong></div><div class="vps-compare-kpi"><small>新版勝ち</small><strong>${Number(historical.newWins)||0}</strong></div><div class="vps-compare-kpi"><small>現行勝ち</small><strong>${Number(historical.currentWins)||0}</strong></div><div class="vps-compare-kpi"><small>除外</small><strong>${Number(historical.excluded)||0}</strong></div></div><div class="vps-settings-message">直近30日 Quality差 <span class="vps-compare-delta">${fmtSigned(historical.recent30?.delta)}</span>（＋なら新版優勢）</div><table class="vps-compare-table"><thead><tr><th>指標</th><th>新版</th><th>現行版</th></tr></thead><tbody>${metricRows(historical)}</tbody></table><div class="vps-settings-actions"><button type="button" data-vps-historical-refresh>更新</button></div></section><section class="vps-settings-card vps-historical-comparison" data-vps-historical-panel><h2>直近日別</h2><p class="vps-historical-note">snapshot ${esc(historical.snapshotFirstDate||'—')} → ${esc(historical.snapshotLastDate||'—')} / 次: ${esc(historical.nextTargetDate||'完了')}</p><div class="vps-compare-days">${recent.length?recent.map(historicalDayHtml).join(''):'<div class="vps-compare-empty">まだ処理済みの日付がありません。</div>'}</div></section>`;
}
function historicalRenderKey(){return JSON.stringify({busy:comparisonBusy,error:comparisonError,shop:comparisonShop,historical:comparisonData?.historical??null})}
function pendingTarget(live){return (Array.isArray(live?.rows)?live.rows:[]).find(row=>row?.excludedReason==='unscored'&&row?.predictions?.pre_research&&row?.predictions?.current_shadow)?.targetDate||''}
function enhanceLivePending(wrap){
  const live=comparisonData?.live,target=pendingTarget(live);if(!target)return;
  const empty=[...wrap.querySelectorAll('.vps-compare-empty')].find(node=>node.querySelector('b')?.textContent?.includes('比較データ蓄積中'));const span=empty?.querySelector('span');
  if(span)span.textContent=`${target}予測を固定済み。${target}の実績データ待ちです。`;
}
function renderMode(wrap){
  let tabs=wrap.querySelector('[data-vps-comparison-tabs]');if(!tabs){wrap.querySelector('h1')?.insertAdjacentHTML('afterend',tabsHtml());tabs=wrap.querySelector('[data-vps-comparison-tabs]')}
  if(tabs){for(const button of tabs.querySelectorAll('[data-vps-comparison-mode]'))button.setAttribute('aria-selected',String(button.dataset.vpsComparisonMode===comparisonMode))}
  const baseSections=[...wrap.children].filter(node=>node.tagName==='SECTION'&&!node.hasAttribute('data-vps-historical-panel'));
  if(comparisonMode==='live'){
    for(const section of baseSections)section.hidden=false;
    for(const panel of wrap.querySelectorAll('[data-vps-historical-panel]'))panel.remove();
    enhanceLivePending(wrap);return;
  }
  for(const section of baseSections)section.hidden=true;
  const panels=[...wrap.querySelectorAll('[data-vps-historical-panel]')],key=historicalRenderKey();
  if(panels.length&&panels[0].dataset.vpsHistoricalRenderKey===key)return;
  for(const panel of panels)panel.remove();
  wrap.insertAdjacentHTML('beforeend',historicalHtml());
  const first=wrap.querySelector('[data-vps-historical-panel]');if(first)first.dataset.vpsHistoricalRenderKey=key;
}
async function loadComparison(force=false){
  const shop=activeShop();if(!shop){comparisonShop='';comparisonData=null;comparisonError='店舗を選択してから精度比較を開いてね。';comparisonBusy=false;schedule();return}
  if(!force&&comparisonData&&comparisonShop===shop)return;
  if(comparisonBusy&&comparisonShop===shop&&!force)return;
  comparisonShop=shop;comparisonBusy=true;comparisonError='';schedule();
  try{const payload=await getAnalyticsClient().getResearchComparison(shop,{limit:90});if(comparisonShop!==shop)return;comparisonData=payload?.comparison??null}
  catch(error){if(comparisonShop!==shop)return;comparisonData=null;comparisonError=String(error?.message||error||'比較データを取得できませんでした。')}
  finally{if(comparisonShop===shop){comparisonBusy=false;schedule()}}
}
function reconcile(){const wrap=comparisonWrap();if(!wrap)return;ensureStyle();renderMode(wrap);void loadComparison(false)}
function onClick(event){
  const button=event.target?.closest?.('[data-vps-comparison-mode],[data-vps-historical-refresh],[data-vps-comparison-refresh]');if(!button)return;
  if(button.matches('[data-vps-comparison-mode]')){comparisonMode=button.dataset.vpsComparisonMode==='historical'?'historical':'live';schedule();return}
  comparisonData=null;void loadComparison(true);
}
function start(){
  root=document.querySelector('#jugest-v510-root')||document.body;if(!root)return;
  root.addEventListener('click',onClick,true);observer=new MutationObserver(schedule);observer.observe(root,{subtree:true,childList:true});schedule();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

export const __test={pendingTarget,historicalHtml,historicalRenderKey,comparisonMode};
