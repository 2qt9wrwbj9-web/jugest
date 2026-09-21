const BRIDGE_ANCHOR=' getCollectorKey:()=>v510GetCollectorKey(),';
const BRIDGE_START='window.JUGEST_CORE_BRIDGE=window.JUGESTCoreV510.createBridge({';
const BACKFILL_BRIDGE=' getVpsBackfillDays:()=>JSON.parse(JSON.stringify(externalDays)),';
const JUDGED_STORE_DAY_BRIDGE=' getVpsJudgedStoreDay:(name,date)=>{let days=v510StoreDays(name),day=days.find(d=>d.date===date)||days[0]||null;if(day)ensureExternalJudgedSync([day],name);if(days.length)return v510StoreDay(name,date);return vpsMergedStoreDay(name,date)},';
const STORE_RESET_BRIDGE=' resetStoreAcquiredData:(name)=>vpsResetStoreAcquiredData(name),';
const COLLECTOR_CREDENTIALS_BRIDGE=' getCollectorConnectionInfo:(includeSecret=false)=>({channelId:String(relayReceiver?.channelId||""),receiverToken:includeSecret?String(relayReceiver?.receiverToken||""):""}),';
const MODULE_TAG='<script type="module" src="./vps-ui-enhancements.mjs"></script>';
const HISTORICAL_UI_MODULE_TAG='<script type="module" src="./vps-ui-historical-comparison.mjs"></script>';
const STORE_RESET_MODULE_TAG='<script type="module" src="./vps-store-reset.mjs"></script>';
const RESOURCE_UI_MODULE_TAG='<script type="module" src="./vps-resource-ui.mjs"></script>';
const AUDIT_STORE_UI_MODULE_TAG='<script type="module" src="./vps-ui-audit-store.mjs"></script>';
const COLLECTOR_CREDENTIALS_MODULE_TAG='<script type="module" src="./vps-ui-collector-credentials.mjs?v=collector-chatgpt-2"></script>';
const RELEASE_VERSION_MODULE_TAG='<script type="module" src="./vps-release-version.mjs?v=602-historical-audit-1"></script>';
const REMOTE_STORES_MODULE_TAG='<script type="module" src="./vps-ui-remote-stores.mjs"></script>';
const REMOTE_STORE_HELPER=`function vpsRemoteStoreCache(){return globalThis.JUGEST_VPS_REMOTE_STORES||null}
function vpsMergedStoreRows(){
 let local=v510KnownStoreRows().map(x=>({...x})),remote=vpsRemoteStoreCache()?.getStores?.()||[],rows=new Map(local.map(x=>[x.name,x]));
 for(const row of remote)if(row?.name&&!rows.has(row.name))rows.set(row.name,{...row});
 return [...rows.values()].sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"ja"))
}
function vpsMergedStoreDates(name,limit=120){let local=v510StoreDates(name,limit);return local.length?local:(vpsRemoteStoreCache()?.getDates?.(name,limit)||[])}
function vpsMergedStoreDay(name,date=""){let localDates=v510StoreDates(name,1);return localDates.length?v510StoreDay(name,date):(vpsRemoteStoreCache()?.getDay?.(name,date)||{shop:name,date:String(date||""),rows:[]})}
function vpsMergedStoreOverview(name){let local=v510KnownStoreRows().some(x=>x.name===name);return local?v510StoreOverview(name):(vpsRemoteStoreCache()?.getOverview?.(name)||v510StoreOverview(name))}
function vpsSetActiveStore(name,opts={}){
 if(v510SetActiveStore(name,opts))return true;
 name=String(name||"").trim();if(!name||!(vpsRemoteStoreCache()?.getStores?.()||[]).some(x=>x?.name===name))return false;
 v510ActiveStore=name;bruteShopFilter=name;trendShopFilter=name;jdataShopFilter=name;v4PlanShop=name;v4ReplayShop=name;modelPerfShopFilter=name;
 try{v4Context.isNew=false;v4Context.shopId="";v4Context.shopName=name;v4Context.layoutEdit=false}catch(_e){}
 queueAutoSave();if(!opts?.silent)v510NotifyUI();return true
}
try{globalThis.addEventListener?.("jugest:vps-remote-updated",()=>v510NotifyUI())}catch(_e){}`;

