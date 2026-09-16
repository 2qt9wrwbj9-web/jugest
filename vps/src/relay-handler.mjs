import {createRelayRuntime} from '../../api/_relay-web.js';
import {runWebHandler} from '../../api/_node-web.js';
import {markCollectorActivity} from './collector-activity.mjs';
import {openDatabase} from './db.mjs';
import {ingestCollectorDay} from './ingest/canonical-ingest.mjs';
import {createRelayStore} from './relay-store.mjs';
import {migrate} from './schema.mjs';
import {measureIngest} from './resource-telemetry.mjs';

const MAX_RELAY_BODY_BYTES=8*1024*1024;
const COLLECTOR_PUSH_ACTIONS=new Set(['iosCollectorPushV2','iosCollectorPushBatchV3']);
const COLLECTOR_POST_PUSH_GRACE_MS=2_000;

async function readNodeBody(req){
  const method=String(req.method||'GET').toUpperCase();
  if(method==='GET'||method==='HEAD'||method==='OPTIONS')return undefined;
  const chunks=[];
  let size=0;
  for await(const chunk of req){
    const buf=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    size+=buf.length;
    if(size>MAX_RELAY_BODY_BYTES){
      const error=new Error('Collector送信データが大きすぎるよ');
      error.status=413;
      throw error;
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks,size);
}

function relayAction(body){
  if(!body)return '';
  try{
    const parsed=JSON.parse(Buffer.isBuffer(body)?body.toString('utf8'):String(body));
    return String(parsed?.action||'');
  }catch{return ''}
}

function sendRelayError(res,error){
  const status=Number(error?.status)||500;
  const body=Buffer.from(JSON.stringify({ok:false,code:status===413?'payload_too_large':'server_error',message:error?.message||'Collector APIでエラーが起きたよ'}));
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':String(body.length),'cache-control':'no-store'});
  res.end(body);
}

function findSavedCollectorDay(index,sourceStoreId,date){
  for(const entry of Object.values(index?.entries||{}))if(entry?.sourceStoreId===sourceStoreId&&entry?.date===date)return entry;
  return null;
}

function installCanonicalPushHook(runtime,onCollectorSaved){
  if(typeof onCollectorSaved!=='function')return runtime;
  const api=runtime?.collectorApi;
  if(!api||typeof api.iosCollectorPushV2!=='function'||!api.actions)throw new Error('Relay Collector API hook surface is unavailable');
  const original=api.iosCollectorPushV2;
  const wrapped=async(req,store,body)=>{
    const response=await original(req,store,body);
    if(response.status>=400)return response;
    let result;
    try{result=await response.clone().json()}catch{return response}
    if(!result?.ok)return response;
    const auth=api.parseCollectorKey(body?.collectorKey),jobToken=String(body?.jobToken||'');
    if(!auth||!jobToken)throw new Error('Collector canonical hook could not resolve authenticated job');
    const job=await store.get(api.iosCollectorJobKey(auth.channelId,jobToken),{type:'json'});
    if(!job?.sourceStoreId||!job?.date)throw new Error('Collector canonical hook could not resolve saved job identity');
    const index=await api.getCollectorIndex(store,auth.channelId),entry=findSavedCollectorDay(index,job.sourceStoreId,job.date);
    if(!entry?.key)throw new Error('Collector canonical hook could not resolve saved day record');
    const saved=await store.get(entry.key,{type:'json'});
    if(!saved?.day||!Array.isArray(saved.day.machines))throw new Error('Collector canonical hook found an invalid saved day record');
    await onCollectorSaved({channelId:auth.channelId,sourceStoreId:job.sourceStoreId,shop:String(saved.shop||job.shop||result.shop||''),date:String(saved.day.date||job.date),parserBuild:String(saved.parserBuild||saved.day.parserBuild||saved.day.quality?.parserBuild||'v504-header-driven-1'),day:saved.day,rawText:String(body?.text??body?.html??''),jobToken,revision:Number.isFinite(+saved.revision)?+saved.revision:+result.revision||0});
    return response;
  };
  api.iosCollectorPushV2=wrapped;
  api.actions.iosCollectorPushV2=wrapped;
  return runtime;
}

function createCanonicalSavedHook({canonicalDbPath,rawRoot}){
  if(!canonicalDbPath&&!rawRoot)return null;
  if(typeof canonicalDbPath!=='string'||!canonicalDbPath.trim())throw new TypeError('canonicalDbPath is required when canonical Relay ingest is enabled');
  if(typeof rawRoot!=='string'||!rawRoot.trim())throw new TypeError('rawRoot is required when canonical Relay ingest is enabled');
  return async payload=>{
    const db=openDatabase(canonicalDbPath);
    try{
      migrate(db);
      return await measureIngest(()=>ingestCollectorDay(db,{rawRoot,channelId:payload.channelId,sourceStoreId:payload.sourceStoreId,shop:payload.shop,date:payload.date,parserBuild:payload.parserBuild,day:payload.day,rawText:payload.rawText,revision:payload.revision,nowIso:new Date().toISOString()}),{storeId:payload.sourceStoreId,date:payload.date});
    }finally{db.close()}
  };
}

export function createVpsRelayHandler({dbPath,canonicalDbPath=null,rawRoot=null,enterCollectorBarrier=async()=>({ok:true,noCoordinator:true})}={}){
  if(typeof dbPath!=='string'||!dbPath.trim())throw new TypeError('relay dbPath is required');
  if(typeof enterCollectorBarrier!=='function')throw new TypeError('enterCollectorBarrier must be a function');
  const onCollectorSaved=createCanonicalSavedHook({canonicalDbPath,rawRoot});
  const runtime=installCanonicalPushHook(createRelayRuntime({createStore:(name,options={})=>createRelayStore(name,{dbPath,root:options.root||'jugest'})}),onCollectorSaved);
  let activeCollectorPushes=0;
  return async function vpsRelayHandler(req,res){
    let collectorScoped=false;
    try{
      const body=await readNodeBody(req);
      const action=relayAction(body);
      if(canonicalDbPath&&COLLECTOR_PUSH_ACTIONS.has(action)){
        activeCollectorPushes++;collectorScoped=true;
        markCollectorActivity({dbPath:canonicalDbPath});
        await enterCollectorBarrier();
        markCollectorActivity({dbPath:canonicalDbPath});
      }
      return await runWebHandler({method:req.method,url:req.url,headers:req.headers,body},res,runtime.default);
    }catch(error){if(!res.headersSent)sendRelayError(res,error);else res.destroy(error)}
    finally{
      if(collectorScoped&&canonicalDbPath){
        activeCollectorPushes=Math.max(0,activeCollectorPushes-1);
        markCollectorActivity({dbPath:canonicalDbPath,ttlMs:activeCollectorPushes===0?COLLECTOR_POST_PUSH_GRACE_MS:undefined});
      }
    }
  };
}

export const __test={MAX_RELAY_BODY_BYTES,COLLECTOR_PUSH_ACTIONS,COLLECTOR_POST_PUSH_GRACE_MS,relayAction,findSavedCollectorDay,installCanonicalPushHook};
