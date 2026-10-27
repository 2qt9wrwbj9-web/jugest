import{openFrozenStoreHistory}from'./input-snapshot.mjs';import{runCompiledStoreModel}from'./compiled-worker.mjs';
// Worker-native connection proof. Input is immutable R2 days. The unchanged
// importer still needs an array, so whole-analysis streaming remains unported.
export async function runFrozenWorkerModel({bucket,manifestKey,targetDate}){
 const input=await openFrozenStoreHistory({bucket,manifestKey}),days=[];for await(const day of input.days)days.push(day);
 const model=await runCompiledStoreModel({shop:input.store.name,sourceStoreId:input.store.id,days,targetDate});
 return{model,inputHash:input.inputHash};
}
