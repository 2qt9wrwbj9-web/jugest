import {buildStoreFeatureRows} from '../../upstream/vps/src/research/feature-builder.mjs';
import {openFrozenStoreHistory} from './input-snapshot.mjs';
export const FEATURE_VERSION='store-features-v1';
// Same FEATURE_BUILD order: load the latest 180 valid days first, then exclude
// dates beyond the requested frontier. The original calculator is untouched.
export async function runFrozenFeatureBuild({bucket,manifestKey,targetDate,onStage=()=>{}}){
 const input=await openFrozenStoreHistory({bucket,manifestKey}),eligible=[];
 for await(const day of input.days)if(String(day.date)<=targetDate)eligible.push(day);
 const asOfDate=eligible.at(-1)?.date;if(!asOfDate)throw Object.assign(Error('no_canonical_days'),{code:'no_canonical_days'});
 onStage('features:begin');
 const rows=buildStoreFeatureRows({storeId:input.store.id,days:eligible,featureVersion:FEATURE_VERSION,asOfDate});
 onStage('features:complete');
 return{analysis:{storeId:input.store.id,featureVersion:FEATURE_VERSION,asOfDate,rows},inputHash:input.inputHash};
}
