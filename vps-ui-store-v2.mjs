// Store UI v2 for slot stores. Keeps JUGEST engines, persistence and event handlers unchanged.
let app=null,root=null,observer=null,pending=false;
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
function nav(active){return `<nav class="sv2-tabs" aria-label="店舗内ナビ">${[['overview','概要','', 'store'],['data','台','store-data'],['trend','傾向','store-trend'],['plan','予測','store-plan'],['verify','検証','store-model']].map(([key,label,action,workspace])=>`<button type="button" class="${key===active?'active':''}" ${workspace?'data-workspace="'+workspace+'"':'data-action="'+action+'"'} aria-current="${key===active?'page':'false'}">${label}</button>`).join('')}</nav>`}
function header(shop,kind,o){const s=collectorStatus(o),name=shop==='PIA大船1'?'PIA大船-S':shop||'店舗を選択';
 const latest=o?.latestDate||bridge()?.getStoreDates?.(shop,1)?.[0]||'';
 return `<header class="sv2-header"><div class="sv2-brand"><small class="sv2-kicker">STORE / SLOT</small><button type="button" class="sv2-store-select" data-open-store-selector><span>${esc(name)}</span><i>⌄</i></button></div><div class="sv2-status"><strong class="${s.warn?'warn':''}">${s.warn?'△':'✓'} ${esc(s.label)}</strong><small>最新 ${esc(dateShort(latest))}</small></div></header>${nav(kind)}`;
}
function subnav(kind){
 if(kind==='trend')return `<nav class="sv2-subnav" aria-label="店舗傾向の種類"><button type="button" data-action="store-trend" class="${app.state.screen==='trend'?'active':''}">台番傾向</button><button type="button" data-action="store-analysis" class="${app.state.screen==='analysis'?'active':''}">投入パターン</button></nav>`;
 if(kind==='verify')return `<nav class="sv2-subnav" aria-label="予測検証の種類"><button type="button" data-action="store-model" class="${app.state.screen==='model'?'active':''}">モデル性能</button><button type="button" data-action="store-replay" class="${app.state.screen==='replay'?'active':''}">過去の朝を再現</button></nav>`;
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
function machineTable(screen){
 const list=screen.querySelector('.vps-audit-summary .vps-audit-machines');if(!list||list.dataset.sv2Table)return;
 const cards=[...list.querySelectorAll(':scope > .vps-audit-machine')];if(!cards.length)return;
 const records=cards.map(card=>({name:card.querySelector(':scope > b')?.textContent||'—',metrics:[...card.querySelectorAll('.vps-audit-machine-grid > div')].map(x=>({label:x.querySelector('small')?.textContent||'',value:x.querySelector('b')?.textContent||'—'}))}));
 const heads=['機種',...records[0].metrics.map(x=>x.label)];
 list.innerHTML=`<div class="sv2-machine-table-scroll"><table class="sv2-machine-table"><thead><tr>${heads.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${records.map(row=>`<tr><td>${esc(row.name)}</td>${heads.slice(1).map((_,i)=>`<td>${esc(row.metrics[i]?.value||'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 list.dataset.sv2Table='1';
}
function compact(screen,kind,shop,o){
 if(screen.dataset.sv2Attached){if(kind==='data')machineTable(screen);return}
 screen.dataset.sv2Attached='1';screen.classList.add('sv2-workspace','sv2-'+kind);
 for(const key of ['.back-row','.kicker','.store-title','.store-meta'])screen.querySelector(':scope > '+key)?.remove();
 screen.querySelector(':scope > .segmented[aria-label="店舗内ナビ"]')?.remove();
 const label=kind==='data'?'全台データ':kind==='trend'?(app.state.screen==='analysis'?'投入パターン':'台番別の投入傾向'):kind==='plan'?'今日の作戦':(app.state.screen==='model'?'予測の答え合わせ':'過去の朝を再現');
 const meta=kind==='data'?'既存ヒートマップを維持':kind==='trend'?'実データと観測日数から評価':kind==='plan'?'既存エンジンで計算':'予測結果を検証';
 screen.insertAdjacentHTML('afterbegin',header(shop,kind,o)+subnav(kind)+`<div class="sv2-section-title"><b>${label}</b><small>${meta}</small></div>`);
 if(kind==='plan'){const controls=screen.querySelector('.plan-controls');if(controls){const wrap=document.createElement('details');wrap.className='sv2-plan-settings';if(!app.state.planResult||app.state.planResult.error)wrap.open=true;wrap.innerHTML='<summary>対象日・抽選番号・並び人数を設定</summary>';controls.before(wrap);wrap.append(controls)}}
 if(kind==='data')machineTable(screen);
}
function reconcile(){
 if(!root||!app)return;const kind=screenKind(),screen=activeScreen();if(!kind||!screen||isPachinko(screen))return;
 style();const shop=String(app.state.activeStore||''),o=bridge()?.getStoreOverview?.(shop)||{};
 if(kind==='overview'){if(screen.dataset.sv2Attached)return;screen.dataset.sv2Attached='1';overview(screen,shop,o)}
 else compact(screen,kind,shop,o);
}
function schedule(){if(pending)return;pending=true;(globalThis.requestAnimationFrame||globalThis.setTimeout)(()=>{pending=false;try{reconcile()}catch(e){console.error('JUGEST Store UI v2:',e)}},0)}
function attach(candidate){if(app===candidate&&root===candidate?.shadowRoot)return !!root;observer?.disconnect();app=candidate;root=candidate?.shadowRoot||null;if(!root)return false;observer=new MutationObserver(schedule);observer.observe(root,{childList:true,subtree:true});schedule();return true}
function boot(){if(attach(document.querySelector('jugest-app')))return;globalThis.setTimeout(boot,60)}
if(typeof document!=='undefined')boot();
export const __test={collectorStatus,latestSummary,nav,dateShort};

