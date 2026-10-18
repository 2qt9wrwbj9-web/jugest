// Store UI v2 for slot stores. Keeps JUGEST engines, persistence and event handlers unchanged.
import {createVerificationReader,renderVerificationResults,errorMessage} from './vps-ui-store-verify.mjs';
import {computeVpsTrend,selectTrendDates} from './vps-ui-remote-trend.mjs';
let app=null,root=null,observer=null,pending=false;
const verificationReader=createVerificationReader();let verificationSequence=0,remoteTrendSequence=0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v==null||v===''||!Number.isFinite(Number(v))?'—':Math.round(Number(v)).toLocaleString('ja-JP');
const diff=v=>v==null||v===''||!Number.isFinite(Number(v))?'—':(Number(v)>=0?'+':'')+num(v)+'枚';
const dateShort=v=>/^\d{4}-\d\d-\d\d$/.test(String(v))?Number(v.slice(5,7))+'/'+Number(v.slice(8)):'—';
function bridge(){return globalThis.JUGEST_CORE_BRIDGE||null}
function screenKind(){const s=app?.state;if(!s||s.workspace!=='store'||app?._pachinkoStoreSelected)return '';return ({hub:'overview',data:'data',trend:'trend',analysis:'trend',plan:'plan',model:'verify',replay:'verify'})[s.screen]||''}
function isPachinko(screen){return app?._pachinkoStoreSelected||screen?.classList?.contains('pachinko-store-overview')||screen?.classList?.contains('pachinko-data-screen')}
function activeScreen(){return root?.querySelector('#view > section.workspace')||root?.querySelector('section.workspace')||null}
function style(){if(!root||root.querySelector('[data-store-v2-style]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='./vps-ui-store-v2.css';l.dataset.storeV2Style='';root.append(l)}
function collectorStatus(o){const c=o?.collector||{};
 if(c.errorCode)return {label:'取得要確認',warn:true,description:`エラー ${c.errorCode} / 欠損 ${Number(c.missingDays)||0}日`};
 if(c.registered&&c.enabled)return {label:'自動取得 ON',warn:false,description:`Collector最新 ${c.latestDate||'未取得'}`};
 if(c.registered)return {label:'自動取得 OFF',warn:true,description:`Collector最新 ${c.latestDate||'未取得'}`};
 return {label:'取得URL未登録',warn:true,description:'データ画面から取得URLを登録'};
}
function nav(active){return `<nav class="sv2-tabs" aria-label="店舗内ナビ">${[['overview','概要','', 'store'],['data','台','store-data'],['allocation','投入分析','store-allocation'],['trend','傾向','store-trend'],['plan','予測','store-plan'],['verify','検証','store-model']].map(([key,label,action,workspace])=>`<button type="button" class="${key===active?'active':''}" ${workspace?'data-workspace="'+workspace+'"':'data-action="'+action+'"'} aria-current="${key===active?'page':'false'}">${label}</button>`).join('')}</nav>`}
function header(shop,kind,o){const s=collectorStatus(o),name=shop==='PIA大船1'?'PIA大船-S':shop||'店舗を選択';
 const latest=o?.latestDate||bridge()?.getStoreDates?.(shop,1)?.[0]||'';
 return `<header class="sv2-header"><div class="sv2-brand"><small class="sv2-kicker">STORE / SLOT</small><button type="button" class="sv2-store-select" data-open-store-selector><span>${esc(name)}</span><i>⌄</i></button></div><div class="sv2-status"><strong class="${s.warn?'warn':''}">${s.warn?'△':'✓'} ${esc(s.label)}</strong><small>最新 ${esc(dateShort(latest))}</small></div></header>${nav(kind)}`;
}
function subnav(kind){
 if(kind==='trend')return `<nav class="sv2-subnav" aria-label="店舗傾向の種類"><button type="button" data-action="store-trend" class="${app.state.screen==='trend'?'active':''}">台番傾向</button><button type="button" data-action="store-analysis" class="${app.state.screen==='analysis'?'active':''}">投入パターン</button></nav>`;
 if(kind==='verify')return `<nav class="sv2-subnav" aria-label="予測検証の種類"><button type="button" data-action="store-model" class="${app.state.screen==='model'?'active':''}">LIVE成績</button><button type="button" data-action="store-replay" class="${app.state.screen==='replay'?'active':''}">過去検証</button></nav>`;
 return '';
}
function latestSummary(shop,o){
 const date=String(o?.latestDate||bridge()?.getStoreDates?.(shop,1)?.[0]||'');if(!date)return{date,rows:[],known:[],avg:null};
 const data=bridge()?.getStoreDay?.(shop,date),rows=Array.isArray(data?.rows)?data.rows:[];
 const known=rows.filter(r=>r.diff!==null&&r.diff!==undefined&&r.diff!==''&&Number.isFinite(Number(r.diff)));
 const played=rows.filter(r=>r.games!==null&&r.games!==undefined&&Number.isFinite(Number(r.games)));
 return {date,rows,known,avg:played.length?played.reduce((sum,r)=>sum+Number(r.games),0)/played.length:null,win:known.filter(r=>Number(r.diff)>=0).length,total:known.reduce((sum,r)=>sum+Number(r.diff),0)};
}
function card(title,meta,body,action,label){return `<section class="sv2-card"><div class="sv2-card-head"><b>${title}</b><small>${esc(meta)}</small></div>${body}${action?`<button type="button" class="sv2-action" data-action="${action}">${label} →</button>`:''}</section>`}
function overview(screen,shop,o){
 const d=latestSummary(shop,o),s=collectorStatus(o),r=app.state.trendResult;
 const t=r?.shop===shop&&Array.isArray(r.rows)?r.rows.slice(0,3):null;
 const daily=d.rows.length?`<div class="sv2-mini-grid"><div><small>総差枚${d.known.length<d.rows.length?'（確認分）':''}</small><b>${d.known.length?diff(d.total):'—'}</b></div><div><small>平均G</small><b>${Number.isFinite(d.avg)?num(d.avg)+'G':'—'}</b></div><div><small>勝率${d.known.length<d.rows.length?'（確認分）':''}</small><b>${d.known.length?(100*d.win/d.known.length).toFixed(1)+'%':'—'}</b></div></div><p class="sv2-note">差枚観測 ${d.known.length}/${d.rows.length}台。欠損は集計に含めません。</p>`:'<p class="sv2-note">まだ表示できる台データがありません。</p>';
 const trend=t?.length?t.map((row,i)=>`<div class="sv2-overview-row"><span class="sv2-rank">${i+1}</span><div><b>${esc(row.tableNo)}番 · ${esc(row.machineName)}</b><small>観測 ${num(row.days)}日</small></div><strong>${Number.isFinite(Number(row.avgES))?Number(row.avgES).toFixed(2):'—'}</strong></div>`).join(''):'<p class="sv2-note">この店舗で計算済みの傾向はありません。傾向タブから必要時に計算できます。</p>';
 const p=app.state.planResult,ready=p&&(p.shop===shop||p.store===shop)&&p.available&&!p.error;
 const plan=ready?`<div class="sv2-mini-grid"><div><small>店舗スコア</small><b>${num(p.score)}</b></div><div><small>候補</small><b>${(p.candidates||[]).length}台</b></div><div><small>判定</small><b>${p.go?'候補あり':'慎重'}</b></div></div>`:'<p class="sv2-note">予測は未計算。必要時に予測エンジンを実行します。</p>';
 screen.classList.add('sv2-workspace','sv2-overview');
 screen.innerHTML=header(shop,'overview',o)+`<div class="sv2-kpis"><div class="sv2-kpi"><small>蓄積</small><b>${o?.storedDays==null?'—':num(o.storedDays)+'日'}</b></div><div class="sv2-kpi"><small>最新台数</small><b>${o?.machineRows==null?'—':num(o.machineRows)+'台'}</b></div><div class="sv2-kpi"><small>最新総G</small><b>${num(o?.totalG)}</b></div></div>`+
 card('最新営業日',d.date||'未取得',daily,'store-data','台データを見る')+
 card('今日の作戦',app.state.planDate||'',plan,'store-plan','予測を開く')+
 card('前回の台番傾向',t?'計算済み':'未計算',trend,'store-trend','傾向を見る')+
 `<div class="sv2-collector"><div><b>${s.warn?'△':'✓'} ${esc(s.label)}</b><small>${esc(s.description)}</small></div><button type="button" class="sv2-inline-action" data-action="data-collector">取得管理 →</button></div>`+
 card('その他の分析','詳細画面へ',`<div class="sv2-mini-grid"><button type="button" class="sv2-inline-action" data-action="store-analysis">店舗解析 →</button><button type="button" class="sv2-inline-action" data-action="store-replay">リプレイ →</button><button type="button" class="sv2-inline-action" data-action="store-model">モデル性能 →</button></div>`);
}
// Mobile comparison uses labels already supplied by the store summary; no judgement is run here.
const machineMetric=(record,label)=>record.metrics.find(metric=>metric.label===label)?.value||'—';
function machineMetricNumber(value){
 const match=String(value??'').replaceAll(',','').match(/^[+-]?(?:\d+\.?\d*|\.\d+)/);
 return match?Number(match[0]):null;
}
function sortedMachineRecords(records,sort='diff'){
 const label={diff:'平均差枚',games:'平均G',win:'勝率'}[sort];
 if(!label)return records.slice();
 return records.slice().sort((a,b)=>{
  const av=machineMetricNumber(machineMetric(a,label)),bv=machineMetricNumber(machineMetric(b,label));
  if(av===null)return bv===null?a.index-b.index:1;
  if(bv===null)return -1;
  return bv-av||a.index-b.index;
 });
}
function mobileMachineRows(records,sort='diff',openedIndex=null){
 return sortedMachineRecords(records,sort).map(row=>{
  const value=label=>machineMetric(row,label),average=value('平均差枚'),n=machineMetricNumber(average);
  const tone=n===null?'':n>0?'sv2-positive':n<0?'sv2-negative':'';
  const win=value('勝率'),shortWin=win.match(/^\d+(?:\.\d+)?%/)?.[0]||'—';
  const details=['総差枚','平均差枚','平均G','台数','勝率','平均出率','平均設定'];
  return `<details class="sv2-machine-mobile-row" name="sv2-machine-detail" data-machine-index="${row.index}" ${openedIndex===row.index?'open':''}><summary class="sv2-machine-mobile-summary"><span class="sv2-machine-mobile-name">${esc(row.name)}</span><span class="sv2-machine-mobile-value ${tone}">${esc(average)}</span><span class="sv2-machine-mobile-value">${esc(value('平均G'))}</span><span class="sv2-machine-mobile-value">${esc(shortWin)}</span><span class="sv2-machine-chevron" aria-hidden="true">⌄</span></summary><div class="sv2-machine-mobile-detail">${details.map(label=>`<div class="sv2-machine-detail-stat"><small>${esc(label)}</small><b class="${label.includes('差枚')?tone:''}">${esc(value(label))}</b></div>`).join('')}</div></details>`;
 }).join('');
}
function machineTable(screen){
 const list=screen.querySelector('.vps-audit-summary .vps-audit-machines');if(!list||list.dataset.sv2Table)return;
 const cards=[...list.querySelectorAll(':scope > .vps-audit-machine')];if(!cards.length)return;
 const records=cards.map((card,index)=>({index,name:card.querySelector(':scope > b')?.textContent||'—',metrics:[...card.querySelectorAll('.vps-audit-machine-grid > div')].map(x=>({label:x.querySelector('small')?.textContent||'',value:x.querySelector('b')?.textContent||'—'}))}));
 // Desktop: preserve the existing six-column presentation and original row order.
 const heads=['機種','総差枚','平均差枚','平均G','平均出率','平均設定'];
 const desktop=`<div class="sv2-machine-table-scroll"><table class="sv2-machine-table"><thead><tr>${heads.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${records.map(row=>`<tr><td>${esc(row.name)}</td>${heads.slice(1).map(label=>`<td>${esc(machineMetric(row,label))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 const mobile=`<div class="sv2-machine-mobile"><div class="sv2-machine-sortbar"><label for="sv2-machine-sort">表示順</label><select id="sv2-machine-sort" data-sv2-machine-sort><option value="diff">平均差枚順</option><option value="games">平均G順</option><option value="win">勝率順</option><option value="original">元の順</option></select></div><div class="sv2-machine-mobile-list"><div class="sv2-machine-mobile-head"><span>機種</span><span>平均差枚</span><span>平均G</span><span>勝率</span><span></span></div><div class="sv2-machine-mobile-rows">${mobileMachineRows(records)}</div></div></div>`;
 list.innerHTML=desktop+mobile;
 list._sv2MachineRecords=records;
 list.dataset.sv2Table='1';
}
function verificationMode(){return app?.state?.screen==='replay'?'historical':'live'}
function loadVerification(screen,shop,{force=false}={}){
 const node=screen.querySelector('[data-sv2-verification-content]');if(!node)return;
 const id=++verificationSequence,mode=verificationMode();
 if(!force){
  const cached=verificationReader.peek(shop);
  if(cached){node.innerHTML=renderVerificationResults(cached,mode);return}
 }
 node.innerHTML='<div class="sv2-verify-message"><b>VPSの保存済み結果を読み込み中…</b><span>端末内で予測や再計算は実行しません。</span></div>';
 void verificationReader.read(shop,{force}).then(comparison=>{
  if(id!==verificationSequence||!screen.isConnected||app?.state?.activeStore!==shop||verificationMode()!==mode)return;
  node.innerHTML=renderVerificationResults(comparison,mode);
 }).catch(error=>{
  if(id!==verificationSequence||!screen.isConnected||app?.state?.activeStore!==shop||verificationMode()!==mode)return;
  node.innerHTML=errorMessage(error);
 });
}
function verificationScreen(screen,shop,o){
 screen.dataset.sv2Attached='1';screen.classList.add('sv2-workspace','sv2-verify');
 const mode=verificationMode();
 screen.innerHTML=header(shop,'verify',o)+subnav('verify')+
  '<div class="sv2-section-title"><b>'+(mode==='live'?'予測の答え合わせ':'過去の朝を検証')+'</b><small>VPS保存済みデータ</small></div>'+
  '<div class="sv2-verify-toolbar"><span>自動で蓄積した予測・採点を表示</span><button type="button" data-sv2-verify-refresh>再取得 ↻</button></div>'+
  '<div data-sv2-verification-content aria-live="polite"></div>';
 loadVerification(screen,shop);
}
function remoteTrendCache(shop){
 const cache=globalThis.JUGEST_VPS_REMOTE_STORES;
 if(!cache?.loadTrendDays||!cache?.getStores?.().some(s=>s.name===shop))return null;
 // Never replace the existing local-history behavior when this device has local days.
 if((bridge()?.getStoreTrendRoster?.(shop,{period:'all'})?.dayCount||0)>0)return null;
 return cache;
}
function repairRemoteTrendSummary(screen,shop,o){
 if(app?.state?.screen!=='trend')return;
 const cache=remoteTrendCache(shop);if(!cache)return;
 const summary=screen.querySelector('.trend-summary'),rosterText=summary?.querySelector('b');
 if(!summary||!rosterText||!/^0日\s*\/\s*0台$/.test(rosterText.textContent.trim()))return;
 const dates=selectTrendDates(cache.getDates(shop,366),app?.state?.trendPeriod||'30');
 const source=bridge()?.getStoreDay?.(shop,dates[0]||'')?.rows||[];
 const machines=[...new Map(source.filter(r=>r.machine).map(r=>[r.machine,globalThis.JugestMachineNames?.full?.(r.machine)||r.machineName||r.machine])).entries()];
 const picker=screen.querySelector('[data-trend-machine]');
 if(picker&&picker.options.length<=1)for(const [key,label] of machines){
  const option=document.createElement('option');option.value=key;option.textContent=label;picker.append(option);
 }
 if(picker)picker.value=app?.state?.trendMachine||'';
 const total=Number(o?.machineRows)||source.length,selected=app?.state?.trendMachine||'';
 const count=selected?source.filter(r=>r.machine===selected).length:total;
 const small=summary.querySelector('small');if(small)small.textContent='VPS保存済みの日別データ';
 rosterText.textContent=dates.length+'日 / 最新'+count+'台';
 const button=summary.querySelector('[data-trend-run]');
 if(button&&!app.state.trendLoading){button.disabled=false;button.textContent='傾向を計算'}
 if(!app.state.trendResult&&!screen.querySelector('[data-sv2-trend-guidance]')){
  const tip=document.createElement('p');tip.className='sv2-verify-notice';tip.dataset.sv2TrendGuidance='';
  tip.textContent='VPSに保存された日別台データから計算します。計算を押した時だけ取得し、端末の保存履歴は変更しません。';
  summary.after(tip);
 }
 const preview=screen.querySelector('.roster-preview');
 if(preview&&machines.length)preview.innerHTML=source.filter(r=>!selected||r.machine===selected).slice(0,8).map(r=>'<span>'+esc(r.tableNo)+' '+esc(globalThis.JugestMachineNames?.short?.(r.machine)||r.machineName)+'</span>').join('');
}
async function runRemoteTrend(){
 const shop=String(app?.state?.activeStore||''),cache=remoteTrendCache(shop);
 if(!cache||app.state.trendLoading)return;
 const period=String(app.state.trendPeriod||'30'),machine=String(app.state.trendMachine||''),requestId=++remoteTrendSequence;
 const current=()=>requestId===remoteTrendSequence&&app?.state?.activeStore===shop&&String(app.state.trendPeriod||'30')===period&&String(app.state.trendMachine||'')===machine;
 app.state.trendLoading=true;app.state.trendResult=null;app.render();
 try{
  const days=await cache.loadTrendDays(shop,{period,onProgress:({done,total})=>{
   if(!current())return;
   const button=root?.querySelector('.store-trend-screen [data-trend-run]');
   if(button)button.textContent='VPS取得中 '+done+'/'+total+'日';
  }});
  if(!current())return;
  if(!days.length)throw new Error('指定期間のVPSデータがありません');
  const judge=bridge()?.judgeObservedMachine;
  if(typeof judge!=='function')throw new Error('JUGEST判別エンジンを読み込めませんでした');
  const result=await computeVpsTrend({shop,days,machine,judge,isCurrent:current,onProgress:({done})=>{
   if(!current())return;
   const button=root?.querySelector('.store-trend-screen [data-trend-run]');
   if(button)button.textContent='判別中 '+done+'台';
  }});
  if(current()&&result)app.state.trendResult=result;
 }catch(error){
  if(current())app.state.trendResult={shop,rows:[],error:String(error?.message||error)};
 }finally{
  if(requestId===remoteTrendSequence){app.state.trendLoading=false;app.render()}
 }
}
function compactDataScreen(screen){
 const toolbar=screen.querySelector(':scope > .data-toolbar');
 if(toolbar&&!toolbar.dataset.sv2DataToolbar){
  toolbar.dataset.sv2DataToolbar='1';
  const heading=document.createElement('strong');heading.className='sv2-data-title';heading.textContent='全台データ';
  toolbar.prepend(heading);
  const date=toolbar.querySelector('[data-store-date]');
  if(date){
   date.setAttribute('aria-label','営業日');
   for(const option of date.options){
    const m=String(option.value).match(/^\d{4}-(\d{2})-(\d{2})$/);
    if(m)option.textContent=m[1]+'/'+m[2];
   }
  }
 }
 const summary=screen.querySelector('[data-vps-store-data-summary]');
 if(!summary||summary.dataset.sv2Compact==='1')return;
 const controls=summary.querySelector('.vps-matrix-tools'),filter=summary.querySelector('[data-vps-machine-filter="data"]'),density=controls?.querySelector('.vps-matrix-density');
 if(!controls||!filter||!density)return;
 summary.dataset.sv2Compact='1';
 controls.classList.add('sv2-tools-unified');
 density.before(filter);
 const filterLabel=filter.querySelector(':scope > summary > span');
 if(filterLabel)filterLabel.textContent='機種';
 const search=controls.querySelector('[data-vps-matrix-search]');
 if(search)search.placeholder='台番・機種検索';
 const counts=summary.querySelector('[data-vps-matrix-match-count]');
 if(counts)counts.hidden=!String(search?.value||'').trim();
 for(const kpi of summary.querySelectorAll('.vps-audit-kpis > .vps-audit-kpi')){
  const value=kpi.querySelector('b');if(!value)continue;
  const original=value.textContent.trim();
  const diff=original.match(/^([+-]?[\d,]+)(枚)$/);
  const rate=original.match(/^([\d.]+%)(\s*\(\d+\/\d+\))$/);
  if(diff){
   value.textContent=diff[1];
   const unit=document.createElement('span');unit.className='sv2-kpi-unit';unit.textContent=diff[2];value.append(unit);
  }else if(rate){
   value.textContent=rate[1];
   const detail=document.createElement('span');detail.className='sv2-kpi-denominator';detail.textContent=rate[2];value.append(detail);
  }
 }
}
function compact(screen,kind,shop,o){
 if(screen.dataset.sv2Attached){if(kind==='data'){machineTable(screen);compactDataScreen(screen)}if(kind==='trend')repairRemoteTrendSummary(screen,shop,o);return}
 screen.dataset.sv2Attached='1';screen.classList.add('sv2-workspace','sv2-'+kind);
 for(const key of ['.back-row','.kicker','.store-title','.store-meta'])screen.querySelector(':scope > '+key)?.remove();
 screen.querySelector(':scope > .segmented[aria-label="店舗内ナビ"]')?.remove();
 const label=kind==='data'?'全台データ':kind==='trend'?(app.state.screen==='analysis'?'投入パターン':'台番別の投入傾向'):kind==='plan'?'今日の作戦':(app.state.screen==='model'?'予測の答え合わせ':'過去の朝を再現');
 const meta=kind==='data'?'既存ヒートマップを維持':kind==='trend'?'実データと観測日数から評価':kind==='plan'?'既存エンジンで計算':'予測結果を検証';
 screen.insertAdjacentHTML('afterbegin',header(shop,kind,o)+subnav(kind)+`<div class="sv2-section-title"><b>${label}</b><small>${meta}</small></div>`);
 if(kind==='plan'){const controls=screen.querySelector('.plan-controls');if(controls){const wrap=document.createElement('details');wrap.className='sv2-plan-settings';if(!app.state.planResult||app.state.planResult.error)wrap.open=true;wrap.innerHTML='<summary>対象日・抽選番号・並び人数を設定</summary>';controls.before(wrap);wrap.append(controls)}}
 if(kind==='data'){machineTable(screen);compactDataScreen(screen)}
 if(kind==='trend')repairRemoteTrendSummary(screen,shop,o);
}
function reconcile(){
 if(!root||!app)return;const kind=screenKind(),screen=activeScreen();if(!kind||!screen||isPachinko(screen))return;
 style();const shop=String(app.state.activeStore||''),o=bridge()?.getStoreOverview?.(shop)||{};
 if(kind==='overview'){if(screen.dataset.sv2Attached)return;screen.dataset.sv2Attached='1';overview(screen,shop,o)}
 else if(kind==='verify'){if(!screen.dataset.sv2Attached)verificationScreen(screen,shop,o)}
 else compact(screen,kind,shop,o);
}
function schedule(){if(pending)return;pending=true;(globalThis.requestAnimationFrame||globalThis.setTimeout)(()=>{pending=false;try{reconcile()}catch(e){console.error('JUGEST Store UI v2:',e)}},0)}
function attach(candidate){if(app===candidate&&root===candidate?.shadowRoot)return !!root;observer?.disconnect();app=candidate;root=candidate?.shadowRoot||null;if(!root)return false;observer=new MutationObserver(schedule);observer.observe(root,{childList:true,subtree:true});root.addEventListener('input',event=>{if(!event.target?.matches?.('[data-vps-matrix-search]'))return;const summary=event.target.closest('[data-vps-store-data-summary]'),counts=summary?.querySelector('[data-vps-matrix-match-count]');if(counts)counts.hidden=!String(event.target.value||'').trim()},true);root.addEventListener('change',event=>{const select=event.target;if(!select?.matches?.('[data-sv2-machine-sort]'))return;const list=select.closest('.vps-audit-machines'),rows=list?.querySelector('.sv2-machine-mobile-rows');if(!rows||!Array.isArray(list._sv2MachineRecords))return;const opened=rows.querySelector('.sv2-machine-mobile-row[open]');const index=opened?Number(opened.dataset.machineIndex):null;rows.innerHTML=mobileMachineRows(list._sv2MachineRecords,select.value,index)},true);root.addEventListener('click',event=>{const trendButton=event.target?.closest?.('[data-trend-run]');if(trendButton&&app?.state?.screen==='trend'&&remoteTrendCache(app?.state?.activeStore||'')){event.preventDefault();event.stopImmediatePropagation();void runRemoteTrend();return}const button=event.target?.closest?.('[data-sv2-verify-refresh]');if(!button)return;const screen=button.closest('section.sv2-verify');if(screen){verificationReader.clear(app?.state?.activeStore||'');loadVerification(screen,app?.state?.activeStore||'',{force:true})}},true);schedule();return true}
function boot(){if(attach(document.querySelector('jugest-app')))return;globalThis.setTimeout(boot,60)}
if(typeof document!=='undefined')boot();
export const __test={collectorStatus,latestSummary,nav,dateShort,machineMetricNumber,sortedMachineRecords,mobileMachineRows};

