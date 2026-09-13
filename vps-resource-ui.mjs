const RECEIVER_STORAGE_KEY='jugglerRelayReceiver:v1';
let diagnostics=null;
let loading=false;
let app=null;
let root=null;
let observer=null;

function esc(v){return String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]))}
function receiver(){try{const v=JSON.parse(localStorage.getItem(RECEIVER_STORAGE_KEY)||'null');const channelId=String(v?.channelId||'').trim(),receiverToken=String(v?.receiverToken||'').trim();return v?.linked&&channelId&&receiverToken?{channelId,receiverToken}:null}catch{return null}}
function fmtBytes(bytes){const n=Number(bytes);if(!Number.isFinite(n)||n<0)return '—';if(n>=1024**3)return `${(n/1024**3).toFixed(2)} GB`;return `${(n/1024**2).toFixed(0)} MB`}
function fmtMs(ms){const n=Number(ms);if(!Number.isFinite(n))return '—';return n>=1000?`${(n/1000).toFixed(1)}秒`:`${Math.round(n)}ms`}
function fmtAge(ms){const n=Number(ms);if(!Number.isFinite(n)||n<0)return '—';if(n<1000)return 'たった今';if(n<60000)return `${Math.round(n/1000)}秒前`;if(n<3600000)return `${Math.round(n/60000)}分前`;return `${(n/3600000).toFixed(1)}時間前`}
function latestAnalysis(r){return (r?.analysis?.recentRuns||[]).find(x=>x.type==='DAILY_ANALYSIS')||null}
function maxPeak(r){return (r?.analysis?.recentRuns||[]).reduce((m,x)=>Math.max(m,Number(x.observedPeakRssBytes)||0),0)||null}
function jobStateLabel(state){return ({queued:'Queued',retry_wait:'Retry待ち',leased:'Leased',running:'Running'})[state]||String(state||'—')}
function schedulerReason(health={}){return ({running:'解析実行中',leased_not_running:'Lease済みだがRunning未移行',no_scheduler_sample:'Schedulerの記録がない',scheduler_stale:'Scheduler更新が停止・遅延',memory_emergency:'RAM緊急域で停止',memory_pause:'RAM使用率で一時停止',ready_not_running:'実行可能ジョブあり・未起動',retry_wait:'再試行時刻待ち',idle:'待機中'})[health.code]||String(health.code||'不明')}

async function loadResources(){
  const auth=receiver();if(!auth)throw new Error('VPS連携情報がありません');
  const res=await fetch('/api/vps/system/resources',{headers:{authorization:`Bearer ${auth.receiverToken}`,'x-jugest-channel-id':auth.channelId},cache:'no-store'});
  const body=await res.json().catch(()=>null);
  if(!res.ok||!body?.ok)throw new Error(body?.message||body?.code||`HTTP ${res.status}`);
  return body.resources;
}

function style(){
  if(document.querySelector('style[data-vps-resource-ui]'))return;
  const el=document.createElement('style');el.dataset.vpsResourceUi='';el.textContent=`
.vps-resource-overlay{position:fixed;z-index:95;inset:0;background:#f7f9ff;overflow:auto;padding:calc(22px + env(safe-area-inset-top,0px)) 20px calc(36px + env(safe-area-inset-bottom,0px));box-sizing:border-box;color:#101a33;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Noto Sans JP","Hiragino Sans","Yu Gothic UI",sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.vps-resource-wrap{max-width:720px;margin:0 auto}.vps-resource-back{border:0;background:transparent;color:#315fd5;font:inherit;font-weight:800;padding:8px 0 18px;min-height:44px}.vps-resource-kicker{font-size:12px;font-weight:800;letter-spacing:.22em;color:#315fd5;margin:4px 0 10px}.vps-resource-wrap h1{margin:0 0 18px;font-size:32px;color:#101a38}.vps-resource-card{background:#fff;border:1px solid #dfe5f3;border-radius:20px;padding:18px;margin:0 0 14px;box-shadow:0 8px 24px rgba(33,55,110,.05)}.vps-resource-card h2{margin:0 0 12px;font-size:18px}.vps-resource-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.vps-resource-metric{background:#f7f9fd;border-radius:13px;padding:11px;min-width:0}.vps-resource-metric small{display:block;color:#7a8396;margin-bottom:4px}.vps-resource-metric b{display:block;font-size:16px;color:#16203e;overflow-wrap:anywhere}.vps-resource-wide{grid-column:1/-1}.vps-resource-alert{background:#fff7e8}.vps-resource-actions{display:flex;gap:10px;margin-top:14px}.vps-resource-actions button{min-height:44px;border-radius:13px;border:1px solid #d9e0ee;background:#fff;font:inherit;font-weight:800;padding:9px 14px}.vps-resource-note{font-size:12px;color:#7a8396;line-height:1.55;margin-top:10px}.vps-resource-error{color:#b72d3b}.vps-resource-settings-row{margin-top:0}
`;document.head.append(el)
}

