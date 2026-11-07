import {createAnalysisJobController} from './analysis-job-panel.mjs';
import{createVpsAnalyticsClient}from'../lib/generated-browser-client.mjs';
import{createRemoteStoreCache}from'../upstream/vps-ui-remote-stores.mjs';

export function withDisplayMachineNames(payload, registry = globalThis.JugestMachineNames) {
 const rows = payload?.day?.machines;
 if (!registry || !Array.isArray(rows)) return payload;
 return {...payload, day: {...payload.day, machines: rows.map(row => {
  if (!row || row.sourceMachineName || row.machineName) return row;
  const name = registry.full(row.machine);
  return name ? {...row, machineName: name} : row;
 })}};
}

export function createSitesStoreConnection({fetchFn=globalThis.fetch.bind(globalThis),storage=globalThis.localStorage,cookieAuth=false,eventTarget=globalThis,onState=()=>{}}={}){
 let active=0,state={loading:false,error:null};
 const emit=()=>onState({...state,loading:active>0});
 const tracked=async(...args)=>{active++;emit();try{const response=await fetchFn(...args);if(!response.ok){state.error={status:response.status,message:response.status===401?'店舗データを読むための認証が必要です。':response.status===403?'この店舗を閲覧する権限がありません。':'店舗データを読み込めませんでした。'};let detail=null;try{detail=await response.clone().json()}catch{}if(detail?.code==='owner_trial_data_locked')state.error.message='本人限定試用の接続確認中です。店舗データはまだ開いていません。';else if(detail?.code)state.error.message+='（'+String(detail.code)+'）';if(detail?.code==='development_request_failed')state.error.message+=' '+String(detail.message)}else state.error=null;return response}catch(error){state.error={status:0,message:'店舗データへの通信に失敗しました。'};throw error}finally{active--;emit()}};
 const client=createVpsAnalyticsClient({fetchFn:tracked,storage,cookieAuth});
 const remote=createRemoteStoreCache({client: {
  ...client,
  async listStores() {
   // The upstream cache filters the VPS's native source. Adapt the already
   // authorized list for display without changing its server-side provenance.
   return (await client.listStores()).map(store =>
    ['authorized-pia-import','synthetic-pia-import'].includes(store.source)
     ? {...store,source:'pia-public-ranking-top',visibility:'public'} : store);
  },
  async getStoreDayById(id, date) {
   return withDisplayMachineNames(await client.getStoreDayById(id, date));
  },
 },eventTarget});
 const cache={...remote,getOverview(name){
  const overview=remote.getOverview(name);
  // Remote cache availability alone cannot prove an active schedule.
  return overview?{...overview,collector:{...overview.collector,enabled:false}}:overview;
 }};
 return{client,cache,getState:()=>({...state,loading:active>0}),async refresh(){try{return await cache.refresh()}catch(error){if(!state.error)state.error={status:error.status||0,message:String(error.message)};emit();throw error}}};
}
// The original app can display the first remote store before the core bridge
// has selected one. The matrix and its detail panel read the bridge selection.
export function initializeRemoteStoreSelection(bridge, store) {
 if (!store?.remote || !bridge || bridge.getActiveStore?.()) return false;
 return bridge.setActiveStore?.(store.name, {silent: true}) === true;
}

