import {createHash,timingSafeEqual} from 'node:crypto';
import {createRelayStore} from './relay-store.mjs';
import {openDatabase} from './db.mjs';
import {migrate} from './schema.mjs';
import {loadStoreDays} from './analysis/store-data.mjs';
import {buildComparisonSummary} from './research/live-comparison.mjs';
import {buildHistoricalComparisonSummary} from './research/historical-summary.mjs';
import {enrichStoredStoreReadPayload,getActiveStoreModel} from './research/store-read-output.mjs';

const RELAY_STORE_NAME='juggler-relay-v1';
const STORE_READ_VERSION='store-read-v1';

function digest(value){return createHash('sha256').update(String(value||'')).digest('hex');}
function secureMatch(raw,expectedHash){
  if(!raw||!/^[a-f0-9]{64}$/i.test(String(expectedHash||'')))return false;
  const a=Buffer.from(digest(raw),'hex'),b=Buffer.from(String(expectedHash),'hex');
  return a.length===b.length&&timingSafeEqual(a,b);
}
function headerValue(req,name){const value=req?.headers?.[name.toLowerCase()];return Array.isArray(value)?String(value[0]||''):String(value||'');}
function bearerToken(req){const match=headerValue(req,'authorization').trim().match(/^Bearer\s+(.+)$/i);return match?.[1]?.trim()||'';}
function validChannelId(value){return /^[A-Za-z0-9_-]{12,80}$/.test(String(value||''));}
function safeJson(text,fallback=null){try{return JSON.parse(text)}catch{return fallback;}}
function serviceError(code){const error=new Error(code);error.code=code;return error;}

async function resolveReceiverAuth(req,relayDbPath){
  const token=bearerToken(req);if(!token)return null;
  const relay=createRelayStore(RELAY_STORE_NAME,{dbPath:relayDbPath,root:'jugest'});
  const hinted=headerValue(req,'x-jugest-channel-id').trim();
  if(validChannelId(hinted)){
    const channel=await relay.get(`channel/${hinted}`,{type:'json'});
    if(channel&&!channel.revokedAt&&secureMatch(token,channel.receiverHash))return{channelId:hinted};
  }
  const listing=await relay.list({prefix:'channel/'});
  for(const entry of listing.blobs||[]){
    const key=String(entry.key||entry.pathname||'');
    if(!key.startsWith('channel/'))continue;
    const channelId=key.slice('channel/'.length);
    if(!validChannelId(channelId))continue;
    const channel=await relay.get(key,{type:'json'});
    if(channel&&!channel.revokedAt&&secureMatch(token,channel.receiverHash))return{channelId};
  }
  return null;
}

function authorizedStore(db,storeId,channelId){
  const row=db.prepare('SELECT id,name,source_metadata_json,created_at,updated_at FROM stores WHERE id=?').get(String(storeId||''));
  if(!row)throw serviceError('store_not_found');
  const metadata=safeJson(row.source_metadata_json,{})||{};
  if(String(metadata.collectorChannelId||'')!==String(channelId||''))throw serviceError('forbidden');
  return{id:row.id,name:row.name,createdAt:row.created_at,updatedAt:row.updated_at};
}

function auditStoreRead(db,storeId,payload){
  if(!payload||payload.explanationVersion==='pre-audit-v1')return payload;
  try{
    const activeModel=getActiveStoreModel(db,{storeId});
    if(!activeModel||String(activeModel.fingerprint||'')!==String(payload.modelFingerprint||''))return payload;
    const {days}=loadStoreDays(db,storeId,{limit:400});
    return enrichStoredStoreReadPayload({payload,activeModel,days});
  }catch{return payload;}
}

function withDatabase(canonicalDbPath,fn){
  const db=openDatabase(canonicalDbPath);
  try{migrate(db);return fn(db);}finally{db.close();}
}

export function createMcpStoreService({relayDbPath,canonicalDbPath}={}){
  if(typeof relayDbPath!=='string'||!relayDbPath.trim())throw new TypeError('relayDbPath is required');
  if(typeof canonicalDbPath!=='string'||!canonicalDbPath.trim())throw new TypeError('canonicalDbPath is required');
  return{
    authenticate:req=>resolveReceiverAuth(req,relayDbPath),
    listStores:auth=>withDatabase(canonicalDbPath,db=>{
      const rows=db.prepare('SELECT id,name,source_metadata_json,created_at,updated_at FROM stores ORDER BY name,id').all();
      const stores=rows.flatMap(row=>{
        const metadata=safeJson(row.source_metadata_json,{})||{};
        if(String(metadata.collectorChannelId||'')!==auth.channelId)return[];
        const latest=db.prepare("SELECT MAX(business_date) AS latest,COUNT(*) AS days FROM store_days WHERE store_id=? AND quality_status='valid'").get(row.id);
        return[{id:row.id,name:row.name,latestDate:latest?.latest??null,dayCount:Number(latest?.days)||0,updatedAt:row.updated_at}];
      });
      return{ok:true,stores};
    }),
    getStoreDay:(auth,storeId,date)=>withDatabase(canonicalDbPath,db=>{
      if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))throw serviceError('bad_date');
      const store=authorizedStore(db,storeId,auth.channelId);
      const day=db.prepare("SELECT business_date,parser_version,quality_status FROM store_days WHERE store_id=? AND business_date=? AND quality_status='valid'").get(store.id,date);
      if(!day)throw serviceError('day_not_found');
      const machines=db.prepare('SELECT payload_json FROM machine_day_data WHERE store_id=? AND business_date=? ORDER BY machine_key').all(store.id,date).map(row=>safeJson(row.payload_json,null)).filter(Boolean);
      return{ok:true,store,day:{date:day.business_date,parserVersion:day.parser_version||'',qualityStatus:day.quality_status,machines}};
    }),
    getStorePrediction:(auth,storeId)=>withDatabase(canonicalDbPath,db=>{
      const store=authorizedStore(db,storeId,auth.channelId);
      const row=db.prepare(`SELECT business_date,payload_json,payload_hash,updated_at FROM client_snapshots WHERE store_id=? AND snapshot_type='store-read-active' AND version=?`).get(store.id,STORE_READ_VERSION);
      const stored=row?safeJson(row.payload_json,null):null,storeRead=auditStoreRead(db,store.id,stored),auditEnriched=Boolean(storeRead&&storeRead!==stored);
      return{ok:true,store,storeRead,businessDate:row?.business_date??null,payloadHash:row?.payload_hash??null,updatedAt:row?.updated_at??null,auditEnriched};
    }),
    getStoreComparison:(auth,storeId,limit=90)=>withDatabase(canonicalDbPath,db=>{
      const store=authorizedStore(db,storeId,auth.channelId);
      const safeLimit=Math.min(366,Math.max(1,Math.trunc(Number(limit)||90)));
      const live=buildComparisonSummary(db,{storeId:store.id,limit:safeLimit});
      const comparison={...live,historical:buildHistoricalComparisonSummary(db,{storeId:store.id,limit:safeLimit})};
      return{ok:true,store,limit:safeLimit,comparison};
    })
  };
}

export const __test={digest,secureMatch,bearerToken,resolveReceiverAuth,authorizedStore,auditStoreRead};