function contentHtml(){
  if(loading)return '<section class="vps-resource-card">取得中…</section>';
  if(diagnostics?.error)return `<section class="vps-resource-card vps-resource-error">${esc(diagnostics.error)}</section>`;
  const r=diagnostics?.data;if(!r)return '<section class="vps-resource-card">まだ取得していません。</section>';
  const a=latestAnalysis(r),peak=maxPeak(r),used=r.system?.usedMemoryBytes,total=r.system?.totalMemoryBytes;
  const q=r.analysis?.queueByState||{},health=r.analysis?.schedulerHealth||{},latestSchedulerSample=r.analysis?.latestSchedulerSample||null,pendingJobs=r.analysis?.pendingJobs||[],next=pendingJobs[0]||null;
  const nextText=next?`${next.type} · ${jobStateLabel(next.state)} · ${next.estimatedLeaseMiB||0} MiB${next.storeId?` · ${next.storeId}`:''}`:'なし';
  const nextError=next?.lastErrorClass?` / ${next.lastErrorClass}${next.lastErrorMessage?`: ${next.lastErrorMessage}`:''}`:'';
  return `<section class="vps-resource-card"><h2>VPS全体</h2><div class="vps-resource-grid"><div class="vps-resource-metric"><small>RAM使用</small><b>${fmtBytes(used)} / ${fmtBytes(total)}</b></div><div class="vps-resource-metric"><small>使用率</small><b>${Number.isFinite(r.system?.usedRatio)?(r.system.usedRatio*100).toFixed(1)+'%':'—'}</b></div><div class="vps-resource-metric"><small>Load avg</small><b>${(r.system?.loadAverage||[]).map(x=>Number(x).toFixed(2)).join(' / ')||'—'}</b></div><div class="vps-resource-metric"><small>CPU</small><b>${r.system?.cpuCount??'—'} cores</b></div></div></section>
<section class="vps-resource-card"><h2>JUGEST Node</h2><div class="vps-resource-grid"><div class="vps-resource-metric"><small>RSS</small><b>${fmtBytes(r.process?.rssBytes)}</b></div><div class="vps-resource-metric"><small>Heap</small><b>${fmtBytes(r.process?.heapUsedBytes)} / ${fmtBytes(r.process?.heapTotalBytes)}</b></div></div></section>
<section class="vps-resource-card"><h2>解析キュー</h2><div class="vps-resource-grid"><div class="vps-resource-metric"><small>Queued</small><b>${q.queued??0}</b></div><div class="vps-resource-metric"><small>Retry待ち</small><b>${q.retryWait??0}</b></div><div class="vps-resource-metric"><small>Leased</small><b>${q.leased??0}</b></div><div class="vps-resource-metric"><small>Running</small><b>${q.running??0}</b></div><div class="vps-resource-metric"><small>直近ピーク</small><b>${fmtBytes(a?.observedPeakRssBytes||peak)}</b></div><div class="vps-resource-metric"><small>直近解析時間</small><b>${fmtMs(a?.durationMs)}</b></div></div><p class="vps-resource-note">ピークRSSは解析childが報告した観測値。開始時との差分を「解析が消費した正確なRAM」とは扱わない。</p></section>
<section class="vps-resource-card"><h2>Scheduler</h2><div class="vps-resource-grid"><div class="vps-resource-metric"><small>最終更新</small><b>${latestSchedulerSample?fmtAge(health.sampleAgeMs):'記録なし'}</b></div><div class="vps-resource-metric"><small>Pressure</small><b>${esc(health.pressure||latestSchedulerSample?.decision?.pressure||'—')}</b></div><div class="vps-resource-metric vps-resource-wide ${health.code&&health.code!=='running'&&health.code!=='idle'?'vps-resource-alert':''}"><small>停止理由</small><b>${esc(schedulerReason(health))}</b></div><div class="vps-resource-metric vps-resource-wide"><small>次ジョブ</small><b>${esc(nextText)}</b>${nextError?`<small>${esc(nextError)}</small>`:''}</div></div><p class="vps-resource-note">Schedulerは通常2秒間隔で状態を記録する。実行可能ジョブがあるのに更新が長く止まっていれば、Coordinator側の停止・遅延を疑える。</p></section>`;
}

