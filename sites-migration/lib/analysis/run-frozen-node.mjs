import{openFrozenStoreHistory}from'./input-snapshot.mjs';import{runAnalysisAudit}from'./runtime-node.mjs';
// Node-only connection proof. The original importer requires a complete array;
// accumulating here does not claim a streaming or Worker-compatible analysis.
export async function runFrozenStoreModel({bucket,manifestKey,rootDir,targetDate}){
 const input=await openFrozenStoreHistory({bucket,manifestKey}),days=[];for await(const day of input.days)days.push(day);
 const result=await runAnalysisAudit({rootDir,shop:input.store.name,sourceStoreId:input.store.id,days,targetDate,compact:true,captureStages:false});
 return{...result,inputHash:input.inputHash};
}
