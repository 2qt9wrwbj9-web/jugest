import {createRelayRuntime} from '../../api/_relay-web.js';
import {runWebHandler} from '../../api/_node-web.js';
import {createRelayStore} from './relay-store.mjs';

const MAX_RELAY_BODY_BYTES=8*1024*1024;

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

function sendRelayError(res,error){
  const status=Number(error?.status)||500;
  const body=Buffer.from(JSON.stringify({ok:false,code:status===413?'payload_too_large':'server_error',message:error?.message||'Collector APIでエラーが起きたよ'}));
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'content-length':String(body.length),
    'cache-control':'no-store'
  });
  res.end(body);
}

export function createVpsRelayHandler({dbPath}={}){
  if(typeof dbPath!=='string'||!dbPath.trim())throw new TypeError('relay dbPath is required');
  const runtime=createRelayRuntime({
    createStore:(name,options={})=>createRelayStore(name,{dbPath,root:options.root||'jugest'})
  });
  return async function vpsRelayHandler(req,res){
    try{
      const body=await readNodeBody(req);
      return await runWebHandler({
        method:req.method,
        url:req.url,
        headers:req.headers,
        body
      },res,runtime.default);
    }catch(error){
      if(!res.headersSent)sendRelayError(res,error);
      else res.destroy(error);
    }
  };
}

export const __test={MAX_RELAY_BODY_BYTES};
