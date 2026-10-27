import {AsyncLocalStorage} from 'node:async_hooks';
const context=new AsyncLocalStorage();
export const withAnalysisBackground=(waitUntil,callback)=>context.run(waitUntil,callback);
export function scheduleDevelopmentAnalysis(task){const waitUntil=context.getStore();if(!waitUntil)return false;waitUntil(task());return true}
