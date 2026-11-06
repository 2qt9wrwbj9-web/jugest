import {env} from 'cloudflare:workers';
import {handleStoreRead} from './store-read-api.mjs';
import {handleOwnerView} from './owner-view.mjs';
import {getChatGPTUser} from '../app/chatgpt-auth';

function unavailable(request:Request) {
 const body=JSON.stringify({ok:false,code:'sites_port_not_implemented'});
 return new Response(request.method==='HEAD'?null:body,{status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
async function routeInternal(request:Request){
 const path=new URL(request.url).pathname;
 if(path==='/api/vps/judge/machines'||path==='/api/vps/stores'||path.startsWith('/api/vps/stores/')){
  const bindings=env as typeof env & {DB?:D1Database;BUCKET?:R2Bucket;JUGEST_PIA_ACCESS_MODE?:string;JUGEST_PIA_OWNER_CHANNEL_IDS?:string;JUGEST_OWNER_VIEW?:string;JUGEST_OWNER_USER_ID?:string};
  if(bindings.JUGEST_OWNER_VIEW==='1'){
   const user=import.meta.env.DEV?null:await getChatGPTUser();
   return handleOwnerView(request,{enabled:true,ownerId:bindings.JUGEST_OWNER_USER_ID,userId:user?.userId,db:bindings.DB,bucket:bindings.BUCKET});
  }
  if(import.meta.env.DEV && (env as any).JUGEST_DEV_SESSION==='1'){
   const {readDevelopmentPrincipal}=await import('../dev/session.mjs');
   const principal=await readDevelopmentPrincipal(request,{enabled:true,db:bindings.DB,bucket:bindings.BUCKET});
   if(principal){const headers=new Headers(request.headers);headers.set('x-jugest-channel-id',principal.channelId);headers.set('authorization',`Bearer ${principal.token}`);request=new Request(request.url,{method:request.method,headers,...(!['GET','HEAD'].includes(request.method)?{body:request.body,duplex:'half'}:{} as any)});return handleStoreRead(request,{db:bindings.DB,bucket:bindings.BUCKET,piaAccessMode:'owner',piaOwnerChannelIds:principal.channelId,executionEnabled:true,developmentImports:true}).catch(error=>Response.json({ok:false,code:'development_request_failed',message:String(error.message)},{status:500}))}
  }
  return handleStoreRead(request,{db:bindings.DB,bucket:bindings.BUCKET,piaAccessMode:bindings.JUGEST_PIA_ACCESS_MODE??'owner',piaOwnerChannelIds:bindings.JUGEST_PIA_OWNER_CHANNEL_IDS??''});
 }
 return unavailable(request);
}
async function route(request:Request){try{return await routeInternal(request)}catch(error){if(import.meta.env.DEV)return Response.json({ok:false,code:'development_request_failed',message:String((error as Error).message)},{status:500});throw error}}
export {route as handleSiteStoreRoute};
