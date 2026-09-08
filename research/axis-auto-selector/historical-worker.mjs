import {parentPort,workerData} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';
import {bootJugestResearchRuntime} from './jugest-headless.mjs';
import {buildHistoricalSampleBundle} from './historical-builder.mjs';

if(!parentPort)throw new Error('historical-worker must run inside a worker thread');

(async()=>{
 const started=performance.now();
 try{
  const {store,days,startDate,endDate,minPriorDays,rootDir}=workerData||{};
  const runtime=await bootJugestResearchRuntime({rootDir});
  const bundle=buildHistoricalSampleBundle({store,days,runtime,startDate,endDate,minPriorDays});
  const memory=process.memoryUsage();
  parentPort.postMessage({
   ok:true,bundle,
   metrics:{elapsedMs:performance.now()-started,heapUsedMB:memory.heapUsed/1048576,heapTotalMB:memory.heapTotal/1048576}
  });
 }catch(error){
  parentPort.postMessage({ok:false,error:{name:error?.name||'Error',message:error?.message||String(error),stack:error?.stack||''}});
 }
})().catch(error=>parentPort.postMessage({ok:false,error:{name:error?.name||'Error',message:error?.message||String(error),stack:error?.stack||''}}));
