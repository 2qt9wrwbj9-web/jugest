import {judgeJugglerMachines,JUGGLER_MACHINE_CATALOG} from './juggler-judge.mjs';

const SERVER_INFO=Object.freeze({name:'jugest',version:'6.0.2-mcp-v1'});
const SUPPORTED_PROTOCOLS=new Set(['2025-11-25','2025-06-18','2025-03-26']);
const DEFAULT_PROTOCOL='2025-11-25';
const MAX_BODY_BYTES=1024*1024;
const MAX_BATCH=250;

export const MCP_INSTRUCTIONS='JUGESTはパチスロ判別・店舗分析基盤。設定判別は原則として目の前の当日・観測データ（G/BB/RB/差枚）のみで行う。店舗名が分かっていてもPRE v2や店読みを設定確率へ自動で混ぜない。PRE/店舗傾向はユーザーが求めた時に別情報として取得・説明する。スクリーンショットはモデル側で数値化し、設定確率の計算はjudge_machinesを使う。';

function send(res,status,payload=null,headers={}){
  if(payload===null){res.writeHead(status,{'cache-control':'no-store',...headers});res.end();return;}
  const body=Buffer.from(typeof payload==='string'?payload:JSON.stringify(payload));
  res.writeHead(status,{'content-type':typeof payload==='string'?'text/plain; charset=utf-8':'application/json; charset=utf-8','content-length':String(body.length),'cache-control':'no-store','x-content-type-options':'nosniff',...headers});
  res.end(body);
}
function rpcResult(id,result){return{jsonrpc:'2.0',id,result};}
function rpcError(id,code,message,data){const error={code,message};if(data!==undefined)error.data=data;return{jsonrpc:'2.0',id,error};}
function textResult(text,{structuredContent=null,isError=false}={}){const out={content:[{type:'text',text:String(text)}],isError};if(structuredContent!==null)out.structuredContent=structuredContent;return out;}
function toolError(message){return textResult(message,{isError:true});}

async function readJsonBody(req){
  let size=0,chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY_BYTES)throw Object.assign(new Error('request_too_large'),{statusCode:413});chunks.push(chunk);}
  const text=Buffer.concat(chunks).toString('utf8');
  if(!text)throw Object.assign(new Error('empty_request'),{statusCode:400});
  try{return JSON.parse(text)}catch{throw Object.assign(new Error('invalid_json'),{statusCode:400});}
}

const READ_ONLY_ANNOTATIONS=Object.freeze({readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false});

