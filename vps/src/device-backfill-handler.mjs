import {createHash,timingSafeEqual} from 'node:crypto';
import {openDatabase} from './db.mjs';
import {migrate} from './schema.mjs';
import {createRelayStore} from './relay-store.mjs';
import {ingestDeviceBackfillDay} from './ingest/device-backfill.mjs';

const RELAY_STORE_NAME='juggler-relay-v1';
const MAX_DAYS=30;
const MAX_BODY_BYTES=6*1024*1024;

function digest(value){return createHash('sha256').update(String(value||'')).digest('hex')}
function secureMatch(raw,expectedHash){
  if(!raw||!/^[a-f0-9]{64}$/i.test(String(expectedHash||'')))return false;
  const a=Buffer.from(digest(raw),'hex'),b=Buffer.from(String(expectedHash),'hex');
  return a.length===b.length&&timingSafeEqual(a,b);
}
function headerValue(req,name){
  const value=req.headers?.[name.toLowerCase()];
  return Array.isArray(value)?String(value[0]||''):String(value||'');
}
function validChannelId(value){return /^[A-Za-z0-9_-]{12,80}$/.test(String(value||''))}
function sendJson(req,res,status,payload,extra={}){
  const body=Buffer.from(JSON.stringify(payload));
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':String(body.length),'cache-control':'no-store','x-content-type-options':'nosniff',...extra});
  res.end(body);
}
function canonicalShop(value){
  return String(value||'').trim().replace(/\s*(?:データ\s*)?まとめ\s*$/u,'').replace(/\s+/g,' ').trim().toLocaleLowerCase('ja-JP');
}
async function readJsonBody(req){
  const chunks=[];let size=0;
  for await(const chunk of req){
    const buf=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=buf.length;
    if(size>MAX_BODY_BYTES){const error=new Error('payload_too_large');error.status=413;throw error}
    chunks.push(buf);
  }
  if(!chunks.length)return {};
  try{return JSON.parse(Buffer.concat(chunks,size).toString('utf8'))}catch{const error=new Error('invalid_json');error.status=400;throw error}
}
async function authenticate(req,relayDbPath){
  const channelId=headerValue(req,'x-jugest-channel-id').trim();
  const match=headerValue(req,'authorization').trim().match(/^Bearer\s+(.+)$/i);
  const receiverToken=match?.[1]?.trim()||'';
  if(!validChannelId(channelId)||!receiverToken)return null;
  const store=createRelayStore(RELAY_STORE_NAME,{dbPath:relayDbPath,root:'jugest'});
  const channel=await store.get(`channel/${channelId}`,{type:'json'});
  if(!channel||channel.revokedAt||!secureMatch(receiverToken,channel.receiverHash))return null;
  return {channelId,store};
}

export function createDeviceBackfillHandler({relayDbPath,canonicalDbPath,rawRoot}={}){
  if(typeof relayDbPath!=='string'||!relayDbPath.trim())throw new TypeError('relayDbPath is required');
  if(typeof canonicalDbPath!=='string'||!canonicalDbPath.trim())throw new TypeError('canonicalDbPath is required');
  if(typeof rawRoot!=='string'||!rawRoot.trim())throw new TypeError('rawRoot is required');
  return async function deviceBackfillHandler(req,res){
    if(String(req.method||'GET').toUpperCase()!=='POST'){
      sendJson(req,res,405,{ok:false,code:'method_not_allowed'},{allow:'POST'});return;
    }
    const auth=await authenticate(req,relayDbPath);
    if(!auth){sendJson(req,res,401,{ok:false,code:'unauthorized'});return}
    let body;
    try{body=await readJsonBody(req)}catch(error){sendJson(req,res,error.status||400,{ok:false,code:error.message||'invalid_request'});return}
    const days=Array.isArray(body?.days)?body.days:null;
    if(!days||days.length<1){sendJson(req,res,400,{ok:false,code:'days_required'});return}
    if(days.length>MAX_DAYS){sendJson(req,res,400,{ok:false,code:'batch_too_large',maxDays:MAX_DAYS});return}

    const config=await auth.store.get(`ios-collector-config/${auth.channelId}`,{type:'json'});
    const targets=Array.isArray(config?.stores)?config.stores:[];
    const byShop=new Map(targets.filter(x=>x?.sourceStoreId&&x?.shop).map(x=>[canonicalShop(x.shop),x]));
    const db=openDatabase(canonicalDbPath);migrate(db);
    const results=[];let inserted=0,duplicates=0,conflicts=0,skipped=0,failed=0;
    try{
      for(const raw of days){
        const date=String(raw?.date||'').trim(),shop=String(raw?.shop||'').trim();
        const target=byShop.get(canonicalShop(shop));
        if(!target){results.push({date,shop,ok:false,code:'store_not_configured'});skipped++;continue}
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Array.isArray(raw?.machines)||!raw.machines.length){results.push({date,shop,ok:false,code:'invalid_day'});failed++;continue}
        const day={...raw,date,shop:target.shop,machines:raw.machines};
        try{
          const r=await ingestDeviceBackfillDay(db,{rawRoot,channelId:auth.channelId,sourceStoreId:target.sourceStoreId,shop:target.shop,date,day,nowIso:new Date().toISOString()});
          if(r.inserted)inserted++;else if(r.duplicate)duplicates++;else if(r.conflict)conflicts++;
          results.push({date,shop:target.shop,ok:true,inserted:r.inserted,duplicate:r.duplicate,conflict:r.conflict,storeId:target.sourceStoreId,machineCount:r.machineCount});
        }catch(error){failed++;results.push({date,shop:target.shop,ok:false,code:'server_error',message:String(error?.message||error)})}
      }
    }finally{db.close()}
    sendJson(req,res,200,{ok:true,state:'PROCESSED',inserted,duplicates,conflicts,skipped,failed,results});
  };
}

export const __test={MAX_DAYS,MAX_BODY_BYTES,canonicalShop,secureMatch};
