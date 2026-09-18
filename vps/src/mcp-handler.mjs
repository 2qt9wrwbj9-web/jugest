import {runExistingMachineJudgement} from './analysis/runtime-adapter.mjs';
import {createAnalyticsHandler} from './analytics-handler.mjs';

const PROTOCOL_VERSION='2025-06-18';
const MAX_REQUEST_BYTES=1024*1024;
const SERVER_INFO=Object.freeze({name:'jugest',version:'6.0.2'});
const SERVER_INSTRUCTIONS='Use judge_machines for live setting judgement from observed machine data only. Do not mix PRE, store-read, store trends, or store priors into the judgement posterior. PRE/store context must be requested and presented separately.';

const JUGGLER_KEYS=Object.freeze(['my','im','go','fk','hp','gg','mr','um']);
const READ_ONLY_ANNOTATIONS=Object.freeze({readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false});

const JUDGE_MACHINES_TOOL=Object.freeze({
  name:'judge_machines',
  title:'JUGEST batch machine judgement',
  description:'Judge one or more Juggler machines from observed G/BB/RB and optional diff only. This does not mix PRE, store trends, or store priors into the posterior.',
  inputSchema:{
    type:'object',
    additionalProperties:false,
    required:['machines'],
    properties:{
      machines:{
        type:'array',
        minItems:1,
        maxItems:200,
        items:{
          type:'object',
          additionalProperties:false,
          required:['machine','games','bb','rb'],
          properties:{
            machine:{type:'string',enum:JUGGLER_KEYS},
            machineNo:{type:'string'},
            games:{type:'integer',minimum:1},
            bb:{type:'integer',minimum:0},
            rb:{type:'integer',minimum:0},
            diff:{type:['number','null']}
          }
        }
      }
    }
  },
  annotations:READ_ONLY_ANNOTATIONS
});

