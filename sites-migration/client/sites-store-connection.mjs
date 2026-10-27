import {createAnalysisJobController} from './analysis-job-panel.mjs';
import{createVpsAnalyticsClient}from'../lib/generated-browser-client.mjs';
import{createRemoteStoreCache}from'../upstream/vps-ui-remote-stores.mjs';

export function createSitesStoreConnection({fetchFn=globalThis.fetch.bind(globalThis),storage=globalThis.localStorage,cookieAuth=false,eventTarget=globalThis,onState=()=>{}}={}){
 let active=0,state={loading:false,error:null};
 const emit=()=>onState({...state,loading:active>0});
 const tracked=async(...args)=>{active++;emit();try{const response=await fetchFn(...args);if(!response.ok){state.error={status:response.status,message:response.status===401?'店舗データを読むための認証が必要です。':response.status===403?'この店舗を閲覧する権限がありません。':'店舗データを読み込めませんでした。'};let detail=null;try{detail=await response.clone().json()}catch{}if(detail?.code)state.error.message+='（'+String(detail.code)+'）';if(detail?.code==='development_request_failed')state.error.message+=' '+String(detail.message)}else state.error=null;return response}catch(error){state.error={status:0,message:'店舗データへの通信に失敗しました。'};throw error}finally{active--;emit()}};
 const client=createVpsAnalyticsClient({fetchFn:tracked,storage,cookieAuth});
 const cache=createRemoteStoreCache({client,eventTarget});
 return{client,cache,getState:()=>({...state,loading:active>0}),async refresh(){try{return await cache.refresh()}catch(error){if(!state.error)state.error={status:error.status||0,message:String(error.message)};emit();throw error}}};
}
function install(){
 let app=null,root=null,panel=null,connection=null,state={loading:true,error:null},details=null,selected='',sequence=0,scheduled=false,jobPanel=null,jobStoreId='';
 function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;render()})}
 async function load(shop){const version=++sequence;details=null;try{const[status,history]=await Promise.all([connection.client.getStatus(shop),connection.client.getAnalysisHistory(shop)]);if(version!==sequence)return;details={status:status.status,history:history.history||[]}}catch(error){if(version===sequence)details={error:String(error.message)}}finally{schedule()}}
 function render(){
  app=document.querySelector('jugest-app');root=app?.shadowRoot;if(!root||!connection)return;
  const screen=root.querySelector('#view > section.workspace');if(app.state?.workspace!=='store'||!screen)return;
  const shop=String(app.state.activeStore||'');if(shop!==selected){selected=shop;if(shop){void load(shop);const store=connection.cache.getStores().find(x=>x.name===shop);if(store&&jobStoreId!==store.id){jobStoreId=store.id;void jobPanel.load(store.id)}}}
  panel=screen.querySelector('[data-sites-server]');if(!panel){panel=document.createElement('section');panel.className='info-card';panel.dataset.sitesServer='';screen.append(panel)}
  const localHistory=screen.querySelector('.analysis-history-title');if(localHistory&&localHistory.textContent!=='端末の解析スナップショット')localHistory.textContent='端末の解析スナップショット';
  const error=state.error?.message||details?.error,empty=!state.loading&&!connection.cache.getStores().length;
  const text=error|| (state.loading?'店舗データを読み込み中…':empty?'閲覧できる店舗データはまだありません。':details?.status?.status==='pending'?'店舗解析は実行待ちです。':details?.status?.status==='completed'?'保存済みの店舗解析を表示できます。':'店舗データを取得しました。');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const history=app.state.screen==='analysis'&&details?.history?`<details><summary>サーバー解析履歴（${details.history.length}件）</summary>${details.history.map(x=>`<p>${esc(x.targetDate)} · ${esc(x.component)} · ${esc(x.version)}<br><small>${esc(x.createdAt)}</small></p>`).join('')||'<p>保存された解析履歴はまだありません。</p>'}</details>`:'';
  const currentStore=connection.cache.getStores().find(x=>x.name===shop);if(currentStore&&jobStoreId!==currentStore.id){jobStoreId=currentStore.id;void jobPanel.load(currentStore.id)}
  const jobs=app.state.screen==='analysis'&&currentStore?jobPanel.markup(currentStore):'';
  const html=`<p role="${error?'alert':'status'}" aria-live="polite">${esc(text)}</p>${history}${jobs}<button type="button" class="secondary-btn" data-sites-refresh>店舗データを更新</button>`;
  if(panel.__sitesMarkup!==html){panel.__sitesMarkup=html;panel.innerHTML=html;jobPanel.bind(panel);panel.querySelector('[data-sites-refresh]').onclick=()=>{selected='';void connection.refresh().catch(()=>{});schedule()}}
  // Collection is not connected in this port. Do not present the inherited
  // remote-cache default `enabled:true` as a working scheduler.
  for(const badge of screen.querySelectorAll('.sv2-status strong,.sv2-collector b'))if(badge.textContent.includes('自動取得'))badge.textContent='取得状態は未接続';
 }
 async function start(){
  let cookieAuth=false;try{const response=await fetch('/api/dev-session',{headers:{accept:'application/json'},cache:'no-store'});if(response.ok)cookieAuth=!!(await response.json()).authenticated}catch{}
  connection=createSitesStoreConnection({cookieAuth,onState:next=>{state=next;schedule()}});
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