function install(){
 let ownerView=false,devSession=false;
 let app=null,root=null,panel=null,connection=null,state={loading:true,error:null},details=null,selected='',sequence=0,scheduled=false,jobPanel=null,jobStoreId='';
 function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;render()})}
 async function load(shop){const version=++sequence;details=null;try{const[status,history]=await Promise.all([connection.client.getStatus(shop),connection.client.getAnalysisHistory(shop)]);if(version!==sequence)return;details={status:status.status,collection:status.collection,history:history.history||[]}}catch(error){if(version===sequence)details={error:String(error.message)}}finally{schedule()}}
 function render(){
  app=document.querySelector('jugest-app');root=app?.shadowRoot;if(!root||!connection)return;
  const screen=root.querySelector('#view > section.workspace');if(app.state?.workspace!=='store'||!screen)return;
  const shop=String(app.state.activeStore||'');
  const currentStore=connection.cache.getStores().find(x=>x.name===shop);
  initializeRemoteStoreSelection(globalThis.JUGEST_CORE_BRIDGE,currentStore);
  if(shop!==selected){selected=shop;if(shop){void load(shop);const store=connection.cache.getStores().find(x=>x.name===shop);if(!ownerView&&store&&jobStoreId!==store.id){jobStoreId=store.id;void jobPanel.load(store.id)}}}
  panel=screen.querySelector('[data-sites-server]');if(!panel){panel=document.createElement('section');panel.className='info-card';panel.dataset.sitesServer='';screen.append(panel)}
  const localHistory=screen.querySelector('.analysis-history-title');if(localHistory&&localHistory.textContent!=='端末の解析スナップショット')localHistory.textContent='端末の解析スナップショット';
  const error=state.error?.message||details?.error,empty=!state.loading&&!connection.cache.getStores().length;
  const text=error|| (state.loading?'店舗データを読み込み中…':empty?'閲覧できる店舗データはまだありません。':details?.status?.status==='pending'?'店舗解析は実行待ちです。':details?.status?.status==='completed'?'保存済みの店舗解析を表示できます。':'店舗データを取得しました。');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const history=app.state.screen==='analysis'&&details?.history?`<details><summary>サーバー解析履歴（${details.history.length}件）</summary>${details.history.map(x=>`<p>${esc(x.targetDate)} · ${esc(x.component)} · ${esc(x.version)}<br><small>${esc(x.createdAt)}</small></p>`).join('')||'<p>保存された解析履歴はまだありません。</p>'}</details>`:'';
  if(!ownerView&&currentStore&&jobStoreId!==currentStore.id){jobStoreId=currentStore.id;void jobPanel.load(currentStore.id)}
  const collection=details?.collection;
  const collectionLabel=collection?.running?'取得中':({
    seeded:'初回の基準データを保存',gap_seeded:'日付に間隔があり、基準を取り直しました',
    ingested:'営業日データを保存済み',already_collected:'同じ基準日のため更新なし',
    not_ready:'取得元の履歴更新待ち',failed:'取得できませんでした',access_denied:'取得先へのアクセスが拒否されました',
  })[collection?.status]??'取得結果待ち';
  const time=value=>value?new Intl.DateTimeFormat('ja-JP',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tokyo'}).format(new Date(value)):'—';
  const collectionMarkup=collection?`<div data-pia-collection><p>PIA取得状況：${esc(collectionLabel)}</p><p>最終取得成功：${esc(time(collection.lastSuccessAt))}（日本時間）<br>最終試行：${esc(time(collection.lastAttemptAt))}（日本時間）<br>最新保存営業日：${esc(collection.businessDate??'—')}</p></div>`:'';
  const archived=currentStore?.id==='dev-pia-observed';
  const imported=/^(?:dev-pia-import-|pia:35:import:)/.test(currentStore?.id||'');
  const synthetic=currentStore?.id.startsWith('dev-store-');
  const archiveTitle=screen.querySelector('.sv2-card-head b');
  if((archived||imported||synthetic)&&archiveTitle?.textContent==='最新営業日'){
   archiveTitle.textContent=archived?'保存済みの観測日':'保存データの営業日';
  }
  const archivedMarkup=archived?`<p data-pia-observed><strong>過去の公開観測</strong> · 営業日 ${esc(currentStore.latestDate)}。出典はPIA大船1の公開観測記録。取得時刻と新規取得は未確認です。</p>`:'';
  const originMarkup=imported
   ? '<p>出典：'+esc(currentStore.name)+'。ファイル取り込みで保存したデータです。</p>'
   : synthetic?'<p>出典：開発用の合成データ</p>':'';
  const underMinimum=app.state.screen==='analysis'&&currentStore&&currentStore.dayCount<3;
  const shortage=underMinimum
   ? '<p data-analysis-insufficient>店舗分析は最低3営業日必要です。保存済みは'+currentStore.dayCount+'日です。</p>' : '';
  const jobs=!ownerView&&app.state.screen==='analysis'&&currentStore?jobPanel.markup(currentStore):'';
  const ownerMarkup=ownerView
   ? '<p>本人向け閲覧。台データ・設定判別・保存済み分析を表示します。</p>' +
     (state.error?.status===401?'<a href="/signin-with-chatgpt?return_to=%2F" target="_top">ChatGPTでログイン</a>':'<a href="/signout-with-chatgpt?return_to=%2F" target="_top">ChatGPTからログアウト</a>')
   : devSession?'<p><a href="/api/dev-pia-import">許可済み原本の照合・取り込み（開発用）</a></p>':'';
  const html=`<p role="${error?'alert':'status'}" aria-live="polite">${esc(text)}</p>${archivedMarkup}${originMarkup}${collectionMarkup}${shortage}${history}${jobs}${ownerMarkup}<button type="button" class="secondary-btn" data-sites-refresh>店舗データを更新</button>`;
  if(panel.__sitesMarkup!==html){panel.__sitesMarkup=html;panel.innerHTML=html;jobPanel.bind(panel);panel.querySelector('[data-sites-refresh]').onclick=()=>{selected='';void connection.refresh().catch(()=>{});schedule()}}
  // The browser cache cannot confirm that a hosted schedule is enabled.
  for(const badge of screen.querySelectorAll('.sv2-status strong,.sv2-collector b')){
   const label=archived?'過去の公開観測':imported?'原本取り込み':synthetic?'合成検証データ':collection?'取得履歴あり':'定期取得は未確認';
   if((archived||imported||synthetic||badge.textContent.includes('自動取得'))&&badge.textContent!==label)badge.textContent=label;
  }
  if(archived||imported||synthetic){
   for(const label of screen.querySelectorAll('.sv2-status small,.sv2-collector small')){
    const next=currentStore.latestDate?(archived?'観測日 ':'保存日 ')+currentStore.latestDate:'データ未取得';
    if(label.textContent!==next)label.textContent=next;
   }
  }
 }
 async function start(){
  try{
   const options={headers:{accept:'application/json'},cache:'no-store'};
   const response=await fetch('/api/owner-view',options);
   ownerView=response.status!==404;
   if(!ownerView){
    const dev=await fetch('/api/dev-session',options);
    if(dev.ok)devSession=!!(await dev.json()).authenticated;
   }
  }catch{}
  if(ownerView)globalThis.addEventListener('pageshow', event=>{if(event.persisted)globalThis.location.reload()});
  connection=createSitesStoreConnection({cookieAuth:ownerView||devSession,...(ownerView?{storage:null}:{}),onState:next=>{state=next;schedule()}});
  jobPanel=createAnalysisJobController({client:connection.client,onChange:schedule,onComplete:async(job)=>{if(job.kind==='store-analysis'&&app?.state?.activeStore===selected)await app.loadVpsStoreAnalysis();if(selected)await load(selected)}});
  globalThis.JUGEST_VPS_ANALYTICS_CLIENT=connection.client;
  globalThis.JUGEST_VPS_REMOTE_STORES=connection.cache;
  const observer=new MutationObserver(schedule);observer.observe(document,{childList:true,subtree:true});
  const attach=()=>{const a=document.querySelector('jugest-app');if(a?.shadowRoot&&!a.shadowRoot.__sitesObserved){a.shadowRoot.__sitesObserved=true;observer.observe(a.shadowRoot,{childList:true,subtree:true})}schedule()};
  globalThis.addEventListener('jugest:vps-remote-updated',attach);attach();
  void connection.refresh().catch(()=>{});
 }
 void start();
}
if(typeof document!=='undefined')install();
