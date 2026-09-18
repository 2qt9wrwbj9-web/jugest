import {runExistingMachineJudgement} from './analysis/runtime-adapter.mjs';

const PROTOCOL_VERSION='2025-06-18';
const MAX_REQUEST_BYTES=1024*1024;
const SERVER_INFO=Object.freeze({name:'jugest',version:'6.0.2'});
const SERVER_INSTRUCTIONS='Use judge_machines for live setting judgement from observed machine data only. Do not mix PRE, store-read, store trends, or store priors into the judgement posterior. PRE/store context must be requested and presented separately.';

const JUGGLER_KEYS=Object.freeze(['my','im','go','fk','hp','gg','mr','um']);

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
  annotations:{
    readOnlyHint:true,
    destructiveHint:false,
    idempotentHint:true,
    openWorldHint:false
  }
});

function send(res,status,body='',headers={}){
  const data=Buffer.isBuffer(body)?body:Buffer.from(String(body));
  res.writeHead(status,{'content-length':String(data.length),'cache-control':'no-store','x-content-type-options':'nosniff',...headers});
  res.end(data);
}

function sendJson(res,status,payload){
  send(res,status,JSON.stringify(payload),{'content-type':'application/json; charset=utf-8'});
}

function rpcResult(id,result){return {jsonrpc:'2.0',id:id??null,result}}
function rpcError(id,code,message,data){
  return {jsonrpc:'2.0',id:id??null,error:{code,message,...(data===undefined?{}:{data})}};
}

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
  return {
    content:[{type:'text',text:JSON.stringify(structuredContent)}],
    structuredContent
  };
}

function toolFailure(error){
  const message=String(error?.message??error??'Unknown tool error');
  return {content:[{type:'text',text:message}],isError:true};
}

function initializeResult(params={}){
  const requested=String(params?.protocolVersion||'').trim();
  return {
    protocolVersion:requested||PROTOCOL_VERSION,
    capabilities:{tools:{listChanged:false}},
    serverInfo:SERVER_INFO,
    instructions:SERVER_INSTRUCTIONS
  };
}

export function createJugestMcpHandler({rootDir,judgeMachines=runExistingMachineJudgement}={}){
  if(typeof rootDir!=='string'||!rootDir.trim())throw new TypeError('rootDir is required');
  if(typeof judgeMachines!=='function')throw new TypeError('judgeMachines must be a function');

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
      sendJson(res,200,rpcResult(id,{tools:[JUDGE_MACHINES_TOOL]}));
      return;
    }

    if(payload.method==='tools/call'){
      const toolName=String(params?.name||'');
      if(toolName!=='judge_machines'){
        sendJson(res,200,rpcResult(id,toolFailure(new Error(`Unknown tool: ${toolName||'(empty)'}`))));
        return;
      }
      const args=params?.arguments&&typeof params.arguments==='object'&&!Array.isArray(params.arguments)?params.arguments:{};
      try{
        const result=await judgeMachines({rootDir,...args});
        sendJson(res,200,rpcResult(id,toolSuccess(result)));
      }catch(error){
        sendJson(res,200,rpcResult(id,toolFailure(error)));
      }
      return;
    }

    sendJson(res,200,rpcError(id,-32601,'Method not found'));
  };
}

export const __test={
  PROTOCOL_VERSION,
  MAX_REQUEST_BYTES,
  SERVER_INFO,
  SERVER_INSTRUCTIONS,
  JUDGE_MACHINES_TOOL,
  initializeResult,
  toolSuccess,
  toolFailure
};