const TOOLS=Object.freeze([
  {
    name:'judge_machines',
    title:'JUGEST 設定判別',
    description:'ジャグラーの目の前の実績データ（G / BB / RB / 任意の差枚）だけを使い、JUGEST既存判別式で1〜250台を一括判別する。PRE v2・店舗傾向・店読みは混ぜない。スクリーンショットから抽出した数値の判別にも使う。',
    inputSchema:{type:'object',additionalProperties:false,required:['machines'],properties:{machines:{type:'array',minItems:1,maxItems:MAX_BATCH,items:{type:'object',additionalProperties:true,required:['machine','games','bb','rb'],properties:{tableNo:{type:['string','number']},machine:{type:'string',description:`機種キーまたは機種名。対応: ${JUGGLER_MACHINE_CATALOG.map(x=>`${x.key}=${x.name}`).join(', ')}`},games:{type:'number',exclusiveMinimum:0},bb:{type:'number',minimum:0},rb:{type:'number',minimum:0},diff:{type:['number','null'],description:'実差枚。不明なら省略またはnull'}}}}}},
    annotations:READ_ONLY_ANNOTATIONS
  },
  {
    name:'list_stores',title:'JUGEST 店舗一覧',description:'認証されたJUGESTアカウント/チャンネルに保存済みの店舗一覧と最新データ日を取得する。設定判別には自動利用しない。',
    inputSchema:{type:'object',additionalProperties:false,properties:{}},annotations:READ_ONLY_ANNOTATIONS
  },
  {
    name:'get_store_day',title:'JUGEST 店舗日別データ',description:'指定店舗・指定日の保存済み全台データを取得する。過去データ参照用で、judge_machinesの設定確率へ自動混合しない。',
    inputSchema:{type:'object',additionalProperties:false,required:['storeId','date'],properties:{storeId:{type:'string'},date:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'}}},annotations:READ_ONLY_ANNOTATIONS
  },
  {
    name:'get_store_prediction',title:'JUGEST PRE v2 店舗予測',description:'指定店舗の保存済みPRE v2/store-read予測・説明を取得する。目の前の設定判別とは別枠の店読み情報として扱う。',
    inputSchema:{type:'object',additionalProperties:false,required:['storeId'],properties:{storeId:{type:'string'}}},annotations:READ_ONLY_ANNOTATIONS
  },
  {
    name:'get_store_comparison',title:'JUGEST 予測比較',description:'指定店舗のPRE/旧方式/履歴比較など、JUGESTに保存された比較結果を取得する。',
    inputSchema:{type:'object',additionalProperties:false,required:['storeId'],properties:{storeId:{type:'string'},limit:{type:'integer',minimum:1,maximum:366,default:90}}},annotations:READ_ONLY_ANNOTATIONS
  }
]);

function validateRpc(message){return message&&message.jsonrpc==='2.0'&&typeof message.method==='string';}
function negotiateProtocol(requested){return SUPPORTED_PROTOCOLS.has(String(requested||''))?String(requested):DEFAULT_PROTOCOL;}

function currentDataJudgement(args){
  const machines=args?.machines;
  if(!Array.isArray(machines)||machines.length<1)return toolError('machines は1台以上必要');
  if(machines.length>MAX_BATCH)return toolError(`一度に判別できるのは最大${MAX_BATCH}台`);
  try{
    const judged=judgeJugglerMachines(machines);
    const structuredContent={mode:'current_data_only',preIncluded:false,storeTendencyIncluded:false,machineCount:judged.length,machines:judged};
    return textResult(`${judged.length}台をJUGESTの目の前データ判別で処理した。PRE v2・店読みは未使用。`,{structuredContent});
  }catch(error){return toolError(String(error?.message??error));}
}

async function callStoreTool(name,args,storeService,req){
  if(!storeService)return toolError('store_data_unavailable');
  try{
    const auth=await storeService.authenticate?.(req);
    if(!auth)return toolError('authentication_required');
    let data;
    if(name==='list_stores')data=await storeService.listStores(auth);
    else if(name==='get_store_day')data=await storeService.getStoreDay(auth,args?.storeId,args?.date);
    else if(name==='get_store_prediction')data=await storeService.getStorePrediction(auth,args?.storeId);
    else if(name==='get_store_comparison')data=await storeService.getStoreComparison(auth,args?.storeId,args?.limit);
    else return toolError('unknown_store_tool');
    return textResult(`${name} completed`,{structuredContent:data});
  }catch(error){return toolError(String(error?.code??error?.message??error));}
}

export function createMcpHandler({storeService=null}={}){
  return async function mcpHandler(req,res){
    if(String(req.method||'GET').toUpperCase()!=='POST'){send(res,405,'Method Not Allowed\n',{'allow':'POST'});return;}
    if(String(req.headers?.['mcp-protocol-version']||'')==='2026-07-28'){
      // v1 intentionally serves the widely supported initialize-era Streamable HTTP path.
      // Returning a plain 400 lets dual-era clients fall back to initialize negotiation.
      send(res,400,'MCP protocol 2026-07-28 is not enabled on this endpoint yet\n');return;
    }
    let message;
    try{message=await readJsonBody(req);}catch(error){send(res,error?.statusCode||400,rpcError(null,-32700,String(error?.message??'invalid_json')));return;}
    if(!validateRpc(message)){send(res,400,rpcError(message?.id??null,-32600,'Invalid Request'));return;}
    const id=message.id??null,method=message.method,params=message.params??{};
    if(method==='notifications/initialized'){
      send(res,202,null);return;
    }
    if(id===null){send(res,202,null);return;}
    if(method==='initialize'){
      const protocolVersion=negotiateProtocol(params?.protocolVersion);
      send(res,200,rpcResult(id,{protocolVersion,capabilities:{tools:{listChanged:false}},serverInfo:SERVER_INFO,instructions:MCP_INSTRUCTIONS}));return;
    }
    if(method==='ping'){send(res,200,rpcResult(id,{}));return;}
    if(method==='tools/list'){
      send(res,200,rpcResult(id,{tools:TOOLS}));return;
    }
    if(method==='tools/call'){
      const name=String(params?.name||''),args=params?.arguments??{};
      let result;
      if(name==='judge_machines')result=currentDataJudgement(args);
      else if(['list_stores','get_store_day','get_store_prediction','get_store_comparison'].includes(name))result=await callStoreTool(name,args,storeService,req);
      else result=toolError(`unknown_tool: ${name||'(empty)'}`);
      send(res,200,rpcResult(id,result));return;
    }
    send(res,200,rpcError(id,-32601,'Method not found'));
  };
}

export const __test={TOOLS,SERVER_INFO,SUPPORTED_PROTOCOLS,MAX_BATCH,currentDataJudgement,negotiateProtocol};
