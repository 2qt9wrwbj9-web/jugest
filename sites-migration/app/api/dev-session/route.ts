import {env} from 'cloudflare:workers';
async function route(request:Request){
 if(import.meta.env.DEV && (env as any).JUGEST_DEV_SESSION==='1' && (env as any).JUGEST_OWNER_VIEW!=='1'){
  const {handleDevelopmentSession}=await import('../../../dev/session.mjs');
  return handleDevelopmentSession(request,{enabled:true,db:(env as any).DB,bucket:(env as any).BUCKET});
 }
 return new Response('Not Found',{status:404,headers:{'cache-control':'no-store'}});
}
export const GET=route;export const POST=route;
