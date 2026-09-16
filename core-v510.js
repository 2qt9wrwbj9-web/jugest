(function(global){
"use strict";
const VERSION="5.1.0";
function createBridge(methods){
  if(!methods||typeof methods!=="object")throw new TypeError("JUGEST core methods are required");
  const required=["getSummary","getStores","getActiveStore","setActiveStore","getJudgeState","setJudgeG","getReverseState","getStoreOverview","getRecordsSummary","getDataStatus"];
  for(const key of required)if(typeof methods[key]!=="function")throw new TypeError(`Missing core method: ${key}`);
  return Object.freeze({...methods});
}
global.JUGESTCoreV510=Object.freeze({VERSION,createBridge});
if(global.location?.protocol!=="data:"&&global.document?.head&&!global.document.head.querySelector?.('[data-vps-audit-store-loader]')){
  const script=global.document.createElement('script');script.type='module';script.src='./vps-ui-audit-store.mjs';script.dataset.vpsAuditStoreLoader='';global.document.head.append(script);
}
})(typeof window!=="undefined"?window:globalThis);
