// Generated from frozen JUGEST source. Regenerate with scripts/generate-store-read.mjs.
const ANALYSIS_VERSION='vps-runtime-v1';
function assistantReadRouteAllowed(parts,method){
  if(!['GET','HEAD'].includes(method)||!parts||parts[0]!=='api'||parts[1]!=='vps')return false;
  if(parts.length===3&&parts[2]==='stores')return true;
  if(parts[2]!=='stores'||parts.length<5)return false;
  if(parts.length===5&&['days','legacy-plan'].includes(parts[4]))return true;
  if(parts.length===6&&parts[4]==='days')return true;
  return parts.length===6&&parts[4]==='research'&&['store-read','comparison'].includes(parts[5]);
}
export function canReadPiaRoute(parts,method){
  if(!['GET','HEAD'].includes(method)||parts[0]!=='api'||parts[1]!=='vps')return false;
  if(parts.length===3&&parts[2]==='stores')return true;
  return parts[2]==='stores'&&((parts.length===5&&parts[4]==='days')||(parts.length===6&&parts[4]==='days'));
}
export function createStoreReadHandler({db,authenticateReceiver,authenticateAssistantRead,authenticatePia=()=>null,canAccessStoreMetadata,storeMetadata,sendJson}){
function safeJson(text,fallback=null){try{return JSON.parse(text)}catch{return fallback}}
async function authorizedStore(db,storeId,channelId,piaOnly=false){const row=await db.prepare('SELECT id,name,source_metadata_json,created_at,updated_at FROM stores WHERE id=?').get(storeId);if(!row)return {status:404,store:null};const metadata=storeMetadata(row.source_metadata_json);if(piaOnly?metadata.source!=='pia-public-ranking-top':!canAccessStoreMetadata(metadata,channelId))return {status:403,store:null};return {status:200,store:{id:row.id,name:row.name,createdAt:row.created_at,updatedAt:row.updated_at}}}
function parseApiPath(pathname){let decoded;try{decoded=decodeURIComponent(pathname)}catch{return null}if(decoded.includes('\0')||decoded.includes('\\'))return null;return decoded.split('/').filter(Boolean)}
  return async function analyticsHandler(req,res){
    const method=String(req.method||'GET').toUpperCase();
    const url=new URL(req.url||'/','http://127.0.0.1');const parts=parseApiPath(url.pathname);
    if(!parts||parts[0]!=='api'||parts[1]!=='vps'){sendJson(req,res,404,{ok:false,code:'not_found'});return}
    const assistantKeyRoute=false;
    const judgeRoute=false;
    if(judgeRoute){if(method!=='POST'){sendJson(req,res,405,{ok:false,code:'method_not_allowed'},{allow:'POST'});return}}
    else if(method!=='GET'&&method!=='HEAD'){sendJson(req,res,405,{ok:false,code:'method_not_allowed'},{allow:'GET, HEAD'});return}
    const auth=await authenticateReceiver(req)||await authenticateAssistantRead(req)||await authenticatePia(req);
    if(!auth){sendJson(req,res,401,{ok:false,code:'unauthorized'});return}
    const piaOnly=auth.kind==='admin'||auth.kind==='pia-viewer';
    if(piaOnly&&!canReadPiaRoute(parts,method)){sendJson(req,res,403,{ok:false,code:'pia_view_scope_denied'});return}
    if(auth.authType==='assistant-read'&&!assistantReadRouteAllowed(parts,method)){sendJson(req,res,403,{ok:false,code:'assistant_read_scope_denied'});return}

    try{

      if(parts.length===3&&parts[2]==='stores'){
        const rows=await db.prepare('SELECT id,name,source_metadata_json,created_at,updated_at FROM stores ORDER BY name,id').all();
        const stores=(await Promise.all(rows.map(async row=>{const metadata=storeMetadata(row.source_metadata_json);if(piaOnly?metadata.source!=='pia-public-ranking-top':!canAccessStoreMetadata(metadata,auth.channelId))return [];const latest=await db.prepare("SELECT MAX(business_date) AS latest,COUNT(*) AS days FROM store_days WHERE store_id=? AND quality_status='valid'").get(row.id);return [{id:row.id,name:row.name,latestDate:latest?.latest??null,dayCount:Number(latest?.days)||0,updatedAt:row.updated_at,source:String(metadata.source||''),visibility:metadata.visibility==='public'?'public':'private'}]}))).flat();
        sendJson(req,res,200,{ok:true,stores});return;
      }
      if(parts[2]!=='stores'||parts.length<4){sendJson(req,res,404,{ok:false,code:'not_found'});return}
      const storeId=parts[3],access=await authorizedStore(db,storeId,auth.channelId,piaOnly);if(!access.store){sendJson(req,res,access.status,{ok:false,code:access.status===403?'forbidden':'store_not_found'});return}
      if(parts.length===5&&parts[4]==='days'){
        const limit=Math.min(366,Math.max(1,Math.trunc(Number(url.searchParams.get('limit'))||60)));
        const rows=await db.prepare(`SELECT d.business_date,d.parser_version,d.quality_status,COUNT(m.machine_key) AS machine_count FROM store_days d LEFT JOIN machine_day_data m ON m.store_id=d.store_id AND m.business_date=d.business_date WHERE d.store_id=? AND d.quality_status='valid' GROUP BY d.store_id,d.business_date ORDER BY d.business_date DESC LIMIT ?`).all(storeId,limit);
        rows.reverse();
        sendJson(req,res,200,{ok:true,store:access.store,days:rows.map(row=>({date:row.business_date,parserVersion:row.parser_version||'',qualityStatus:row.quality_status,machineCount:Number(row.machine_count)||0}))});return;
      }
      if(parts.length===6&&parts[4]==='days'){
        const date=parts[5];if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){sendJson(req,res,400,{ok:false,code:'bad_date'});return}
        const day=await db.prepare("SELECT business_date,parser_version,quality_status FROM store_days WHERE store_id=? AND business_date=? AND quality_status='valid'").get(storeId,date);if(!day){sendJson(req,res,404,{ok:false,code:'day_not_found'});return}
        const machineRows=await db.prepare('SELECT payload_json FROM machine_day_data WHERE store_id=? AND business_date=? ORDER BY machine_key').all(storeId,date);const machines=machineRows.map(row=>safeJson(row.payload_json,null)).filter(Boolean);sendJson(req,res,200,{ok:true,store:access.store,day:{date:day.business_date,parserVersion:day.parser_version||'',qualityStatus:day.quality_status,machines}});return;
      }
      if(parts.length===6&&parts[4]==='analysis'&&parts[5]==='default'){
        const row=await db.prepare(`SELECT business_date,payload_json,payload_hash,updated_at FROM client_snapshots WHERE store_id=? AND snapshot_type='store-analysis-default' AND version=?`).get(storeId,ANALYSIS_VERSION);sendJson(req,res,200,{ok:true,store:access.store,analysis:row?safeJson(row.payload_json,null):null,businessDate:row?.business_date??null,payloadHash:row?.payload_hash??null,updatedAt:row?.updated_at??null});return;
      }
      if(parts.length===6&&parts[4]==='analysis'&&parts[5]==='history'){
        const rows=await db.prepare(`SELECT target_date,component,version,input_hash,output_hash,created_at FROM analysis_receipts WHERE store_id=? ORDER BY id DESC LIMIT 100`).all(storeId);sendJson(req,res,200,{ok:true,store:access.store,history:rows.map(row=>({targetDate:row.target_date,component:row.component,version:row.version,inputHash:row.input_hash,outputHash:row.output_hash,createdAt:row.created_at}))});return;
      }
      if(parts.length===5&&parts[4]==='status'){
        const row=await db.prepare(`SELECT business_date,payload_json,payload_hash,updated_at FROM client_snapshots WHERE store_id=? AND snapshot_type='store-latest-status' AND version=?`).get(storeId,ANALYSIS_VERSION);
        const refresh=await db.prepare(`SELECT generation,completed_generation,active_job_id,updated_at FROM analysis_refresh_state WHERE store_id=? AND analysis_version=?`).get(storeId,ANALYSIS_VERSION);
        const status=row?safeJson(row.payload_json,null):{status:refresh&&refresh.generation>refresh.completed_generation?'pending':'unavailable',generation:refresh?.generation??0,completedGeneration:refresh?.completed_generation??0};sendJson(req,res,200,{ok:true,store:access.store,status,businessDate:row?.business_date??null,payloadHash:row?.payload_hash??null,updatedAt:row?.updated_at??refresh?.updated_at??null});return;
      }
      sendJson(req,res,503,{ok:false,code:'sites_port_not_implemented'});
    }finally{}
  };
}
