import{sha256Text}from'../storage/recovery.mjs';
const parse=(text,fallback)=>{try{return JSON.parse(text)}catch{return fallback}};
// Canonical rows are copied inside one D1 transaction. The JS boundary only
// receives metadata and a single day's payload at a time. Captures are immutable
// and deliberately retained: no unsafe automatic collection is enabled.
export async function freezeStoreHistory({db,bucket,storeId,limit=180,throughDate='9999-12-31',captureId=crypto.randomUUID(),onStage=()=>{}}){
 const id=String(storeId??'').trim();if(!id)throw new TypeError('storeId is required');
 const n=Math.min(3660,Math.max(1,Math.trunc(Number(limit)||180))),cid=String(captureId);
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(cid))throw new TypeError('invalid captureId');
 onStage('capture:begin');
 await db.batch([
  db.prepare("INSERT OR IGNORE INTO sites_analysis_captures(id,store_id,store_json,created_at) SELECT ?,id,json_object('id',id,'name',name,'source_metadata_json',source_metadata_json,'created_at',created_at,'updated_at',updated_at),? FROM stores WHERE id=?").bind(cid,new Date().toISOString(),id),
  db.prepare(`INSERT OR IGNORE INTO sites_analysis_capture_days(capture_id,business_date,day_json)
   SELECT ?,d.business_date,json_object('date',d.business_date,'parserBuild',COALESCE(d.parser_version,''),'sourceHash',COALESCE(d.source_hash,''),'normalizedHash',COALESCE(d.normalized_payload_hash,''),'qualityStatus',d.quality_status,'machines',json(COALESCE((SELECT json_group_array(json(payload_json)) FROM (SELECT payload_json FROM machine_day_data WHERE store_id=d.store_id AND business_date=d.business_date AND json_valid(payload_json) AND payload_json NOT IN ('null','false','0','""') ORDER BY machine_key)), '[]')))
   FROM (SELECT * FROM store_days WHERE store_id=? AND quality_status='valid' AND business_date<=? ORDER BY business_date DESC LIMIT ?) d
   WHERE EXISTS(SELECT 1 FROM sites_analysis_captures WHERE id=? AND store_id=? AND complete=0)`).bind(cid,id,throughDate,n,cid,id),
  db.prepare('UPDATE sites_analysis_captures SET complete=1 WHERE id=? AND store_id=? AND complete=0').bind(cid,id)
 ]);
 const capture=await db.prepare('SELECT store_id,store_json,complete FROM sites_analysis_captures WHERE id=?').bind(cid).first();
 if(!capture)throw Object.assign(Error('store not found: '+id),{code:'store_not_found'});
 if(capture.store_id!==id||capture.complete!==1)throw Error('analysis_capture_invalid');
 const row=JSON.parse(capture.store_json),store={id:row.id,name:row.name,sourceMetadata:parse(row.source_metadata_json,{}),createdAt:row.created_at,updatedAt:row.updated_at};
 const root='analysis-input/'+cid,days=[];let after='';
 onStage('capture:fixed');
 while(true){
  const row=await db.prepare('SELECT business_date,day_json FROM sites_analysis_capture_days WHERE capture_id=? AND business_date>? ORDER BY business_date LIMIT 1').bind(cid,after).first();if(!row)break;
  const text=row.day_json,hash=await sha256Text(text),objectKey=root+'/'+row.business_date+'.json';
  const put=await bucket.put(objectKey,text,{onlyIf:{etagDoesNotMatch:'*'},customMetadata:{sha256:hash}});
  if(!put){const existing=await bucket.get(objectKey);if(!existing||await sha256Text(await existing.text())!==hash)throw Error('analysis_capture_object_conflict')}
  days.push({date:row.business_date,hash,objectKey});after=row.business_date;onStage('capture:day');
 }
 const inputHash=await sha256Text(JSON.stringify({store,days:days.map(({date,hash})=>({date,hash}))}));
 const manifest={format:'jugest-fixed-input-v1',store,limit:n,days,inputHash},manifestKey=root+'/manifest.json',text=JSON.stringify(manifest);
 const put=await bucket.put(manifestKey,text,{onlyIf:{etagDoesNotMatch:'*'}});
 if(!put){const old=await bucket.get(manifestKey);if(!old||await old.text()!==text)throw Error('analysis_capture_manifest_conflict')}
 onStage('capture:complete');return{manifestKey,inputHash,days:days.length};
}
export async function openFrozenStoreHistory({bucket,manifestKey}){
 const object=await bucket.get(manifestKey);if(!object)throw Error('analysis_input_manifest_missing');const manifest=await object.json();
 if(manifest.format!=='jugest-fixed-input-v1'||!Array.isArray(manifest.days))throw Error('analysis_input_manifest_invalid');
 const hash=await sha256Text(JSON.stringify({store:manifest.store,days:manifest.days.map(({date,hash})=>({date,hash}))}));if(hash!==manifest.inputHash)throw Error('analysis_input_manifest_hash_mismatch');
 async function* days(){for(const day of manifest.days){const object=await bucket.get(day.objectKey);if(!object)throw Error('analysis_input_missing');const text=await object.text();if(await sha256Text(text)!==day.hash)throw Error('analysis_input_hash_mismatch');const value=JSON.parse(text);if(value.date!==day.date)throw Error('analysis_input_date_mismatch');yield value}}
 return{store:manifest.store,inputHash:hash,from:manifest.days[0]?.date,to:manifest.days.at(-1)?.date,days:days()};
}
