import {createHash,timingSafeEqual} from 'node:crypto';
import {createRelayStore} from './relay-store.mjs';
import {openDatabase} from './db.mjs';
import {migrate} from './schema.mjs';
import {loadStoreDays} from './analysis/store-data.mjs';
import {buildComparisonSummary} from './research/live-comparison.mjs';
import {buildHistoricalComparisonSummary} from './research/historical-summary.mjs';
import {enrichStoredStoreReadPayload,getActiveStoreModel} from './research/store-read-output.mjs';
import {JUGGLER_MACHINE_KEYS,judgeJugglerExternal} from './judge/juggler-external-judge.mjs';
import {canAccessStoreMetadata,storeMetadata} from './store-access.mjs';
import {authenticateOAuthAccessToken,OAUTH_RESOURCE_METADATA,OAUTH_SCOPE} from './oauth-handler.mjs';
import {authenticateAssistantRead} from './assistant-read-key.mjs';

const MCP_VERSION='2026-07-28';
const LEGACY_VERSION='2025-11-25';
const SERVER_INFO=Object.freeze({name:'jugest',version:'0.1.0'});
const RELAY_STORE_NAME='juggler-relay-v1';
const STORE_READ_VERSION='store-read-v1';
const JUDGE_VERSION='external-juggler-browser-parity-v1';
const MAX_BATCH=200;
const MACHINE_KEYS=new Set(JUGGLER_MACHINE_KEYS);
const NOAUTH_SECURITY=Object.freeze([{type:'noauth'}]);
const OAUTH_SECURITY=Object.freeze([{type:'oauth2',scopes:[OAUTH_SCOPE]}]);
const OAUTH_CHALLENGE=`Bearer resource_metadata="${OAUTH_RESOURCE_METADATA}", error="invalid_token", error_description="Connect your JUGEST account to continue"`;
const INSTRUCTIONS='Automatically use judge_machines for supported current-machine Juggler setting judgement from observed data, including data-site screenshots and short judgement requests, even without the user mentioning JUGEST. judge_machines is public, uses no account/store data, and must not incorporate PRE v2, store tendencies, or store history. Store tools require authentication and are separate context; use them only when the user asks for saved store data, store reading, prediction, historical comparison, or an explicitly combined assessment. Screenshot extraction is performed by the model; JUGEST performs the setting probability calculation. Do not invoke JUGEST for generic pachislot questions that are not current-machine Juggler setting judgement.';