const STORE_TOOLS=Object.freeze([
  Object.freeze({
    name:'list_stores',title:'List JUGEST stores',
    description:'List stores available in the authenticated JUGEST VPS scope. This is read-only and does not affect live setting judgement.',
    inputSchema:{type:'object',additionalProperties:false,properties:{}},annotations:READ_ONLY_ANNOTATIONS
  }),
  Object.freeze({
    name:'get_store_days',title:'Get JUGEST store days',
    description:'Read the available canonical dates for one JUGEST store. Store context remains separate from live setting judgement.',
    inputSchema:{type:'object',additionalProperties:false,required:['storeId'],properties:{storeId:{type:'string',minLength:1},limit:{type:'integer',minimum:1,maximum:366}}},annotations:READ_ONLY_ANNOTATIONS
  }),
  Object.freeze({
    name:'get_store_day',title:'Get JUGEST store day',
    description:'Read the stored canonical machine data for one store and date. This is historical/observed store data and is not automatically mixed into judge_machines.',
    inputSchema:{type:'object',additionalProperties:false,required:['storeId','date'],properties:{storeId:{type:'string',minLength:1},date:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'}}},annotations:READ_ONLY_ANNOTATIONS
  }),
  Object.freeze({
    name:'get_store_read',title:'Get JUGEST PRE store read',
    description:'Read the active PRE/store-read snapshot as separate store-reading context. Never mix this automatically into the live setting posterior returned by judge_machines.',
    inputSchema:{type:'object',additionalProperties:false,required:['storeId'],properties:{storeId:{type:'string',minLength:1}}},annotations:READ_ONLY_ANNOTATIONS
  }),
  Object.freeze({
    name:'get_store_comparison',title:'Get JUGEST prediction comparison',
    description:'Read PRE/current and historical comparison evidence for a store as separate research context. This does not alter live machine judgement.',
    inputSchema:{type:'object',additionalProperties:false,required:['storeId'],properties:{storeId:{type:'string',minLength:1},limit:{type:'integer',minimum:1,maximum:366}}},annotations:READ_ONLY_ANNOTATIONS
  })
]);
const ALL_TOOLS=Object.freeze([JUDGE_MACHINES_TOOL,...STORE_TOOLS]);

function send(res,status,body='',headers={}){
  const data=Buffer.isBuffer(body)?body:Buffer.from(String(body));
  res.writeHead(status,{'content-length':String(data.length),'cache-control':'no-store','x-content-type-options':'nosniff',...headers});
  res.end(data);
}

function sendJson(res,status,payload){
  send(res,status,JSON.stringify(payload),{'content-type':'application/json; charset=utf-8'});
}

function rpcResult(id,result){return {jsonrpc:'2.0',id:id??null,result}}
function rpcError(id,code,message,data){return {jsonrpc:'2.0',id:id??null,error:{code,message,...(data===undefined?{}:{data})}}}

async function readBody(req){
  let total=0;
  const chunks=[];
  for await (const chunk of req){
    total+=chunk.length;
    if(total>MAX_REQUEST_BYTES){
      const error=new RangeError('MCP request body too large');
      error.code='request_too_large';
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function toolSuccess(payload){
  const structuredContent=payload&&typeof payload==='object'?payload:{value:payload};
  return {content:[{type:'text',text:JSON.stringify(structuredContent)}],structuredContent};
}

function toolFailure(error){
  const message=String(error?.message??error??'Unknown tool error');
  return {content:[{type:'text',text:message}],isError:true};
}

function initializeResult(params={}){
  const requested=String(params?.protocolVersion||'').trim();
  return {protocolVersion:requested||PROTOCOL_VERSION,capabilities:{tools:{listChanged:false}},serverInfo:SERVER_INFO,instructions:SERVER_INSTRUCTIONS};
}

function firstHeader(headers,name){
  const value=headers?.[name.toLowerCase()];
  return Array.isArray(value)?String(value[0]||''):String(value||'');
}

function analyticsAuthHeaders(headers={}){
  const authorization=firstHeader(headers,'authorization').trim();
  let channelId=firstHeader(headers,'x-jugest-channel-id').trim();
  let receiverAuthorization=authorization;
  const match=authorization.match(/^Bearer\s+(.+)$/i);
  const bearer=match?.[1]?.trim()||'';
  if(!channelId&&bearer){
    const split=bearer.indexOf(':');
    if(split>0&&split<bearer.length-1){
      channelId=bearer.slice(0,split).trim();
      const receiverToken=bearer.slice(split+1).trim();
      receiverAuthorization=receiverToken?`Bearer ${receiverToken}`:'';
    }
  }
  return {
    ...(channelId?{'x-jugest-channel-id':channelId}:{}),
    ...(receiverAuthorization?{authorization:receiverAuthorization}:{})
  };
}

function safeStoreId(value){
  const storeId=String(value??'').trim();
  if(!storeId||storeId.length>200||/[\\/\0]/.test(storeId))throw new TypeError('storeId must be a safe non-empty identifier');
  return storeId;
}

function safeDate(value){
  const date=String(value??'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(`${date}T00:00:00Z`)))throw new TypeError('date must be YYYY-MM-DD');
  return date;
}

function boundedLimit(value,fallback=90){
  const numeric=Number(value);
  const normalized=Number.isFinite(numeric)?Math.trunc(numeric):fallback;
  return Math.min(366,Math.max(1,normalized||fallback));
}

async function callAnalytics(handler,{path,headers}){
  if(typeof handler!=='function')throw new Error('JUGEST store tools are unavailable on this server');
  const request={method:'GET',url:path,headers:analyticsAuthHeaders(headers)};
  let status=200,responseHeaders={},body=Buffer.alloc(0),ended=false;
  const response={
    req:request,
    headersSent:false,
    writeHead(nextStatus,nextHeaders={}){status=Number(nextStatus)||500;responseHeaders={...nextHeaders};this.headersSent=true;return this},
    end(chunk=''){body=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk));ended=true;return this}
  };
  await handler(request,response);
  if(!ended)throw new Error('JUGEST analytics handler returned without a response');
  let payload;
  try{payload=JSON.parse(body.toString('utf8')||'null')}catch{throw new Error(`JUGEST analytics handler returned invalid JSON (${status})`)}
  if(status<200||status>=300){
    const code=String(payload?.code||payload?.message||`HTTP ${status}`);
    const error=new Error(code);
    error.status=status;
    error.payload=payload;
    throw error;
  }
  return payload;
}

function storeToolPath(name,args={}){
  if(name==='list_stores')return '/api/vps/stores';
  const storeId=encodeURIComponent(safeStoreId(args.storeId));
  if(name==='get_store_days')return `/api/vps/stores/${storeId}/days?limit=${boundedLimit(args.limit,60)}`;
  if(name==='get_store_day')return `/api/vps/stores/${storeId}/days/${encodeURIComponent(safeDate(args.date))}`;
  if(name==='get_store_read')return `/api/vps/stores/${storeId}/research/store-read`;
  if(name==='get_store_comparison')return `/api/vps/stores/${storeId}/research/comparison?limit=${boundedLimit(args.limit,90)}`;
  throw new Error(`Unknown store tool: ${name}`);
}

export function createJugestMcpHandler({rootDir,judgeMachines=runExistingMachineJudgement,relayDbPath=null,canonicalDbPath=null,analyticsHandler=null}={}){
  if(typeof rootDir!=='string'||!rootDir.trim())throw new TypeError('rootDir is required');
  if(typeof judgeMachines!=='function')throw new TypeError('judgeMachines must be a function');
  const storeAnalytics=typeof analyticsHandler==='function'
    ?analyticsHandler
    :(typeof relayDbPath==='string'&&relayDbPath.trim()&&typeof canonicalDbPath==='string'&&canonicalDbPath.trim()
      ?createAnalyticsHandler({relayDbPath,canonicalDbPath})
      :null);

  return async function jugestMcpHandler(req,res){
    const method=String(req.method||'').toUpperCase();
    if(method!=='POST'){
      sendJson(res,405,rpcError(null,-32600,'MCP endpoint requires POST'));
      return;
    }

    let payload;
    try{
      const text=await readBody(req);
      payload=JSON.parse(text||'null');
    }catch(error){
      if(error?.code==='request_too_large'){
        sendJson(res,413,rpcError(null,-32600,'Request too large'));
        return;
      }
      sendJson(res,400,rpcError(null,-32700,'Parse error'));
      return;
    }

    if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.jsonrpc!=='2.0'||typeof payload.method!=='string'){
      sendJson(res,400,rpcError(payload?.id??null,-32600,'Invalid Request'));
      return;
    }

    const id=payload.id??null;
    const params=payload.params&&typeof payload.params==='object'?payload.params:{};

    if(payload.method==='notifications/initialized'){
      send(res,202,'');
      return;
    }
    if(payload.method==='initialize'){
      sendJson(res,200,rpcResult(id,initializeResult(params)));
      return;
    }
    if(payload.method==='ping'){
      sendJson(res,200,rpcResult(id,{}));
      return;
    }
    if(payload.method==='tools/list'){
      sendJson(res,200,rpcResult(id,{tools:ALL_TOOLS}));
      return;
    }
    if(payload.method==='tools/call'){
      const toolName=String(params?.name||'');
      const args=params?.arguments&&typeof params.arguments==='object'&&!Array.isArray(params.arguments)?params.arguments:{};
      try{
        if(toolName==='judge_machines'){
          if(storeAnalytics)await callAnalytics(storeAnalytics,{path:'/api/vps/stores',headers:req.headers});
          const result=await judgeMachines({rootDir,...args});
          sendJson(res,200,rpcResult(id,toolSuccess(result)));
          return;
        }
        if(STORE_TOOLS.some(tool=>tool.name===toolName)){
          const result=await callAnalytics(storeAnalytics,{path:storeToolPath(toolName,args),headers:req.headers});
          sendJson(res,200,rpcResult(id,toolSuccess(result)));
          return;
        }
        sendJson(res,200,rpcResult(id,toolFailure(new Error(`Unknown tool: ${toolName||'(empty)'}`))));
      }catch(error){
        sendJson(res,200,rpcResult(id,toolFailure(error)));
      }
      return;
    }

    sendJson(res,200,rpcError(id,-32601,'Method not found'));
  };
}

export const __test={
  PROTOCOL_VERSION,MAX_REQUEST_BYTES,SERVER_INFO,SERVER_INSTRUCTIONS,JUDGE_MACHINES_TOOL,STORE_TOOLS,ALL_TOOLS,
  initializeResult,toolSuccess,toolFailure,analyticsAuthHeaders,safeStoreId,safeDate,boundedLimit,callAnalytics,storeToolPath
};