const STORE_RESET_HELPER=`async function vpsResetStoreAcquiredData(name){
 name=String(name||"").trim();if(!name)throw new Error("店舗名がありません");
 if(!storeAnalysisHistoryReady)await storeAnalysisLoadIndex();
 let oldDays=externalDays,oldForecasts=modelForecasts,oldHistory=storeAnalysisHistoryIndex;
 let nextDays=(externalDays||[]).filter(d=>d?.shop!==name),
     nextForecasts=(modelForecasts||[]).filter(f=>f?.shop!==name),
     resetIds=(storeAnalysisHistoryIndex||[]).filter(x=>x?.shop===name).map(x=>x.id),
     nextHistory=(storeAnalysisHistoryIndex||[]).filter(x=>x?.shop!==name),
     result={shop:name,deletedDays:(externalDays||[]).length-nextDays.length,deletedForecasts:(modelForecasts||[]).length-nextForecasts.length,deletedAnalysis:resetIds.length};
 externalDays=nextDays;modelForecasts=nextForecasts;storeAnalysisHistoryIndex=nextHistory;externalPreview=null;bruteResults=null;
 try{
  await externalDbSet(externalDays);
  await storeAnalysisSaveIndex();
  if(!autoSaveState())throw new Error("通常設定の保存に失敗したよ");
 }catch(e){
  externalDays=oldDays;modelForecasts=oldForecasts;storeAnalysisHistoryIndex=oldHistory;
  try{await externalDbSet(externalDays);await storeAnalysisSaveIndex();autoSaveState()}catch(_e){}
  throw e
 }
 for(const id of resetIds)try{await storeAnalysisDbDelete(STORE_ANALYSIS_PAYLOAD_PREFIX+id)}catch(e){console.warn("store reset snapshot cleanup",e)}
 if(resetIds.includes(storeAnalysisHistoryOpenId))storeAnalysisHistoryOpenId="";
 try{EXTERNAL_FLAT_CACHE=new WeakMap;externalJudgeEpoch++}catch(_e){}
 v510NotifyUI();return result
}`;

export function patchJugestIndexSource(input){
  let source=String(input??'');
  if(!source.includes('async function vpsResetStoreAcquiredData(name)')){
    if(!source.includes(BRIDGE_START))throw new Error('JUGEST bridge anchor (start) not found');
    source=source.replace(BRIDGE_START,`${STORE_RESET_HELPER}\n\n${BRIDGE_START}`);
  }
  if(!source.includes('function vpsMergedStoreRows()')){
    if(!source.includes(BRIDGE_START))throw new Error('JUGEST remote-store bridge anchor not found');
    source=source.replace(BRIDGE_START,`${REMOTE_STORE_HELPER}\n\n${BRIDGE_START}`);
  }
  const remoteBridgeReplacements=[
    [' getStores:()=>v510KnownStoreRows().map(x=>({...x})),',' getStores:()=>vpsMergedStoreRows(),'],
    [' getStoreOverview:(name)=>v510StoreOverview(name||v510GetActiveStore()),',' getStoreOverview:(name)=>vpsMergedStoreOverview(name||v510GetActiveStore()),'],
    [' getStoreDates:(name,limit)=>v510StoreDates(name||v510GetActiveStore(),limit),',' getStoreDates:(name,limit)=>vpsMergedStoreDates(name||v510GetActiveStore(),limit),'],
    [' getStoreDay:(name,date)=>v510StoreDay(name||v510GetActiveStore(),date||""),',' getStoreDay:(name,date)=>vpsMergedStoreDay(name||v510GetActiveStore(),date||""),'],
    [' setActiveStore:(name,opts)=>v510SetActiveStore(name,opts||{}),',' setActiveStore:(name,opts)=>vpsSetActiveStore(name,opts||{}),']
  ];
  for(const [from,to] of remoteBridgeReplacements){if(source.includes(to))continue;if(source.includes(from))source=source.replace(from,to)}
  if(!source.includes(BACKFILL_BRIDGE)||!source.includes(JUDGED_STORE_DAY_BRIDGE)||!source.includes(STORE_RESET_BRIDGE)||!source.includes(COLLECTOR_CREDENTIALS_BRIDGE)){
    if(!source.includes(BRIDGE_ANCHOR))throw new Error('JUGEST bridge anchor not found');
    const additions=[BACKFILL_BRIDGE,JUDGED_STORE_DAY_BRIDGE,STORE_RESET_BRIDGE,COLLECTOR_CREDENTIALS_BRIDGE].filter(token=>!source.includes(token)).join('\n');
    source=source.replace(BRIDGE_ANCHOR,`${BRIDGE_ANCHOR}\n${additions}`);
  }
  for(const tag of [MODULE_TAG,HISTORICAL_UI_MODULE_TAG,STORE_RESET_MODULE_TAG,RESOURCE_UI_MODULE_TAG,AUDIT_STORE_UI_MODULE_TAG,COLLECTOR_CREDENTIALS_MODULE_TAG,REMOTE_STORES_MODULE_TAG,RELEASE_VERSION_MODULE_TAG]){
    if(source.includes(tag))continue;
    if(!/<\/body>/i.test(source))throw new Error('JUGEST body anchor not found');
    source=source.replace(/<\/body>/i,`${tag}\n</body>`);
  }
  return source;
}

export const __test={BRIDGE_ANCHOR,BRIDGE_START,BACKFILL_BRIDGE,JUDGED_STORE_DAY_BRIDGE,STORE_RESET_BRIDGE,COLLECTOR_CREDENTIALS_BRIDGE,MODULE_TAG,HISTORICAL_UI_MODULE_TAG,STORE_RESET_MODULE_TAG,RESOURCE_UI_MODULE_TAG,AUDIT_STORE_UI_MODULE_TAG,COLLECTOR_CREDENTIALS_MODULE_TAG,REMOTE_STORES_MODULE_TAG,RELEASE_VERSION_MODULE_TAG,REMOTE_STORE_HELPER,STORE_RESET_HELPER};
