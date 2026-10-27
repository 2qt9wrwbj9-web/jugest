import{sha256Text}from'../storage/recovery.mjs';
const parse=(text,fallback)=>{try{return JSON.parse(text)}catch{return fallback}};
// All three reads execute in one D1 batch transaction. The raw payloads are
// captured before uploads start; later canonical writes cannot change them.
// Capture still buffers this batch: it is not a bounded-memory capture of
// arbitrarily large stores. Subsequent R2 consumption is day-by-day.
export async function freezeStoreHistory({db,bucket,storeId,limit=180}){
 const id=String(storeId??'').trim();if(!id)throw new TypeError('storeId is required');
 const n=Math.min(3660,Math.max(1,Math.trunc(Number(limit)||180)));
 const result=await db.batch([
  db.prepare('SELECT id,name,source_metadata_json,created_at,updated_at FROM stores WHERE id=?').bind(id),
  db.prepare("SELECT business_date,parser_version,source_hash,normalized_payload_hash,quality_status FROM store_days WHERE store_id=? AND quality_status='valid' ORDER BY business_date DESC LIMIT ?").bind(id,n),
  db.prepare("SELECT m.business_date,m.machine_key,m.payload_json FROM machine_day_data m JOIN (SELECT business_date FROM store_days WHERE store_id=? AND quality_status='valid' ORDER BY business_date DESC LIMIT ?) d ON m.business_date=d.business_date WHERE m.store_id=? ORDER BY m.business_date ASC,m.machine_key ASC").bind(id,n,id)
 ]);
 const row=result[0].results[0];if(!row)throw Object.assign(Error('store not found: '+id),{code:'store_not_found'});
 const store={id:row.id,name:row.name,sourceMetadata:parse(row.source_metadata_json,{}),createdAt:row.created_at,updatedAt:row.updated_at};
 const root='analysis-input/'+crypto.randomUUID(),days=[],machineRows=result[2].results;let offset=0;
 for(const day of result[1].results.reverse()){
  const machines=[];while(offset<machineRows.length&&machineRows[offset].business_date===day.business_date){const value=parse(machineRows[offset++].payload_json,null);if(value)machines.push(value)}
  const value={date:day.business_date,parserBuild:day.parser_version??'',sourceHash:day.source_hash??'',normalizedHash:day.normalized_payload_hash??'',qualityStatus:day.quality_status,machines};
  const text=JSON.stringify(value),hash=await sha256Text(text),objectKey=root+'/'+value.date+'.json';await bucket.put(objectKey,text,{onlyIf:{etagDoesNotMatch:'*'},customMetadata:{sha256:hash}});days.push({date:value.date,hash,objectKey});
 }
 const inputHash=await sha256Text(JSON.stringify({store,days:days.map(({date,hash})=>({date,hash}))}));
 const manifest={format:'jugest-fixed-input-v1',store,limit:n,days,inputHash};const manifestKey=root+'/manifest.json';
 await bucket.put(manifestKey,JSON.stringify(manifest),{onlyIf:{etagDoesNotMatch:'*'}});
 return{manifestKey,inputHash,days:days.length};
}
export async function openFrozenStoreHistory({bucket,manifestKey}){
 const object=await bucket.get(manifestKey);if(!object)throw Error('analysis_input_manifest_missing');const manifest=await object.json();
 if(manifest.format!=='jugest-fixed-input-v1'||!Array.isArray(manifest.days))throw Error('analysis_input_manifest_invalid');
 const hash=await sha256Text(JSON.stringify({store:manifest.store,days:manifest.days.map(({date,hash})=>({date,hash}))}));if(hash!==manifest.inputHash)throw Error('analysis_input_manifest_hash_mismatch');
 async function* days(){for(const day of manifest.days){const object=await bucket.get(day.objectKey);if(!object)throw Error('analysis_input_missing');const text=await object.text();if(await sha256Text(text)!==day.hash)throw Error('analysis_input_hash_mismatch');const value=JSON.parse(text);if(value.date!==day.date)throw Error('analysis_input_date_mismatch');yield value}}
 return{store:manifest.store,inputHash:hash,days:days()};
}
