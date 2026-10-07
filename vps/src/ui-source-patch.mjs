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
const PIA_ACCESS_MODULE_TAG='<script type="module" src="./vps-ui-pia-access.mjs"></script>';
const PACHINKO_UI_MODULE_TAG='<script type="module" src="./vps-ui-pachinko.mjs"></script>';
const REMOTE_STORE_HELPER=`function vpsRemoteStoreCache(){return globalThis.JUGEST_VPS_REMOTE_STORES||null}
function vpsHasLocalStoreData(name){return v510StoreDates(name,1).length>0}
function vpsMergedStoreRows(){
 let local=v510KnownStoreRows().map(x=>({...x})),remote=vpsRemoteStoreCache()?.getStores?.()||[],rows=new Map(local.map(x=>[x.name,x]));
 for(const row of remote){if(!row?.name)continue;let current=rows.get(row.name);if(!current||!vpsHasLocalStoreData(row.name))rows.set(row.name,{...current,...row})}
 return [...rows.values()].sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"ja"))
}
function vpsMergedStoreDates(name,limit=120){let local=v510StoreDates(name,limit);return local.length?local:(vpsRemoteStoreCache()?.getDates?.(name,limit)||[])}
function vpsMergedStoreDay(name,date=""){let localDates=v510StoreDates(name,1);return localDates.length?v510StoreDay(name,date):(vpsRemoteStoreCache()?.getDay?.(name,date)||{shop:name,date:String(date||""),rows:[]})}
function vpsMergedStoreOverview(name){return vpsHasLocalStoreData(name)?v510StoreOverview(name):(vpsRemoteStoreCache()?.getOverview?.(name)||v510StoreOverview(name))}
function vpsSetActiveStore(name,opts={}){
 if(v510SetActiveStore(name,opts))return true;
 name=String(name||"").trim();if(!name||!(vpsRemoteStoreCache()?.getStores?.()||[]).some(x=>x?.name===name))return false;
 let sh=ensureShopInMaster(name,{save:false});
 v510ActiveStore=name;bruteShopFilter=name;trendShopFilter=name;jdataShopFilter=name;v4PlanShop=name;v4ReplayShop=name;modelPerfShopFilter=name;
 try{v4Context.isNew=false;v4Context.shopId=String(sh?.id||"");v4Context.shopName=name;v4Context.layoutEdit=false}catch(_e){}
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
  if(source.includes('function v510RecordBase(snap,entryType){')&&!source.includes('function v510ResolveRecordShop(cx)')){
    const start='function v510RecordBase(snap,entryType){',end='function v510HanaQ6(';
    const a=source.indexOf(start),b=source.indexOf(end,a);if(a<0||b<a)throw new Error('JUGEST record-base anchor not found');
    const fixed=`function v510ResolveRecordShop(cx){
 let sh=v4ShopById(cx?.shopId||"");if(sh)return sh;
 let name=shopMasterName(cx?.shopName||v510ActiveStore);if(!name)return null;
 return ensureShopInMaster(name,{save:true})
}
function v510RecordBase(snap,entryType){
 let cx=v4ResolvedContext(),sh=v510ResolveRecordShop(cx),shopId=sh?String(sh.id||""):"";
 if(sh){cx.shopId=shopId;cx.shopName=sh.name;cx.isNew=false}
 return{...snap,machineName:analysisMachineName(snap.machine),id:null,date:cx.date||localDateString(),tableNo:cx.tableNo||"",shopId,actualDiff:"",cashDiff:"",savedCoinDelta:"",financeVersion:2,loanCoinsPer1000:"",exchangeCoinsPer1000:"",savedInvestCoins:"",cashInvestYen:"",collectedCoins:"",exchangedYen:"",exchangeUsedCoinsOverride:"",memo:"",entryType,tagIds:[],v4Context:clone(cx)}
}
`;
    source=source.slice(0,a)+fixed+source.slice(b);
  }
  if(source.includes('function v510GetRecordOptions(){')&&!source.includes('for(const row of v510KnownStoreRows())ensureShopInMaster(row.name,{save:false})')){
    const start='function v510GetRecordOptions(){',end='function v510AddRecordTag(';
    const a=source.indexOf(start),b=source.indexOf(end,a);if(a<0||b<a)throw new Error('JUGEST record-options anchor not found');
    const fixed=`function v510GetRecordOptions(){
 let before=(shops||[]).length;for(const row of v510KnownStoreRows())ensureShopInMaster(row.name,{save:false});if((shops||[]).length!==before)queueAutoSave();
 return{shops:(shops||[]).map(s=>({id:String(s.id),name:s.name,loanCoinsPer1000:s.loanCoinsPer1000??null,exchangeCoinsPer1000:s.exchangeCoinsPer1000??null})),tags:knownTags().map(t=>({id:String(t.id),name:t.name,active:t.active!==false}))}
}
`;
    source=source.slice(0,a)+fixed+source.slice(b);
  }
  if(!source.includes(BACKFILL_BRIDGE)||!source.includes(JUDGED_STORE_DAY_BRIDGE)||!source.includes(STORE_RESET_BRIDGE)||!source.includes(COLLECTOR_CREDENTIALS_BRIDGE)){
    if(!source.includes(BRIDGE_ANCHOR))throw new Error('JUGEST bridge anchor not found');
    const additions=[BACKFILL_BRIDGE,JUDGED_STORE_DAY_BRIDGE,STORE_RESET_BRIDGE,COLLECTOR_CREDENTIALS_BRIDGE].filter(token=>!source.includes(token)).join('\n');
    source=source.replace(BRIDGE_ANCHOR,`${BRIDGE_ANCHOR}\n${additions}`);
  }
  for(const tag of [MODULE_TAG,HISTORICAL_UI_MODULE_TAG,STORE_RESET_MODULE_TAG,RESOURCE_UI_MODULE_TAG,AUDIT_STORE_UI_MODULE_TAG,COLLECTOR_CREDENTIALS_MODULE_TAG,REMOTE_STORES_MODULE_TAG,PIA_ACCESS_MODULE_TAG,PACHINKO_UI_MODULE_TAG,RELEASE_VERSION_MODULE_TAG]){
    if(source.includes(tag))continue;
    if(!/<\/body>/i.test(source))throw new Error('JUGEST body anchor not found');
    source=source.replace(/<\/body>/i,`${tag}\n</body>`);
  }
  return source;
}

export const __test={BRIDGE_ANCHOR,BRIDGE_START,BACKFILL_BRIDGE,JUDGED_STORE_DAY_BRIDGE,STORE_RESET_BRIDGE,COLLECTOR_CREDENTIALS_BRIDGE,MODULE_TAG,HISTORICAL_UI_MODULE_TAG,STORE_RESET_MODULE_TAG,RESOURCE_UI_MODULE_TAG,AUDIT_STORE_UI_MODULE_TAG,COLLECTOR_CREDENTIALS_MODULE_TAG,REMOTE_STORES_MODULE_TAG,PIA_ACCESS_MODULE_TAG,PACHINKO_UI_MODULE_TAG,RELEASE_VERSION_MODULE_TAG,REMOTE_STORE_HELPER,STORE_RESET_HELPER};
