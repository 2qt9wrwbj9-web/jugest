import{openFrozenStoreHistory}from'./input-snapshot.mjs';
import{runCompiledStoreModelStream,runCompiledStoreAnalysisStream,runCompiledStoreModelResumeStream}from'./compiled-worker.mjs';
export async function runFrozenWorkerModel({bucket,manifestKey,targetDate,prefixState=null,machineRows=null,onStage}){
 const input=await openFrozenStoreHistory({bucket,manifestKey,rawJson:true});
 const model=await (prefixState?runCompiledStoreModelResumeStream:runCompiledStoreModelStream)({prefixState,machineRows,shop:input.store.name,sourceStoreId:input.store.id,days:input.days,rawJsonDays:true,targetDate,onStage});
 return{model,inputHash:input.inputHash};
}
export async function runFrozenWorkerAnalysis({bucket,manifestKey,onStage}){
 const input=await openFrozenStoreHistory({bucket,manifestKey,rawJson:true});
 const analysis=await runCompiledStoreAnalysisStream({shop:input.store.name,sourceStoreId:input.store.id,days:input.days,rawJsonDays:true,onStage});
 return{analysis,inputHash:input.inputHash};
}
