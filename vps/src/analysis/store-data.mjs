function requireDb(db){if(!db?.prepare)throw new TypeError('db is required')}
function requireStoreId(value){const text=String(value??'').trim();if(!text)throw new TypeError('storeId is required');return text}
function safeJson(text,fallback={}){try{return JSON.parse(text)}catch{return fallback}}

export function loadStoreDays(db,storeId,{limit=180}={}){
  requireDb(db);
  const id=requireStoreId(storeId);
  const n=Math.min(3660,Math.max(1,Math.trunc(Number(limit)||180)));
  const storeRow=db.prepare('SELECT id,name,source_metadata_json,created_at,updated_at FROM stores WHERE id=?').get(id);
  if(!storeRow)throw Object.assign(new Error(`store not found: ${id}`),{code:'store_not_found'});
  const dayRows=db.prepare(`SELECT business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at
    FROM store_days WHERE store_id=? AND quality_status='valid' ORDER BY business_date DESC LIMIT ?`).all(id,n).reverse();
  const machineStmt=db.prepare(`SELECT machine_key,payload_json FROM machine_day_data
    WHERE store_id=? AND business_date=? ORDER BY machine_key ASC`);
  const days=dayRows.map(row=>({
    date:row.business_date,
    parserBuild:row.parser_version??'',
    sourceHash:row.source_hash??'',
    normalizedHash:row.normalized_payload_hash??'',
    qualityStatus:row.quality_status,
    machines:machineStmt.all(id,row.business_date).map(machine=>safeJson(machine.payload_json,null)).filter(Boolean)
  }));
  return {
    store:{
      id:storeRow.id,
      name:storeRow.name,
      sourceMetadata:safeJson(storeRow.source_metadata_json,{}),
      createdAt:storeRow.created_at,
      updatedAt:storeRow.updated_at
    },
    days
  };
}
