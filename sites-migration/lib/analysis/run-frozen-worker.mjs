import{openFrozenStoreHistory}from'./input-snapshot.mjs';
import{runCompiledStoreModelStream,runCompiledStoreAnalysisStream}from'./compiled-worker.mjs';
export async function runFrozenWorkerModel({bucket,manifestKey,targetDate,onStage}){
 const input=await openFrozenStoreHistory({bucket,manifestKey,rawJson:true});
 const model=await runCompiledStoreModelStream({shop:input.store.name,sourceStoreId:input.store.id,days:input.days,rawJsonDays:true,targetDate,onStage});
 return{model,inputHash:input.inputHash};
}
export async function runFrozenWorkerAnalysis({bucket,manifestKey,onStage}){
 const input=await openFrozenStoreHistory({bucket,manifestKey,rawJson:true});
 const analysis=await runCompiledStoreAnalysisStream({shop:input.store.name,sourceStoreId:input.store.id,days:input.days,rawJsonDays:true,onStage});
 return{analysis,inputHash:input.inputHash};
}