const publicTool=tool=>Object.freeze({...tool,securitySchemes:NOAUTH_SECURITY,_meta:{securitySchemes:NOAUTH_SECURITY}});
const securedTool=tool=>Object.freeze({...tool,securitySchemes:OAUTH_SECURITY,_meta:{securitySchemes:OAUTH_SECURITY}});
const TOOL_DEFS=Object.freeze([
  publicTool({
    name:'judge_machines',title:'Judge current Juggler machines',
    description:'Use for supported current-machine Juggler setting judgement from observed data, including data-site screenshots, even if the user does not mention JUGEST. Calculate JUGEST setting posteriors from observed current machine data only. Does not read a store, PRE v2, store tendencies, or history. Use diff when reliably visible; omit diff when it is unavailable or uncertain.',
    inputSchema:{type:'object',additionalProperties:false,properties:{machines:{type:'array',maxItems:MAX_BATCH,items:{type:'object',additionalProperties:false,properties:{tableNo:{type:['string','number'],description:'Optional table number shown in the screenshot.'},machine:{type:'string',enum:JUGGLER_MACHINE_KEYS,description:'JUGEST machine key: my=マイジャグV, im=ネオアイム, go=ゴージャグ3, fk=ファンキー2, hp=ハッピーVⅢ, gg=ガールズSS, mr=ミスター, um=ウルトラミラクル.'},games:{type:'number',exclusiveMinimum:0},bb:{type:'integer',minimum:0},rb:{type:'integer',minimum:0},diff:{type:'number',description:'Optional current coin difference. Omit rather than guess when unreadable.'}},required:['machine','games','bb','rb']}}},required:['machines']},
    annotations:{readOnlyHint:true,openWorldHint:false}
  }),
  securedTool({
    name:'list_stores',title:'List JUGEST stores',
    description:'List stores saved in JUGEST that are authorized for the connected Collector channel. Use this to resolve a user-provided store name to storeId.',
    inputSchema:{type:'object',additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:false}
  }),
  securedTool({
    name:'get_store_days',title:'Get saved store days',
    description:'List compact saved business dates for one authorized JUGEST store. This is historical data and is separate from current-machine setting judgement.',
    inputSchema:{type:'object',additionalProperties:false,properties:{storeId:{type:'string',minLength:1},limit:{type:'integer',minimum:1,maximum:366,default:60}},required:['storeId']},annotations:{readOnlyHint:true,openWorldHint:false}
  }),
  securedTool({
    name:'get_store_day',title:'Get one saved store day',
    description:'Read the saved per-machine data for one authorized store and business date.',
    inputSchema:{type:'object',additionalProperties:false,properties:{storeId:{type:'string',minLength:1},date:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'}},required:['storeId','date']},annotations:{readOnlyHint:true,openWorldHint:false}
  }),
  securedTool({
    name:'get_store_prediction',title:'Get PRE/store prediction',
    description:'Read the active JUGEST PRE/store-read prediction for an authorized store. Keep this separate from judge_machines unless the user explicitly asks for store reading or a combined assessment.',
    inputSchema:{type:'object',additionalProperties:false,properties:{storeId:{type:'string',minLength:1}},required:['storeId']},annotations:{readOnlyHint:true,openWorldHint:false}
  }),
  securedTool({
    name:'get_store_comparison',title:'Get prediction comparison',
    description:'Read PRE/legacy live and historical comparison metrics for an authorized store. This evaluates prediction systems and is not a current-machine setting posterior.',
    inputSchema:{type:'object',additionalProperties:false,properties:{storeId:{type:'string',minLength:1},limit:{type:'integer',minimum:1,maximum:366,default:90}},required:['storeId']},annotations:{readOnlyHint:true,openWorldHint:false}
  })
]);

function digest(value){return createHash('sha256').update(String(value||'')).digest('hex')}
function secureMatch(raw,expectedHash){if(!raw||!/^[a-f0-9]{64}$/i.test(String(expectedHash||'')))return false;const a=Buffer.from(digest(raw),'hex'),b=Buffer.from(String(expectedHash),'hex');return a.length===b.length&&timingSafeEqual(a,b)}
function headerValue(req,name){const value=req.headers?.[name.toLowerCase()];return Array.isArray(value)?String(value[0]||''):String(value||'')}
function validChannelId(value){return /^[A-Za-z0-9_-]{12,80}$/.test(String(value||''))}
function bearerToken(req){const match=headerValue(req,'authorization').trim().match(/^Bearer\s+(.+)$/i);return match?.[1]?.trim()||''}
function safeJson(text,fallback=null){try{return JSON.parse(text)}catch{return fallback}}
function jsonText(value){return JSON.stringify(value)}
function sendRaw(res,status,body='',headers={}){const data=Buffer.from(body);res.writeHead(status,{'content-length':String(data.length),'cache-control':'no-store','x-content-type-options':'nosniff',...headers});res.end(data)}
function sendJson(res,status,payload,headers={}){sendRaw(res,status,JSON.stringify(payload),{'content-type':'application/json; charset=utf-8',...headers})}
function jsonRpcError(id,code,message,data){return {jsonrpc:'2.0',id:id??null,error:{code,message,...(data===undefined?{}:{data})}}}
function modernMeta(){return {'io.modelcontextprotocol/serverInfo':SERVER_INFO}}
function modernResult(result){return {resultType:'complete',...result,_meta:{...(result?._meta||{}),...modernMeta()}}}
function toolResult(payload,{modern,isError=false}={}){const result={content:[{type:'text',text:jsonText(payload)}],structuredContent:payload,isError};return modern?modernResult(result):result}
function toolError(message,{modern,code='tool_error'}={}){const result={content:[{type:'text',text:`${code}: ${message}`}],isError:true};return modern?modernResult(result):result}
function authToolError({modern}={}){
  const result={content:[{type:'text',text:'Authentication required: connect your JUGEST account to continue.'}],isError:true,_meta:{'mcp/www_authenticate':[OAUTH_CHALLENGE]}};
  return modern?modernResult(result):result;
}

async function authenticateCollector(req,relayDbPath){
  const channelId=headerValue(req,'x-jugest-channel-id').trim(),receiverToken=bearerToken(req);
  if(!validChannelId(channelId)||!receiverToken)return null;
  const store=createRelayStore(RELAY_STORE_NAME,{dbPath:relayDbPath,root:'jugest'});
  const channel=await store.get(`channel/${channelId}`,{type:'json'});
  if(!channel||channel.revokedAt||!secureMatch(receiverToken,channel.receiverHash))return null;
  return {channelId,authType:'collector'};
}
async function authenticateToolRequest(req,relayDbPath){
  const collector=await authenticateCollector(req,relayDbPath);if(collector)return collector;
  const assistantRead=await authenticateAssistantRead(req,relayDbPath);if(assistantRead)return assistantRead;
  const token=bearerToken(req);if(!token)return null;
  const oauth=await authenticateOAuthAccessToken(token,{relayDbPath});
  return oauth?{...oauth,authType:'oauth'}:null;
}

function trustedOrigin(raw){
  const value=String(raw||'').trim();if(!value)return true;
  let url;try{url=new URL(value)}catch{return false}
  if(['https://chatgpt.com','https://chat.openai.com','https://platform.openai.com'].includes(url.origin))return true;
  return url.protocol==='http:'&&['127.0.0.1','localhost','::1','[::1]'].includes(url.hostname);
}

async function readJsonBody(req,{maxBytes=524288}={}){
  let size=0;const chunks=[];
  for await(const chunk of req){const data=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=data.length;if(size>maxBytes){const error=new Error('body_too_large');error.code='body_too_large';throw error}chunks.push(data)}
  if(!chunks.length)return null;
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{const error=new Error('bad_json');error.code='bad_json';throw error}
}

function authorizedStore(db,storeId,channelId){
  const row=db.prepare('SELECT id,name,source_metadata_json,created_at,updated_at FROM stores WHERE id=?').get(storeId);
  if(!row)return {status:404,store:null,code:'store_not_found'};
  const metadata=storeMetadata(row.source_metadata_json);
  if(!canAccessStoreMetadata(metadata,channelId))return {status:403,store:null,code:'forbidden'};
  return {status:200,store:{id:row.id,name:row.name,createdAt:row.created_at,updatedAt:row.updated_at},code:null};
}

function auditStoreRead(db,storeId,payload){
  if(!payload||payload.explanationVersion==='pre-audit-v1')return payload;
  try{
    const activeModel=getActiveStoreModel(db,{storeId});
    if(!activeModel||String(activeModel.fingerprint||'')!==String(payload.modelFingerprint||''))return payload;
    const {days}=loadStoreDays(db,storeId,{limit:400});
    return enrichStoredStoreReadPayload({payload,activeModel,days});
  }catch{return payload}
}

function finite(value){const n=Number(value);return Number.isFinite(n)?n:null}
async function judgeRow(raw,index,rootDir){
  const tableNo=String(raw?.tableNo??'').trim().slice(0,80),base={ok:false,index,tableNo};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {...base,code:'bad_machine_row'};
  const machine=String(raw.machine??'').trim();if(!MACHINE_KEYS.has(machine))return {...base,machine,code:'unsupported_machine'};
  const games=finite(raw.games);if(games==null||games<=0)return {...base,machine,code:'bad_games'};
  const bb=raw.bb==null?0:finite(raw.bb),rb=raw.rb==null?0:finite(raw.rb);
  if(bb==null||rb==null||!Number.isInteger(bb)||!Number.isInteger(rb)||bb<0||rb<0)return {...base,machine,code:'bad_bonus_count'};
  if(bb+rb>games)return {...base,machine,code:'bonus_exceeds_games'};
  const hasDiff=raw.diff!==null&&raw.diff!==undefined&&raw.diff!=='';
  const diff=hasDiff?finite(raw.diff):null;if(hasDiff&&diff==null)return {...base,machine,code:'bad_diff'};
  const judged=await judgeJugglerExternal({machine,games,bb,rb,diff},{rootDir});if(!judged)return {...base,machine,code:'judge_unavailable'};
  return {ok:true,index,tableNo,...judged};
}

function listStores(db,channelId){
  const rows=db.prepare('SELECT id,name,source_metadata_json,created_at,updated_at FROM stores ORDER BY name,id').all();
  return rows.flatMap(row=>{const metadata=storeMetadata(row.source_metadata_json);if(!canAccessStoreMetadata(metadata,channelId))return [];const latest=db.prepare("SELECT MAX(business_date) AS latest,COUNT(*) AS days FROM store_days WHERE store_id=? AND quality_status='valid'").get(row.id);return [{id:row.id,name:row.name,latestDate:latest?.latest??null,dayCount:Number(latest?.days)||0,updatedAt:row.updated_at}]});
}

async function runTool(name,args,{rootDir,channelId,canonicalDbPath,modern}){
  if(name==='judge_machines'){
    if(!Array.isArray(args?.machines))return toolError('machines must be an array',{modern,code:'bad_machines'});
    if(args.machines.length>MAX_BATCH)return toolError(`at most ${MAX_BATCH} machines are allowed`,{modern,code:'batch_too_large'});
    if(!rootDir)return toolError('JUGEST judgement runtime is unavailable',{modern,code:'judge_runtime_unavailable'});
    const machines=await Promise.all(args.machines.map((row,index)=>judgeRow(row,index,rootDir)));
    return toolResult({ok:true,judgeVersion:JUDGE_VERSION,machines},{modern});
  }
  const db=openDatabase(canonicalDbPath);
  try{
    migrate(db);
    if(name==='list_stores')return toolResult({ok:true,stores:listStores(db,channelId)},{modern});
    const storeId=String(args?.storeId||'').trim();
    if(!storeId)return toolError('storeId is required',{modern,code:'bad_store_id'});
    const access=authorizedStore(db,storeId,channelId);
    if(!access.store)return toolError(access.code,{modern,code:access.code});
    if(name==='get_store_days'){
      const limit=Math.min(366,Math.max(1,Math.trunc(Number(args?.limit)||60)));
      const rows=db.prepare(`SELECT d.business_date,d.parser_version,d.quality_status,COUNT(m.machine_key) AS machine_count FROM store_days d LEFT JOIN machine_day_data m ON m.store_id=d.store_id AND m.business_date=d.business_date WHERE d.store_id=? AND d.quality_status='valid' GROUP BY d.store_id,d.business_date ORDER BY d.business_date DESC LIMIT ?`).all(storeId,limit).reverse();
      return toolResult({ok:true,store:access.store,days:rows.map(row=>({date:row.business_date,parserVersion:row.parser_version||'',qualityStatus:row.quality_status,machineCount:Number(row.machine_count)||0}))},{modern});
    }
    if(name==='get_store_day'){
      const date=String(args?.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return toolError('date must be YYYY-MM-DD',{modern,code:'bad_date'});
      const day=db.prepare("SELECT business_date,parser_version,quality_status FROM store_days WHERE store_id=? AND business_date=? AND quality_status='valid'").get(storeId,date);
      if(!day)return toolError('day_not_found',{modern,code:'day_not_found'});
      const machines=db.prepare('SELECT payload_json FROM machine_day_data WHERE store_id=? AND business_date=? ORDER BY machine_key').all(storeId,date).map(row=>safeJson(row.payload_json,null)).filter(Boolean);
      return toolResult({ok:true,store:access.store,day:{date:day.business_date,parserVersion:day.parser_version||'',qualityStatus:day.quality_status,machines}},{modern});
    }
    if(name==='get_store_prediction'){
      const row=db.prepare(`SELECT business_date,payload_json,payload_hash,updated_at FROM client_snapshots WHERE store_id=? AND snapshot_type='store-read-active' AND version=?`).get(storeId,STORE_READ_VERSION);
      const stored=row?safeJson(row.payload_json,null):null,storeRead=auditStoreRead(db,storeId,stored),auditEnriched=Boolean(storeRead&&storeRead!==stored);
      return toolResult({ok:true,store:access.store,storeRead,businessDate:row?.business_date??null,payloadHash:row?.payload_hash??null,updatedAt:row?.updated_at??null,auditEnriched},{modern});
    }
    if(name==='get_store_comparison'){
      const limit=Math.min(366,Math.max(1,Math.trunc(Number(args?.limit)||90)));
      const live=buildComparisonSummary(db,{storeId,limit}),comparison={...live,historical:buildHistoricalComparisonSummary(db,{storeId,limit})};
      return toolResult({ok:true,store:access.store,limit,comparison},{modern});
    }
    return null;
  }finally{db.close()}
}

function validateModernRouting(req,body){
  const version=headerValue(req,'mcp-protocol-version').trim();
  if(version&&version!==MCP_VERSION)return {ok:false,code:-32022,message:`Unsupported MCP protocol version: ${version}`,data:{supported:[MCP_VERSION]}};
  if(version===MCP_VERSION){
    const methodHeader=headerValue(req,'mcp-method').trim();if(methodHeader!==String(body?.method||''))return {ok:false,code:-32600,message:'Mcp-Method header does not match JSON-RPC method'};
    if(body?.method==='tools/call'){
      const nameHeader=headerValue(req,'mcp-name').trim(),bodyName=String(body?.params?.name||'');
      if(nameHeader!==bodyName)return {ok:false,code:-32600,message:'Mcp-Name header does not match tool name'};
    }
  }
  return {ok:true};
}

function isModern(req,body){return headerValue(req,'mcp-protocol-version').trim()==='2026-07-28'||body?.params?._meta?.['io.modelcontextprotocol/protocolVersion']==='2026-07-28'}

export function createMcpHandler({rootDir,relayDbPath,canonicalDbPath}={}){
  if(typeof relayDbPath!=='string'||!relayDbPath.trim())throw new TypeError('relayDbPath is required');
  if(typeof canonicalDbPath!=='string'||!canonicalDbPath.trim())throw new TypeError('canonicalDbPath is required');
  return async function jugestMcpHandler(req,res){
    if(!trustedOrigin(headerValue(req,'origin'))){sendJson(res,403,jsonRpcError(null,-32000,'Forbidden origin'));return}
    if(String(req.method||'GET').toUpperCase()!=='POST'){sendJson(res,405,jsonRpcError(null,-32600,'Method Not Allowed'),{allow:'POST'});return}
    let body;try{body=await readJsonBody(req)}catch(error){sendJson(res,error?.code==='body_too_large'?413:400,jsonRpcError(null,-32700,error?.code==='body_too_large'?'Request body too large':'Parse error'));return}
    if(!body||body.jsonrpc!=='2.0'||typeof body.method!=='string'){sendJson(res,400,jsonRpcError(body?.id,-32600,'Invalid Request'));return}
    const routing=validateModernRouting(req,body);if(!routing.ok){sendJson(res,400,jsonRpcError(body.id,routing.code,routing.message,routing.data));return}
    const modern=isModern(req,body),id=body.id??null;
    if(modern){
      const requested=body?.params?._meta?.['io.modelcontextprotocol/protocolVersion'];
      if(requested&&requested!==MCP_VERSION){sendJson(res,400,jsonRpcError(id,-32022,`Unsupported MCP protocol version: ${requested}`,{supported:[MCP_VERSION]}));return}
    }
    if(body.method==='server/discover'){
      if(!modern){sendJson(res,200,jsonRpcError(id,-32601,'Method not found'));return}
      sendJson(res,200,{jsonrpc:'2.0',id,result:modernResult({supportedVersions:[MCP_VERSION],capabilities:{tools:{}},instructions:INSTRUCTIONS,ttlMs:300000,cacheScope:'private'})});return;
    }
    if(body.method==='initialize'){
      const requested=String(body?.params?.protocolVersion||LEGACY_VERSION),protocolVersion=requested==='2025-11-25'?requested:LEGACY_VERSION;
      sendJson(res,200,{jsonrpc:'2.0',id,result:{protocolVersion,capabilities:{tools:{}},serverInfo:SERVER_INFO,instructions:INSTRUCTIONS}});return;
    }
    if(body.method==='notifications/initialized'){res.writeHead(204);res.end();return}
    if(body.method==='ping'){sendJson(res,200,{jsonrpc:'2.0',id,result:modern?modernResult({}):{}});return}
    if(body.method==='tools/list'){
      const result={tools:TOOL_DEFS.map(tool=>structuredClone(tool))};
      if(modern)Object.assign(result,{ttlMs:300000,cacheScope:'private'});
      sendJson(res,200,{jsonrpc:'2.0',id,result:modern?modernResult(result):result});return;
    }
    if(body.method==='tools/call'){
      const name=String(body?.params?.name||''),args=body?.params?.arguments??{};
      if(!TOOL_DEFS.some(tool=>tool.name===name)){sendJson(res,200,jsonRpcError(id,-32602,`Unknown tool: ${name}`));return}
      const publicJudge=name==='judge_machines';
      const auth=publicJudge?null:await authenticateToolRequest(req,relayDbPath);
      if(!publicJudge&&!auth){sendJson(res,200,{jsonrpc:'2.0',id,result:authToolError({modern})},{'www-authenticate':OAUTH_CHALLENGE});return}
      const result=await runTool(name,args,{rootDir,channelId:auth?.channelId||'',canonicalDbPath,modern});
      if(!result){sendJson(res,200,jsonRpcError(id,-32603,'Internal error'));return}
      sendJson(res,200,{jsonrpc:'2.0',id,result});return;
    }
    sendJson(res,200,jsonRpcError(id,-32601,'Method not found'));
  };
}

export const __test={MCP_VERSION,LEGACY_VERSION,SERVER_INFO,INSTRUCTIONS,TOOL_DEFS,trustedOrigin,judgeRow,validateModernRouting};
