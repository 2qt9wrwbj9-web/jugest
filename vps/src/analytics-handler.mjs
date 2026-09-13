import {createHash,timingSafeEqual} from 'node:crypto';
import {openDatabase} from './db.mjs';
import {migrate} from './schema.mjs';
import {createRelayStore} from './relay-store.mjs';
import {buildResourceStatus} from './resource-telemetry.mjs';

const ANALYSIS_VERSION='vps-runtime-v1';
const STORE_READ_VERSION='store-read-v1';
const RELAY_STORE_NAME='juggler-relay-v1';
function digest(value){return createHash('sha256').update(String(value||'')).digest('hex')}
function secureMatch(raw,expectedHash){if(!raw||!/^[a-f0-9]{64}$/i.test(String(expectedHash||'')))return false;const a=Buffer.from(digest(raw),'hex'),b=Buffer.from(String(expectedHash),'hex');return a.length===b.length&&timingSafeEqual(a,b)}
function headerValue(req,name){const value=req.headers?.[name.toLowerCase()];return Array.isArray(value)?String(value[0]||''):String(value||'')}
function sendJson(req,res,status,payload,extra={}){const body=Buffer.from(JSON.stringify(payload));res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':String(body.length),'cache-control':'no-store','x-content-type-options':'nosniff',...extra});if(String(req.method||'GET').toUpperCase()==='HEAD')res.end();else res.end(body)}
function safeJson(text,fallback=null){try{return JSON.parse(text)}catch{return fallback}}
function validChannelId(value){return /^[A-Za-z0-9_-]{12,80}$/.test(String(value||''))}
async function authenticate(req,relayDbPath){const channelId=headerValue(req,'x-jugest-channel-id').trim();const authorization=headerValue(req,'authorization').trim();const match=authorization.match(/^Bearer\s+(.+)$/i);const receiverToken=match?.[1]?.trim()||'';if(!validChannelId(channelId)||!receiverToken)return null;const store=createRelayStore(RELAY_STORE_NAME,{dbPath:relayDbPath,root:'jugest'});const channel=await store.get(`channel/${channelId}`,{type:'json'});if(!channel||channel.revokedAt||!secureMatch(receiverToken,channel.receiverHash))return null;return {channelId}}
function authorizedStore(db,storeId,channelId){const row=db.prepare('SELECT id,name,source_metadata_json,created_at,updated_at FROM stores WHERE id=?').get(storeId);if(!row)return {status:404,store:null};const metadata=safeJson(row.source_metadata_json,{})||{};if(String(metadata.collectorChannelId||'')!==channelId)return {status:403,store:null};return {status:200,store:{id:row.id,name:row.name,createdAt:row.created_at,updatedAt:row.updated_at}}}
function parseApiPath(pathname){let decoded;try{decoded=decodeURIComponent(pathname)}catch{return null}if(decoded.includes('\0')||decoded.includes('\\'))return null;return decoded.split('/').filter(Boolean)}

export function createAnalyticsHandler({relayDbPath,canonicalDbPath,resourceStatusBuilder=buildResourceStatus}={}){
  if(typeof relayDbPath!=='string'||!relayDbPath.trim())throw new TypeError('relayDbPath is required');
  if(typeof canonicalDbPath!=='string'||!canonicalDbPath.trim())throw new TypeError('canonicalDbPath is required');
  if(typeof resourceStatusBuilder!=='function')throw new TypeError('resourceStatusBuilder must be a function');
  return async function analyticsHandler(req,res){
    const method=String(req.method||'GET').toUpperCase();
    if(method!=='GET'&&method!=='HEAD'){sendJson(req,res,405,{ok:false,code:'method_not_allowed'},{allow:'GET, HEAD'});return}
    const auth=await authenticate(req,relayDbPath);if(!auth){sendJson(req,res,401,{ok:false,code:'unauthorized'});return}
    const url=new URL(req.url||'/','http://127.0.0.1');const parts=parseApiPath(url.pathname);
    if(!parts||parts[0]!=='api'||parts[1]!=='vps'){sendJson(req,res,404,{ok:false,code:'not_found'});return}
    const db=openDatabase(canonicalDbPath);
    try{
      migrate(db);
      if(parts.length===4&&parts[2]==='system'&&parts[3]==='resources'){
        try{sendJson(req,res,200,{ok:true,resources:await resourceStatusBuilder(db)});}catch(error){sendJson(req,res,503,{ok:false,code:'resource_telemetry_unavailable',message:String(error?.message??error)});}return;
      }
      if(parts.length===3&&parts[2]==='stores'){
        const rows=db.prepare('SELECT id,name,source_metadata_json,created_at,updated_at FROM stores ORDER BY name,id').all();
        const stores=rows.flatMap(row=>{const metadata=safeJson(row.source_metadata_json,{})||{};if(String(metadata.collectorChannelId||'')!==auth.channelId)return [];const latest=db.prepare("SELECT MAX(business_date) AS latest,COUNT(*) AS days FROM store_days WHERE store_id=? AND quality_status='valid'").get(row.id);return [{id:row.id,name:row.name,latestDate:latest?.latest??null,dayCount:Number(latest?.days)||0,updatedAt:row.updated_at}]});
        sendJson(req,res,200,{ok:true,stores});return;
      }
      if(parts[2]!=='stores'||parts.length<4){sendJson(req,res,404,{ok:false,code:'not_found'});return}
      const storeId=parts[3],access=authorizedStore(db,storeId,auth.channelId);if(!access.store){sendJson(req,res,access.status,{ok:false,code:access.status===403?'forbidden':'store_not_found'});return}
      if(parts.length===5&&parts[4]==='days'){
        const limit=Math.min(366,Math.max(1,Math.trunc(Number(url.searchParams.get('limit'))||60)));
        const rows=db.prepare(`SELECT d.business_date,d.parser_version,d.quality_status,COUNT(m.machine_key) AS machine_count FROM store_days d LEFT JOIN machine_day_data m ON m.store_id=d.store_id AND m.business_date=d.business_date WHERE d.store_id=? AND d.quality_status='valid' GROUP BY d.store_id,d.business_date ORDER BY d.business_date DESC LIMIT ?`).all(storeId,limit).reverse();
        sendJson(req,res,200,{ok:true,store:access.store,days:rows.map(row=>({date:row.business_date,parserVersion:row.parser_version||'',qualityStatus:row.quality_status,machineCount:Number(row.machine_count)||0}))});return;
      }
      if(parts.length===6&&parts[4]==='days'){
        const date=parts[5];if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){sendJson(req,res,400,{ok:false,code:'bad_date'});return}
        const day=db.prepare("SELECT business_date,parser_version,quality_status FROM store_days WHERE store_id=? AND business_date=? AND quality_status='valid'").get(storeId,date);if(!day){sendJson(req,res,404,{ok:false,code:'day_not_found'});return}
        const machines=db.prepare('SELECT payload_json FROM machine_day_data WHERE store_id=? AND business_date=? ORDER BY machine_key').all(storeId,date).map(row=>safeJson(row.payload_json,null)).filter(Boolean);sendJson(req,res,200,{ok:true,store:access.store,day:{date:day.business_date,parserVersion:day.parser_version||'',qualityStatus:day.quality_status,machines}});return;
      }
      if(parts.length===6&&parts[4]==='analysis'&&parts[5]==='default'){
        const row=db.prepare(`SELECT business_date,payload_json,payload_hash,updated_at FROM client_snapshots WHERE store_id=? AND snapshot_type='store-analysis-default' AND version=?`).get(storeId,ANALYSIS_VERSION);sendJson(req,res,200,{ok:true,store:access.store,analysis:row?safeJson(row.payload_json,null):null,businessDate:row?.business_date??null,payloadHash:row?.payload_hash??null,updatedAt:row?.updated_at??null});return;
      }
      if(parts.length===6&&parts[4]==='analysis'&&parts[5]==='history'){
        const rows=db.prepare(`SELECT target_date,component,version,input_hash,output_hash,created_at FROM analysis_receipts WHERE store_id=? ORDER BY id DESC LIMIT 100`).all(storeId);sendJson(req,res,200,{ok:true,store:access.store,history:rows.map(row=>({targetDate:row.target_date,component:row.component,version:row.version,inputHash:row.input_hash,outputHash:row.output_hash,createdAt:row.created_at}))});return;
      }
      if(parts.length===6&&parts[4]==='research'&&parts[5]==='store-read'){
        const row=db.prepare(`SELECT business_date,payload_json,payload_hash,updated_at FROM client_snapshots WHERE store_id=? AND snapshot_type='store-read-active' AND version=?`).get(storeId,STORE_READ_VERSION);
        sendJson(req,res,200,{ok:true,store:access.store,storeRead:row?safeJson(row.payload_json,null):null,businessDate:row?.business_date??null,payloadHash:row?.payload_hash??null,updatedAt:row?.updated_at??null});return;
      }
      if(parts.length===5&&parts[4]==='status'){
        const row=db.prepare(`SELECT business_date,payload_json,payload_hash,updated_at FROM client_snapshots WHERE store_id=? AND snapshot_type='store-latest-status' AND version=?`).get(storeId,ANALYSIS_VERSION);
        const refresh=db.prepare(`SELECT generation,completed_generation,active_job_id,updated_at FROM analysis_refresh_state WHERE store_id=? AND analysis_version=?`).get(storeId,ANALYSIS_VERSION);
        const status=row?safeJson(row.payload_json,null):{status:refresh&&refresh.generation>refresh.completed_generation?'pending':'unavailable',generation:refresh?.generation??0,completedGeneration:refresh?.completed_generation??0};sendJson(req,res,200,{ok:true,store:access.store,status,businessDate:row?.business_date??null,payloadHash:row?.payload_hash??null,updatedAt:row?.updated_at??refresh?.updated_at??null});return;
      }
      sendJson(req,res,404,{ok:false,code:'not_found'});
    }finally{db.close()}
  };
}
export const __test={ANALYSIS_VERSION,STORE_READ_VERSION,secureMatch};
