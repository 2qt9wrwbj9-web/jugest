const RECEIVER_STORAGE_KEY='jugglerRelayReceiver:v1';
const FAILURE_ACK_KEY='jugest:vps:analysis-failure-ack';
const BACKFILL_BATCH_SIZE=15;

let app=null;
let root=null;
let observer=null;
let bridgeUnsubscribe=null;
let scheduled=false;
let settingsOpen=false;
let settingsPage='hub';
let collectorBusy=false;
let collectorMessage='';
let backfillBusy=false;
let backfillState=null;

function esc(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function bridge(){return globalThis.JUGEST_CORE_BRIDGE||null}
function readReceiver(){
  try{
    const value=JSON.parse(globalThis.localStorage?.getItem?.(RECEIVER_STORAGE_KEY)||'null');
    const channelId=String(value?.channelId||'').trim(),receiverToken=String(value?.receiverToken||'').trim();
    return value?.linked&&channelId&&receiverToken?{channelId,receiverToken}:null;
  }catch{return null}
}
function getFailureAck(){try{return globalThis.sessionStorage?.getItem?.(FAILURE_ACK_KEY)||''}catch{return ''}}
function setFailureAck(value){try{value?globalThis.sessionStorage?.setItem?.(FAILURE_ACK_KEY,value):globalThis.sessionStorage?.removeItem?.(FAILURE_ACK_KEY)}catch{}}
function chipFingerprint(chip){return `${chip.getAttribute('aria-label')||''}|${chip.textContent?.trim()||''}`}
function schedule(){if(scheduled)return;scheduled=true;(globalThis.requestAnimationFrame||globalThis.setTimeout)(()=>{scheduled=false;reconcile()},0)}

function styleText(){return `
[data-vps-settings-gear]{display:inline-flex!important;align-items:center;justify-content:center}
.vps-settings-overlay{position:fixed;z-index:80;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 58px);bottom:0;background:#f7f9ff;overflow:auto;-webkit-overflow-scrolling:touch;padding:20px 20px calc(36px + env(safe-area-inset-bottom,0px));box-sizing:border-box}
.vps-settings-overlay .vps-settings-wrap{max-width:720px;margin:0 auto}
.vps-settings-overlay .vps-settings-back{appearance:none;border:0;background:transparent;color:#315fd5;font:inherit;font-weight:700;padding:8px 0 18px;min-height:44px}
.vps-settings-overlay .vps-settings-kicker{font-size:12px;font-weight:800;letter-spacing:.24em;color:#315fd5;margin:4px 0 10px}
.vps-settings-overlay h1{margin:0 0 22px;font-size:34px;line-height:1.1;color:#101a38}
.vps-settings-card,.vps-backfill-card{background:#fff;border:1px solid #dfe5f3;border-radius:22px;padding:20px;box-shadow:0 8px 24px rgba(33,55,110,.05);margin:0 0 16px;color:#101a38}
.vps-settings-card h2,.vps-backfill-card h2{font-size:20px;margin:0 0 8px}.vps-settings-card p,.vps-backfill-card p{font-size:14px;line-height:1.6;color:#5f687e;margin:8px 0 14px}
.vps-settings-row{display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;border:0;background:transparent;padding:10px 0;text-align:left;color:#101a38;font:inherit}.vps-settings-row b{display:block;font-size:17px}.vps-settings-row small{display:block;color:#7a8396;margin-top:4px}.vps-settings-row .vps-chev{font-size:28px;color:#8d96a8}
.vps-settings-status{display:inline-flex;padding:6px 10px;border-radius:999px;background:#eef3ff;color:#315fd5;font-size:12px;font-weight:800;margin-bottom:10px}
.vps-settings-code{display:block;width:100%;box-sizing:border-box;border:1px solid #dfe5f3;background:#f8faff;border-radius:14px;padding:12px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#22304f;word-break:break-all;white-space:pre-wrap;margin:10px 0}
.vps-settings-actions{display:grid;gap:10px;margin-top:12px}.vps-settings-actions button,.vps-backfill-card button{min-height:48px;border-radius:14px;border:1px solid #d9e0ee;background:#fff;color:#142041;font:inherit;font-weight:800;padding:10px 14px}.vps-settings-actions button.primary,.vps-backfill-card button.primary{background:#245fe7;color:#fff;border-color:#245fe7}.vps-settings-actions button.danger{color:#b72d3b}.vps-settings-actions button:disabled,.vps-backfill-card button:disabled{opacity:.5}
.vps-settings-message,.vps-backfill-message{font-size:13px;line-height:1.55;color:#40506e;margin-top:12px}.vps-settings-message.error,.vps-backfill-message.error{color:#b72d3b}
.vps-progress{width:100%;height:8px;margin:12px 0 4px}.vps-backfill-counts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.vps-backfill-counts span{font-size:12px;border-radius:999px;background:#f0f3f9;padding:6px 9px;color:#43516c}
.vps-auto-hidden{display:none!important}
`}

function ensureStyle(){
  if(!root||root.querySelector('style[data-vps-ui-enhancements]'))return;
  const style=document.createElement('style');style.dataset.vpsUiEnhancements='';style.textContent=styleText();root.append(style);
}

function gearSvg(){return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h-.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7.6Z"></path></svg>`}

function ensureGear(){
  const side=root?.querySelector('.topbar .topbar-side');if(!side)return;
  let button=side.querySelector('[data-vps-settings-gear]');
  if(!button){button=document.createElement('button');button.type='button';button.className='icon-btn';button.dataset.vpsSettingsGear='';button.setAttribute('aria-label','設定');button.innerHTML=gearSvg();side.append(button)}
}

function collectorSettingsHtml(){
  const b=bridge(),d=b?.getDataStatus?.()||{},key=d.mode==='ios-shortcut'?String(b?.getCollectorKey?.()||''):'';
  const linked=!!d.hasReceiver||!!d.linked,waiting=d.pairState==='pending';
  const label=linked?'Collector連携済み':waiting?'連携コードの入力待ち':'Collector未連携';
  const endpoint=`${globalThis.location.origin}/api/relay`;
  return `<div class="vps-settings-wrap"><button class="vps-settings-back" type="button" data-vps-settings-back>‹ 設定</button><div class="vps-settings-kicker">SETTINGS</div><h1>Collector連携設定</h1><section class="vps-settings-card"><span class="vps-settings-status">${esc(label)}</span><h2>iPhone / Collector</h2><p>取得データをJUGESTへ送るための接続設定。自動取得の実行状況や店舗ごとの取得操作は「データ → 自動取得」で管理する。</p>${waiting&&d.code?`<small>Launcher連携コード</small><div class="vps-settings-code">${esc(d.code)}</div>`:''}${key?`<small>iPhoneキー</small><div class="vps-settings-code">${esc(key)}</div>`:''}<div class="vps-settings-actions">${!linked?`<button type="button" data-vps-collector-ios class="primary" ${collectorBusy?'disabled':''}>iPhone Shortcut用キーを発行</button><button type="button" data-vps-collector-pair ${collectorBusy?'disabled':''}>Collector / Launcherと連携</button>`:`${key?`<button type="button" data-vps-copy-key ${collectorBusy?'disabled':''}>iPhoneキーをコピー</button><button type="button" data-vps-collector-ios ${collectorBusy?'disabled':''}>iPhoneキーを更新</button>`:''}<button type="button" data-vps-collector-unlink class="danger" ${collectorBusy?'disabled':''}>Collector連携を解除</button>`}</div>${collectorMessage?`<div class="vps-settings-message ${collectorMessage.startsWith('エラー')?'error':''}">${esc(collectorMessage)}</div>`:''}</section><section class="vps-settings-card"><h2>Shortcutの接続先</h2><p>現在のShortcutはこのRelayへ送信する。iPhoneキーを更新した場合だけ、Shortcut側のキーも新しい値へ貼り替える。</p><small>送信先</small><div class="vps-settings-code">${esc(endpoint)}</div><small>action</small><div class="vps-settings-code">iosCollectorNextV2 / iosCollectorPushV2</div></section></div>`;
}

function settingsHubHtml(){
  return `<div class="vps-settings-wrap"><button class="vps-settings-back" type="button" data-vps-settings-close>‹ 戻る</button><div class="vps-settings-kicker">SETTINGS</div><h1>設定</h1><section class="vps-settings-card"><button type="button" class="vps-settings-row" data-vps-settings-collector><span><b>Collector連携</b><small>iPhoneキー・Shortcut接続・連携解除</small></span><span class="vps-chev">›</span></button></section></div>`;
}

function renderSettings(){
  const shell=root?.querySelector('.app-shell');if(!shell)return;
  let overlay=shell.querySelector('.vps-settings-overlay');
  if(!settingsOpen){overlay?.remove();shell.classList.remove('vps-settings-open');return}
  shell.classList.add('vps-settings-open');
  if(!overlay){overlay=document.createElement('div');overlay.className='vps-settings-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','設定');shell.append(overlay)}
  overlay.innerHTML=settingsPage==='collector'?collectorSettingsHtml():settingsHubHtml();
}

function failureChip(){return root?.querySelector('.analysis-chip')||null}
function reconcileFailureChip(){
  const chip=failureChip();if(!chip)return;
  const text=chip.textContent||'';
  if(!text.includes('解析失敗')){if(text.includes('店舗解析中')||text.includes('解析完了'))setFailureAck('');chip.style.removeProperty('display');return}
  const fingerprint=chipFingerprint(chip);
  if(getFailureAck()===fingerprint)chip.style.display='none';else chip.style.removeProperty('display');
}

function backfillCardHtml(){
  const d=bridge()?.getDataStatus?.()||{},n=Math.max(0,Number(d.externalDayCount)||0),receiver=readReceiver();
  const s=backfillState;
  return `<section class="panel vps-backfill-card" data-vps-backfill-card><h2>既存データをVPSへ移行</h2><p>このiPhoneに保存されている過去の店舗データをVPSへ送り、VPS解析の長期データとして利用する。VPSに同じ日付が既にある場合は上書きしない。</p><div class="vps-backfill-counts"><span>端末保存 ${n.toLocaleString('ja-JP')}日</span><span>${receiver?'VPS連携済み':'VPS連携が必要'}</span>${s?`<span>${s.done}/${s.total}日処理</span>`:''}</div>${s&&s.total?`<progress class="vps-progress" max="${s.total}" value="${s.done}"></progress>`:''}<button type="button" class="primary" data-vps-backfill-start ${backfillBusy||!n?'disabled':''}>${backfillBusy?'VPSへ移行中…':'このiPhoneの既存データをVPSへ移行'}</button>${s?`<div class="vps-backfill-message ${s.error?'error':''}">${esc(s.message||'')}<br>新規 ${s.inserted||0} / 重複 ${s.duplicates||0} / 競合 ${s.conflicts||0} / 未登録 ${s.skipped||0} / 失敗 ${s.failed||0}</div>`:''}</section>`;
}

function ensureAutoFetch(){
  const screen=root?.querySelector('.workspace.data-screen');if(!screen)return;
  const heading=screen.querySelector('h1');if(!heading||heading.textContent?.trim()!=='自動取得')return;
  const setup=screen.querySelector('.panel.sync-setup');if(setup){setup.classList.add('vps-auto-hidden');setup.dataset.vpsCollectorSetupHidden=''}
  let card=screen.querySelector('[data-vps-backfill-card]');
  if(!card){const host=document.createElement('div');host.innerHTML=backfillCardHtml();card=host.firstElementChild;const anchor=setup||heading;anchor.insertAdjacentElement('afterend',card)}
  else if(backfillBusy||backfillState){const host=document.createElement('div');host.innerHTML=backfillCardHtml();card.replaceWith(host.firstElementChild)}
}

function reconcile(){
  if(!root)return;ensureStyle();ensureGear();renderSettings();ensureAutoFetch();reconcileFailureChip();
}

async function refreshCollectorAfterAction(){try{await bridge()?.refreshCollector?.()}catch{/* connection state already updates locally */}}
async function collectorAction(kind){
  const b=bridge();if(!b||collectorBusy)return;
  if(kind==='ios'&&b.getCollectorKey?.()&&!globalThis.confirm?.('iPhoneキーを更新する？ 古いキーは無効になるので、Shortcutにも新しいキーを貼り替えてね。'))return;
  if(kind==='unlink'&&!globalThis.confirm?.('Collector連携を解除する？ 取得済みの端末/VPSデータは残るよ。'))return;
  collectorBusy=true;collectorMessage='';renderSettings();
  try{
    if(kind==='ios')await b.createIosCollector?.();
    else if(kind==='pair')await b.createCollectorPair?.();
    else if(kind==='unlink')await b.unlinkCollector?.();
    await refreshCollectorAfterAction();
    collectorMessage=kind==='unlink'?'Collector連携を解除したよ':kind==='ios'?'iPhone Collector設定を更新したよ':'Collector連携コードを準備したよ';
  }catch(error){collectorMessage=`エラー: ${String(error?.message||error)}`}
  finally{collectorBusy=false;renderSettings();schedule()}
}

async function copyKey(){
  const key=String(bridge()?.getCollectorKey?.()||'');if(!key)return;
  try{await globalThis.navigator?.clipboard?.writeText?.(key);collectorMessage='iPhoneキーをコピーしたよ'}catch{collectorMessage='コピーできなかったので、キーを長押ししてコピーしてね'}
  renderSettings();
}

function normalizeBackfillDays(days){
  if(!Array.isArray(days))return [];
  return days.filter(d=>d&&/^\d{4}-\d{2}-\d{2}$/.test(String(d.date||''))&&String(d.shop||'').trim()&&Array.isArray(d.machines)&&d.machines.length).map(d=>({
    date:String(d.date),shop:String(d.shop),source:String(d.source||'ana-slo'),sourceUrl:String(d.sourceUrl||''),capturedAt:String(d.capturedAt||''),machines:d.machines
  })).sort((a,b)=>a.date.localeCompare(b.date)||a.shop.localeCompare(b.shop,'ja'));
}

async function startBackfill(){
  if(backfillBusy)return;
  const receiver=readReceiver();
  if(!receiver){backfillState={total:0,done:0,error:true,message:'先に左上の設定 → Collector連携でiPhone Collectorを連携してね。'};schedule();return}
  const b=bridge();if(typeof b?.getVpsBackfillDays!=='function'){backfillState={total:0,done:0,error:true,message:'端末データの移行機能を読み込めなかったよ。ページを再読み込みしてね。'};schedule();return}
  let days;
  try{days=normalizeBackfillDays(await Promise.resolve(b.getVpsBackfillDays()))}catch(error){backfillState={total:0,done:0,error:true,message:`端末データを読み込めませんでした: ${String(error?.message||error)}`};schedule();return}
  if(!days.length){backfillState={total:0,done:0,error:false,message:'移行対象の端末データはないよ。'};schedule();return}
  if(!globalThis.confirm?.(`${days.length}日分の端末データをVPSへ移行する？\n\nVPSに同じ日付がある場合は上書きしません。`))return;
  backfillBusy=true;backfillState={total:days.length,done:0,inserted:0,duplicates:0,conflicts:0,skipped:0,failed:0,error:false,message:'VPSへ送信中…'};schedule();
  try{
    for(let i=0;i<days.length;i+=BACKFILL_BATCH_SIZE){
      const batch=days.slice(i,i+BACKFILL_BATCH_SIZE);
      const response=await fetch('/api/vps/backfill',{method:'POST',headers:{'content-type':'application/json','accept':'application/json','x-jugest-channel-id':receiver.channelId,'authorization':`Bearer ${receiver.receiverToken}`},body:JSON.stringify({days:batch}),cache:'no-store',credentials:'same-origin'});
      let payload=null;try{payload=await response.json()}catch{}
      if(!response.ok||payload?.ok!==true)throw new Error(payload?.code||`HTTP ${response.status}`);
      for(const key of ['inserted','duplicates','conflicts','skipped','failed'])backfillState[key]+=Number(payload[key])||0;
      backfillState.done+=batch.length;backfillState.message=`${backfillState.done}/${backfillState.total}日を処理済み`;schedule();
    }
    backfillState.message=`移行完了。新規 ${backfillState.inserted}日をVPS解析へ追加したよ。`;
  }catch(error){backfillState.error=true;backfillState.message=`移行を中断しました: ${String(error?.message||error)}。もう一度実行すれば続きから安全に再送できます。`}
  finally{backfillBusy=false;schedule()}
}

function onClick(event){
  const target=event.target?.closest?.('button,[data-vps-settings-gear]');if(!target)return;
  if(target.matches('[data-vps-settings-gear]')){event.preventDefault();event.stopPropagation();settingsOpen=true;settingsPage='hub';schedule();return}
  if(target.matches('[data-vps-settings-close]')){event.preventDefault();event.stopPropagation();settingsOpen=false;schedule();return}
  if(target.matches('[data-vps-settings-back]')){event.preventDefault();event.stopPropagation();settingsPage='hub';schedule();return}
  if(target.matches('[data-vps-settings-collector]')){event.preventDefault();event.stopPropagation();settingsPage='collector';schedule();return}
  if(target.matches('[data-vps-collector-ios]')){event.preventDefault();event.stopPropagation();collectorAction('ios');return}
  if(target.matches('[data-vps-collector-pair]')){event.preventDefault();event.stopPropagation();collectorAction('pair');return}
  if(target.matches('[data-vps-collector-unlink]')){event.preventDefault();event.stopPropagation();collectorAction('unlink');return}
  if(target.matches('[data-vps-copy-key]')){event.preventDefault();event.stopPropagation();copyKey();return}
  if(target.matches('[data-vps-backfill-start]')){event.preventDefault();event.stopPropagation();startBackfill();return}
  if(target.matches('.analysis-chip')&&(target.textContent||'').includes('解析失敗')){
    setFailureAck(chipFingerprint(target));
    globalThis.setTimeout(schedule,0);
  }
}

function attach(candidate){
  if(app===candidate&&root===candidate?.shadowRoot)return true;
  observer?.disconnect();
  bridgeUnsubscribe?.();bridgeUnsubscribe=null;
  app=candidate;root=candidate?.shadowRoot||null;if(!root)return false;
  root.addEventListener('click',onClick,true);
  const unsubscribe=bridge()?.subscribe?.(()=>{root?.querySelector('[data-vps-backfill-card]')?.remove();schedule()});
  bridgeUnsubscribe=typeof unsubscribe==='function'?unsubscribe:null;
  observer=new MutationObserver(schedule);observer.observe(root,{childList:true,subtree:true});schedule();return true;
}

function boot(){
  const candidate=document.querySelector('jugest-app');
  if(attach(candidate))return;
  globalThis.setTimeout(boot,50);
}

boot();

export const __test={RECEIVER_STORAGE_KEY,FAILURE_ACK_KEY,BACKFILL_BATCH_SIZE,normalizeBackfillDays};