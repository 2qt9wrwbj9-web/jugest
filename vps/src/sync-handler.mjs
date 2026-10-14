import {createSyncRuntime} from '../../api/_sync-web.js';
import {runWebHandler} from '../../api/_node-web.js';
import {createRelayStore} from './relay-store.mjs';

// Same origin/protocol/encryption as the legacy backend; only storage is injected.
export function createVpsSyncHandler({dbPath}={}){
  if(typeof dbPath!=='string'||!dbPath.trim())throw new TypeError('sync dbPath is required');
  const runtime=createSyncRuntime({createStore:name=>createRelayStore(name,{dbPath})});
  return async(req,res)=>{
    try{
      let body=req.body;
      if(body===undefined&& !['GET','HEAD','OPTIONS'].includes(req.method)){
        const chunks=[];let bytes=0;
        for await(const chunk of req){
          const buf=Buffer.from(chunk);bytes+=buf.length;
          if(bytes>5_700_000)throw Object.assign(new Error('同期データが大きすぎるよ'),{status:413});
          chunks.push(buf);
        }
        body=Buffer.concat(chunks,bytes);
      }
      return await runWebHandler({method:req.method,url:req.url,headers:req.headers,body},res,runtime.default);
    }catch(error){
      res.writeHead(error.status===413?413:500,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
      res.end(JSON.stringify({ok:false,code:'sync_read_failed',message:error.status===413?error.message:'同期データの受信に失敗したよ。保存状態を確認して再試行してね'}));
    }
  };
}
