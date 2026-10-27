import {createHash} from 'node:crypto';
import {canonicalBytes} from './canonical-stream.mjs';
// Exact inputDescriptor of the original daily-analysis.mjs, without holding
// the complete raw day array. The immutable snapshot hash is a separate ID.
export async function originalDailyInputHash({storeId,days}){
 const hash=createHash('sha256');hash.update('{"analysisVersion":"vps-runtime-v1","days":[');let first=true;
 for await(const day of days){if(!first)hash.update(',');first=false;for(const bytes of canonicalBytes(day))hash.update(bytes)}
 hash.update('],"options":{"maxDims":"1","minDays":"4","minG":"2000","period":"180"},"storeId":');hash.update(JSON.stringify(storeId));hash.update('}');return hash.digest('hex');
}
