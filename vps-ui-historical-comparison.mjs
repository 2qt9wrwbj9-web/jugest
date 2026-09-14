import {createVpsAnalyticsClient} from './vps-browser-analytics.mjs';

let app=null;
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
function storeNames(){
  const stores=bridge()?.getStores?.();
  const names=(Array.isArray(stores)?stores:[]).map(store=>String(store?.name??store??'').trim()).filter(Boolean);
  return [...new Set(names)];
}
function getAnalyticsClient(){return analyticsClient||(analyticsClient=createVpsAnalyticsClient())}
function fmtNumber(value,digits=2){const n=Number(value);return Number.isFinite(n)?n.toLocaleString('ja-JP',{maximumFractionDigits:digits,minimumFractionDigits:digits}):'—'}
function fmtPct(value,digits=1){const n=Number(value);return Number.isFinite(n)?`${(n*100).toFixed(digits)}%`:'—'}
function fmtSigned(value,digits=2){const n=Number(value);if(!Number.isFinite(n))return '—';return `${n>0?'+':''}${n.toFixed(digits)}`}
function fmtHit(item){const days=Number(item?.days)||0,hits=Number(item?.hits)||0,rate=Number(item?.rate);return Number.isFinite(rate)?`${hits}/${days}日 ${fmtPct(rate)}`:'—'}
function winnerLabel(value){return value==='pre_research'?'新版':value==='current_shadow'?'現行版':value==='tie'?'引き分け':'未採点'}
function schedule(){if(scheduled)return;scheduled=true;(globalThis.requestAnimationFrame||globalThis.setTimeout)(()=>{scheduled=false;reconcile()},0)}

