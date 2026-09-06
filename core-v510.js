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
})(typeof window!=="undefined"?window:globalThis);
