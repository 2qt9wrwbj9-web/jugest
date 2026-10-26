import {readDatabase} from './store-read-api.mjs';

// Original loadStoreDays SQL, field mapping, valid filter, limit and order.
// Retains the requested date descriptors, but fetches machine payloads one day
// at a time. Consumers must not accumulate yielded days to gain memory savings.
// This is not a transaction snapshot, as in the original multi-query loader.
export async function openStoreHistory(binding,storeId,{limit=180}={}){
 if(!binding?.prepare)throw new TypeError('db is required');
 const id=String(storeId??'').trim();if(!id)throw new TypeError('storeId is required');
 const n=Math.min(3660,Math.max(1,Math.trunc(Number(limit)||180))),db=readDatabase(binding);
 const storeRow=await db.prepare('SELECT id,name,source_metadata_json,created_at,updated_at FROM stores WHERE id=?').get(id);
 if(!storeRow)throw Object.assign(new Error(`store not found: ${id}`),{code:'store_not_found'});
 const safeJson=(text,fallback)=>{try{return JSON.parse(text)}catch{return fallback}};
 const dayRows=(await db.prepare(`SELECT business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at
    FROM store_days WHERE store_id=? AND quality_status='valid' ORDER BY business_date DESC LIMIT ?`).all(id,n)).reverse();
 const machineStmt=db.prepare(`SELECT machine_key,payload_json FROM machine_day_data
    WHERE store_id=? AND business_date=? ORDER BY machine_key ASC`);
 async function* days(){for(const row of dayRows){const machines=await machineStmt.all(id,row.business_date);yield {
  date:row.business_date,parserBuild:row.parser_version??'',sourceHash:row.source_hash??'',normalizedHash:row.normalized_payload_hash??'',qualityStatus:row.quality_status,machines:machines.map(m=>safeJson(m.payload_json,null)).filter(Boolean)
 }}}
 return {store:{id:storeRow.id,name:storeRow.name,sourceMetadata:safeJson(storeRow.source_metadata_json,{}),createdAt:storeRow.created_at,updatedAt:storeRow.updated_at},days:days()};
}