function render(){
  const ov=document.querySelector('.vps-resource-overlay');if(!ov)return;
  ov.innerHTML=`<div class="vps-resource-wrap"><button class="vps-resource-back" type="button" data-vps-resource-close>‹ 設定へ戻る</button><div class="vps-resource-kicker">DIAGNOSTICS</div><h1>VPSリソース</h1>${contentHtml()}<div class="vps-resource-actions"><button type="button" data-vps-resource-refresh ${loading?'disabled':''}>更新</button></div></div>`;
}

async function refresh(){if(loading)return;loading=true;render();try{diagnostics={data:await loadResources()}}catch(e){diagnostics={error:String(e?.message||e)}}finally{loading=false;render()}}
function open(){style();if(document.querySelector('.vps-resource-overlay'))return;const ov=document.createElement('div');ov.className='vps-resource-overlay';ov.setAttribute('role','dialog');ov.setAttribute('aria-label','VPSリソース');document.body.append(ov);render();refresh()}
function close(){document.querySelector('.vps-resource-overlay')?.remove()}

function reconcileSettings(){
  const wrap=root?.querySelector('.vps-settings-overlay .vps-settings-wrap');if(!wrap)return;
  const h1=wrap.querySelector('h1');if(h1?.textContent?.trim()!=='設定')return;
  if(wrap.querySelector('[data-vps-resource-open]'))return;
  const card=document.createElement('section');card.className='vps-settings-card vps-resource-settings-row';card.innerHTML='<button type="button" class="vps-settings-row" data-vps-resource-open><span><b>VPSリソース</b><small>RAM・Node・解析負荷を確認</small></span><span class="vps-chev">›</span></button>';
  wrap.append(card)
}

function onRootClick(event){
  const target=event.target?.closest?.('[data-vps-resource-open]');if(!target)return;
  event.preventDefault();event.stopPropagation();open();
}

function attach(candidate){
  if(app===candidate&&root===candidate?.shadowRoot)return true;
  observer?.disconnect();
  if(root)root.removeEventListener('click',onRootClick,true);
  app=candidate;root=candidate?.shadowRoot||null;if(!root)return false;
  root.addEventListener('click',onRootClick,true);
  observer=new MutationObserver(reconcileSettings);observer.observe(root,{childList:true,subtree:true});reconcileSettings();return true;
}

function boot(){
  const candidate=document.querySelector('jugest-app');
  if(attach(candidate))return;
  globalThis.setTimeout(boot,50);
}

document.addEventListener('click',event=>{
  if(event.target.closest('[data-vps-resource-close]'))close();
  if(event.target.closest('[data-vps-resource-refresh]'))refresh();
});
boot();

export const __test={fmtBytes,fmtMs,fmtAge,schedulerReason};