function styleText(){return `
.vps-historical-shell{position:fixed;z-index:9999;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 58px);bottom:0;background:#f7f9ff;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;padding:20px 20px calc(36px + env(safe-area-inset-bottom,0px));box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#101a38}.vps-historical-wrap{max-width:720px;margin:0 auto}.vps-historical-back{appearance:none;border:0;background:transparent;color:#315fd5;font:inherit;font-weight:700;padding:8px 0 18px;min-height:44px}.vps-historical-kicker{font-size:12px;font-weight:800;letter-spacing:.24em;color:#315fd5;margin:4px 0 10px}.vps-historical-shell h1{margin:0 0 18px;font-size:34px;line-height:1.1}.vps-historical-card{background:#fff;border:1px solid #dfe5f3;border-radius:22px;padding:20px;box-shadow:0 8px 24px rgba(33,55,110,.05);margin:0 0 16px}.vps-historical-card h2{font-size:20px;margin:0 0 8px}.vps-historical-card h3{font-size:15px;margin:18px 0 7px}.vps-historical-card p{font-size:14px;line-height:1.6;color:#5f687e;margin:8px 0 14px}.vps-compare-store{display:grid;gap:7px;margin:0 0 14px}.vps-compare-store span{font-size:12px;font-weight:800;color:#52617d}.vps-compare-store select{width:100%;min-height:46px;box-sizing:border-box;border:1px solid #d9e0ee;border-radius:13px;background:#fff;color:#142041;font:inherit;font-weight:700;padding:0 12px}.vps-compare-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 16px}.vps-compare-tab{min-height:44px;border:1px solid #d9e0ee;border-radius:13px;background:#fff;color:#52617d;font:inherit;font-weight:800}.vps-compare-tab[aria-selected="true"]{background:#245fe7;color:#fff;border-color:#245fe7}.vps-status{display:inline-flex;padding:6px 10px;border-radius:999px;background:#eef3ff;color:#315fd5;font-size:11px;font-weight:900;letter-spacing:.08em;margin-bottom:10px}.vps-compare-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.vps-compare-kpi{background:#f7f9ff;border:1px solid #e0e6f4;border-radius:14px;padding:12px}.vps-compare-kpi small{display:block;color:#74809a;font-size:11px;margin-bottom:5px}.vps-compare-kpi strong{display:block;font-size:20px;color:#152142}.vps-compare-delta{font-weight:800;color:#315fd5}.vps-message{font-size:13px;line-height:1.55;color:#40506e;margin:12px 0}.vps-refresh-pending{background:#fff8e7;border:1px solid #f0d79c;border-radius:12px;padding:10px 12px;color:#72531c;font-size:12px;font-weight:800;margin:10px 0}.vps-compare-table{width:100%;border-collapse:collapse;font-size:13px}.vps-compare-table th,.vps-compare-table td{border-bottom:1px solid #edf0f6;padding:9px 6px;text-align:right}.vps-compare-table th:first-child,.vps-compare-table td:first-child{text-align:left}.vps-compare-days{display:grid;gap:9px}.vps-compare-day{border:1px solid #e2e7f1;border-radius:14px;padding:12px}.vps-compare-day-head{display:flex;justify-content:space-between;gap:10px;font-weight:800}.vps-compare-day-meta{font-size:12px;color:#69758e;margin-top:6px;line-height:1.5}.vps-compare-debug{margin-top:10px;font-size:12px;color:#52617d}.vps-compare-debug summary{cursor:pointer;font-weight:700}.vps-compare-debug code{display:block;white-space:pre-wrap;word-break:break-all;margin-top:7px;background:#f7f9ff;border-radius:10px;padding:9px}.vps-compare-empty{text-align:center;padding:18px 8px;color:#667189}.vps-compare-empty b{display:block;color:#172342;font-size:18px;margin-bottom:6px}.vps-historical-progress{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0;color:#52617d;font-size:12px}.vps-historical-progress progress{flex:1;min-width:80px}.vps-actions{display:grid;gap:10px;margin-top:12px}.vps-actions button{min-height:48px;border-radius:14px;border:1px solid #d9e0ee;background:#fff;color:#142041;font:inherit;font-weight:800;padding:10px 14px}.vps-error{color:#b72d3b}.vps-walk-forward-note{font-size:12px!important}@media(max-width:560px){.vps-compare-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.vps-historical-shell h1{font-size:29px}}
`}
function ensureStyle(){if(document.querySelector('style[data-vps-historical-comparison]'))return;const style=document.createElement('style');style.dataset.vpsHistoricalComparison='';style.textContent=styleText();document.head.append(style)}
function comparisonOpen(){const wrap=root?.querySelector('.vps-settings-overlay .vps-settings-wrap');return !!wrap&&wrap.querySelector('h1')?.textContent?.trim()==='PRE版 精度比較'}
function reconcileAnalysisChip(){
  const chip=root?.querySelector('.analysis-chip');if(!chip)return;
  const running=(chip.textContent||'').includes('店舗解析中');
  if(running)chip.style.removeProperty('display');else chip.style.display='none';
}
function storeSelectorHtml(){
  const current=activeShop(),names=storeNames();
  if(current&&!names.includes(current))names.unshift(current);
  if(!names.length)return '<div class="vps-message">店舗を登録するとここで切り替えられます。</div>';
  return `<label class="vps-compare-store"><span>比較する店舗</span><select data-vps-comparison-store>${names.map(name=>`<option value="${esc(name)}" ${name===current?'selected':''}>${esc(name)}</option>`).join('')}</select></label>`;
}
function tabsHtml(){return `<div class="vps-compare-tabs"><button type="button" class="vps-compare-tab" data-vps-comparison-mode="live" aria-selected="${comparisonMode==='live'}">LIVE</button><button type="button" class="vps-compare-tab" data-vps-comparison-mode="historical" aria-selected="${comparisonMode==='historical'}">過去検証</button></div>`}
function metricRows(summary){const pre=summary?.newEngine||{},cur=summary?.currentEngine||{};return `<tr><td>Top1 lift</td><td>${fmtNumber(pre.top1?.lift)}</td><td>${fmtNumber(cur.top1?.lift)}</td></tr><tr><td>Top3 lift</td><td>${fmtNumber(pre.top3?.lift)}</td><td>${fmtNumber(cur.top3?.lift)}</td></tr><tr><td>Top5 lift</td><td>${fmtNumber(pre.top5?.lift)}</td><td>${fmtNumber(cur.top5?.lift)}</td></tr><tr><td>順位相関</td><td>${fmtNumber(pre.rankCorrelation,3)}</td><td>${fmtNumber(cur.rankCorrelation,3)}</td></tr><tr><td>Coverage</td><td>${fmtPct(pre.coverage)}</td><td>${fmtPct(cur.coverage)}</td></tr>`}
function hitRateRows(summary){const pre=summary?.newEngine?.hitRates||{},cur=summary?.currentEngine?.hitRates||{};return `<tr><td>Top1</td><td>${fmtHit(pre.top1)}</td><td>${fmtHit(cur.top1)}</td></tr><tr><td>Top3</td><td>${fmtHit(pre.top3)}</td><td>${fmtHit(cur.top3)}</td></tr><tr><td>Top5</td><td>${fmtHit(pre.top5)}</td><td>${fmtHit(cur.top5)}</td></tr>`}
function pendingTarget(live){return (Array.isArray(live?.rows)?live.rows:[]).find(row=>row?.excludedReason==='unscored'&&row?.predictions?.pre_research&&row?.predictions?.current_shadow)?.targetDate||''}
function liveDayHtml(row){
  const pre=row?.scores?.pre_research,cur=row?.scores?.current_shadow,debug={outcomeInputHash:pre?.outcomeInputHash??cur?.outcomeInputHash??null,preModelFingerprint:row?.predictions?.pre_research?.modelFingerprint??null,preSourceFrontierDate:row?.predictions?.pre_research?.sourceFrontierDate??null,currentEngineVersion:row?.predictions?.current_shadow?.engineVersion??null,currentSourceFrontierDate:row?.predictions?.current_shadow?.sourceFrontierDate??null};
  const quality=row?.excludedReason?'—':`新版 ${fmtNumber(pre?.metrics?.quality)} / 現行 ${fmtNumber(cur?.metrics?.quality)}`;
  return `<div class="vps-compare-day"><div class="vps-compare-day-head"><span>${esc(row?.targetDate||'')}</span><span>${esc(row?.excludedReason?'未採点':winnerLabel(row?.winner))}</span></div><div class="vps-compare-day-meta">${esc(row?.excludedReason?`除外: ${row.excludedReason}`:quality)}</div><details class="vps-compare-debug"><summary>監査情報</summary><code>${esc(JSON.stringify(debug,null,2))}</code></details></div>`;
}
function historicalDayHtml(row){
  const quality=row?.excludedReason?'—':`新版 ${fmtNumber(row?.preMetrics?.quality)} / 現行 ${fmtNumber(row?.currentMetrics?.quality)}`,debug={outcomeInputHash:row?.outcomeInputHash??null,preFingerprint:row?.preFingerprint??null,preFeatureVersion:row?.preFeatureVersion??null,preFrontierDate:row?.preFrontierDate??null,scorerVersion:row?.scorerVersion??null};
  return `<div class="vps-compare-day"><div class="vps-compare-day-head"><span>${esc(row?.targetDate||'')}</span><span>${esc(row?.excludedReason?'未採点':winnerLabel(row?.winner))}</span></div><div class="vps-compare-day-meta">${esc(row?.excludedReason?`除外: ${row.excludedReason}`:quality)}</div><details class="vps-compare-debug"><summary>監査情報</summary><code>${esc(JSON.stringify(debug,null,2))}</code></details></div>`;
}
function liveHtml(){
  const live=comparisonData?.live;
  if(!live||!Number(live.days)){
    const target=pendingTarget(live),message=target?`${target}予測を固定済み。${target}の実績データ待ちです。`:`新版と現行版の翌日予測を固定保存し、翌日の実績が入った日から同じ正解データで採点します。${Number(live?.excluded)||0}件はまだ未採点です。`;
    return `<section class="vps-historical-card"><div class="vps-compare-empty"><b>比較データ蓄積中</b><span>${esc(message)}</span></div><div class="vps-actions"><button type="button" data-vps-historical-refresh>更新</button></div></section>`;
  }
  const recent=Array.isArray(live.rows)?live.rows.slice(0,10):[];
  return `<section class="vps-historical-card"><span class="vps-status">LIVE SHADOW</span><h2>${esc(comparisonShop||'選択中の店舗')}</h2><p>PRE導入後に実際に固定した新版予測と現行版予測を、後から取得した同一の実績で比較しています。</p><div class="vps-compare-grid"><div class="vps-compare-kpi"><small>採点日数</small><strong>${Number(live.days)||0}</strong></div><div class="vps-compare-kpi"><small>新版勝ち</small><strong>${Number(live.newWins)||0}</strong></div><div class="vps-compare-kpi"><small>現行勝ち</small><strong>${Number(live.currentWins)||0}</strong></div><div class="vps-compare-kpi"><small>引き分け</small><strong>${Number(live.ties)||0}</strong></div></div><h3>実的中率</h3><table class="vps-compare-table"><thead><tr><th>対象</th><th>新版</th><th>現行版</th></tr></thead><tbody>${hitRateRows(live)}</tbody></table><div class="vps-message">直近30日 Quality差 <span class="vps-compare-delta">${fmtSigned(live.recent30?.delta)}</span>（＋なら新版優勢）</div><table class="vps-compare-table"><thead><tr><th>分析指標</th><th>新版</th><th>現行版</th></tr></thead><tbody>${metricRows(live)}</tbody></table><div class="vps-actions"><button type="button" data-vps-historical-refresh>更新</button></div></section><section class="vps-historical-card"><h2>直近日別</h2><div class="vps-compare-days">${recent.map(liveDayHtml).join('')}</div></section>`;
}
function historicalHtml(){
  const historical=comparisonData?.historical;
  if(!historical)return '<section class="vps-historical-card"><div class="vps-compare-empty"><b>過去検証を準備中</b><span>保存済み履歴からwalk-forward比較runを作成しています。</span></div></section>';
  const processed=Number(historical.processed)||0,total=Number(historical.totalCandidates)||0,progress=total?Math.min(1,processed/total):1,recent=Array.isArray(historical.rows)?historical.rows.slice(0,10):[];
  const pending=historical.refreshPending?'<div class="vps-refresh-pending">新しいデータあり・完了後に再検証予定</div>':'';
  return `<section class="vps-historical-card"><span class="vps-status">HISTORICAL WALK-FORWARD</span><h2>${esc(comparisonShop||'選択中の店舗')}</h2><p>各対象日の前日以前だけを使い、新版PREと現行版を時系列で再現した過去検証。LIVE実績とは別集計です。</p>${pending}<div class="vps-historical-progress"><progress max="1" value="${progress}"></progress><b>${processed}/${total}</b></div><div class="vps-compare-grid"><div class="vps-compare-kpi"><small>採点日数</small><strong>${Number(historical.scored)||0}</strong></div><div class="vps-compare-kpi"><small>新版勝ち</small><strong>${Number(historical.newWins)||0}</strong></div><div class="vps-compare-kpi"><small>現行勝ち</small><strong>${Number(historical.currentWins)||0}</strong></div><div class="vps-compare-kpi"><small>除外</small><strong>${Number(historical.excluded)||0}</strong></div></div><h3>実的中率</h3><table class="vps-compare-table"><thead><tr><th>対象</th><th>新版</th><th>現行版</th></tr></thead><tbody>${hitRateRows(historical)}</tbody></table><div class="vps-message">直近30日 Quality差 <span class="vps-compare-delta">${fmtSigned(historical.recent30?.delta)}</span>（＋なら新版優勢）</div><table class="vps-compare-table"><thead><tr><th>分析指標</th><th>新版</th><th>現行版</th></tr></thead><tbody>${metricRows(historical)}</tbody></table><div class="vps-actions"><button type="button" data-vps-historical-refresh>更新</button></div></section><section class="vps-historical-card"><h2>直近日別</h2><p class="vps-walk-forward-note">snapshot ${esc(historical.snapshotFirstDate||'—')} → ${esc(historical.snapshotLastDate||'—')} / 次: ${esc(historical.nextTargetDate||'完了')}</p><div class="vps-compare-days">${recent.length?recent.map(historicalDayHtml).join(''):'<div class="vps-compare-empty">まだ処理済みの日付がありません。</div>'}</div></section>`;
}
function overlayHtml(){
  const body=comparisonBusy?'<section class="vps-historical-card"><div class="vps-compare-empty"><b>比較データを読み込み中…</b><span>VPSから比較結果を取得しています。</span></div></section>':comparisonError?`<section class="vps-historical-card"><h2 class="vps-error">読み込みエラー</h2><p>${esc(comparisonError)}</p><div class="vps-actions"><button type="button" data-vps-historical-refresh>再読み込み</button></div></section>`:comparisonMode==='historical'?historicalHtml():liveHtml();
  return `<div class="vps-historical-shell" data-vps-historical-shell><div class="vps-historical-wrap"><button type="button" class="vps-historical-back" data-vps-historical-back>‹ 設定</button><div class="vps-historical-kicker">PRE VALIDATION</div><h1>PRE版 精度比較</h1>${storeSelectorHtml()}${tabsHtml()}${body}</div></div>`;
}
function renderOverlay(){
  ensureStyle();let host=document.querySelector('[data-vps-historical-shell]');const html=overlayHtml();
  if(!host){document.body.insertAdjacentHTML('beforeend',html);return}
  const next=document.createElement('div');next.innerHTML=html;const nextHost=next.firstElementChild;
  if(host.innerHTML===nextHost.innerHTML)return;
  const scrollTop=host.scrollTop;host.replaceWith(nextHost);nextHost.scrollTop=scrollTop;
}
function removeOverlay(){document.querySelector('[data-vps-historical-shell]')?.remove()}
async function loadComparison(force=false){
  const shop=activeShop();if(!shop){comparisonShop='';comparisonData=null;comparisonError='店舗を選択してから精度比較を開いてね。';comparisonBusy=false;renderOverlay();return}
  if(!force&&comparisonData&&comparisonShop===shop)return;
  if(comparisonBusy&&comparisonShop===shop&&!force)return;
  comparisonShop=shop;comparisonBusy=true;comparisonError='';renderOverlay();
  try{const payload=await getAnalyticsClient().getResearchComparison(shop,{limit:90});if(comparisonShop!==shop)return;comparisonData=payload?.comparison??null}
  catch(error){if(comparisonShop!==shop)return;comparisonData=null;comparisonError=String(error?.message||error||'比較データを取得できませんでした。')}
  finally{if(comparisonShop===shop){comparisonBusy=false;if(comparisonOpen())renderOverlay()}}
}
function reconcile(){
  reconcileAnalysisChip();
  if(!comparisonOpen()){removeOverlay();return}
  const shop=activeShop();if(shop!==comparisonShop){comparisonData=null;comparisonError=''}
  renderOverlay();void loadComparison(false);
}
function onDocumentClick(event){
  const button=event.target?.closest?.('[data-vps-comparison-mode],[data-vps-historical-refresh],[data-vps-historical-back]');if(!button)return;
  if(button.matches('[data-vps-comparison-mode]')){comparisonMode=button.dataset.vpsComparisonMode==='historical'?'historical':'live';renderOverlay();return}
  if(button.matches('[data-vps-historical-refresh]')){comparisonData=null;void loadComparison(true);return}
  if(button.matches('[data-vps-historical-back]')){root?.querySelector('[data-vps-settings-back]')?.click();removeOverlay()}
}
function onDocumentChange(event){
  const select=event.target?.closest?.('[data-vps-comparison-store]');if(!select)return;
  const shop=String(select.value||'').trim();if(!shop||shop===activeShop())return;
  comparisonData=null;comparisonError='';comparisonBusy=false;comparisonShop='';
  bridge()?.setActiveStore?.(shop);renderOverlay();void loadComparison(true);
}
function attach(candidate){
  if(app===candidate&&root===candidate?.shadowRoot)return true;
  observer?.disconnect();app=candidate;root=candidate?.shadowRoot||null;if(!root)return false;
  observer=new MutationObserver(schedule);observer.observe(root,{childList:true,subtree:true});schedule();return true;
}
function boot(){const candidate=document.querySelector('jugest-app');if(attach(candidate))return;globalThis.setTimeout(boot,50)}
document.addEventListener('click',onDocumentClick,true);document.addEventListener('change',onDocumentChange,true);boot();

export const __test={pendingTarget,liveHtml,historicalHtml,comparisonMode,storeNames,reconcileAnalysisChip,hitRateRows,fmtHit};
