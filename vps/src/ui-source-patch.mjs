const BRIDGE_ANCHOR=' getCollectorKey:()=>v510GetCollectorKey(),';
const BRIDGE_START='window.JUGEST_CORE_BRIDGE=window.JUGESTCoreV510.createBridge({';
const BACKFILL_BRIDGE=' getVpsBackfillDays:()=>JSON.parse(JSON.stringify(externalDays)),';
const STORE_RESET_BRIDGE=' resetStoreAcquiredData:(name)=>vpsResetStoreAcquiredData(name),';
const MODULE_TAG='<script type="module" src="./vps-ui-enhancements.mjs"></script>';
const STORE_RESET_MODULE_TAG='<script type="module" src="./vps-store-reset.mjs"></script>';
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
  if(!source.includes(BACKFILL_BRIDGE)||!source.includes(STORE_RESET_BRIDGE)){
    if(!source.includes(BRIDGE_ANCHOR))throw new Error('JUGEST bridge anchor not found');
    const additions=[BACKFILL_BRIDGE,STORE_RESET_BRIDGE].filter(token=>!source.includes(token)).join('\n');
    source=source.replace(BRIDGE_ANCHOR,`${BRIDGE_ANCHOR}\n${additions}`);
  }
  if(!source.includes(MODULE_TAG)){
    if(!/<\/body>/i.test(source))throw new Error('JUGEST body anchor not found');
    source=source.replace(/<\/body>/i,`${MODULE_TAG}\n</body>`);
  }
  if(!source.includes(STORE_RESET_MODULE_TAG)){
    if(!/<\/body>/i.test(source))throw new Error('JUGEST body anchor not found');
    source=source.replace(/<\/body>/i,`${STORE_RESET_MODULE_TAG}\n</body>`);
  }
  return source;
}

export const __test={BRIDGE_ANCHOR,BRIDGE_START,BACKFILL_BRIDGE,STORE_RESET_BRIDGE,MODULE_TAG,STORE_RESET_MODULE_TAG,STORE_RESET_HELPER};
