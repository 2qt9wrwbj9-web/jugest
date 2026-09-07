import { createBlobStore } from './_blob-store.js';
import { issueSignedToken, presignUrl } from '@vercel/blob';

function errInfo(error){
  return{status:Number(error?.status||error?.statusCode||error?.response?.status||0)||500,name:String(error?.name||''),code:String(error?.code||''),error:String(error?.message||'blob_error').slice(0,180)};
}
async function relayProbe(url){
  try{
    const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'pairStatus',channelId:'00000000000000000000000000000000',receiverToken:'0000000000000000000000000000000000000000000000000000000000000000'})});
    const text=(await r.text()).slice(0,180);
    return{status:r.status,text};
  }catch(error){return{status:0,text:String(error?.message||error).slice(0,180)}}
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const env={
    hasReadWriteToken:!!String(process.env.BLOB_READ_WRITE_TOKEN||'').trim(),
    hasOidcToken:!!String(process.env.VERCEL_OIDC_TOKEN||'').trim(),
    hasStoreId:!!String(process.env.BLOB_STORE_ID||'').trim(),
  };
  const store=createBlobStore('health'),direct={};
  try{await store.get(`probe/nonexistent-${Date.now()}`,{useCache:false});direct.get={ok:true}}catch(error){direct.get={ok:false,...errInfo(error)}}
  try{await store.list({prefix:'probe/nonexistent/'});direct.list={ok:true}}catch(error){direct.list={ok:false,...errInfo(error)}}
  try{
    const pathname=`jugest/health/probe/nonexistent-${Date.now()}`;
    const signed=await issueSignedToken({pathname,operations:['get'],validUntil:Date.now()+5*60*1000});
    const {presignedUrl}=await presignUrl(signed,{operation:'get',pathname,access:'private',validUntil:Date.now()+60*1000,useCache:false});
    const r=await fetch(presignedUrl);
    direct.presignedGet={ok:r.status===404,status:r.status};
  }catch(error){direct.presignedGet={ok:false,...errInfo(error)}}
  const [oldDeployment,currentProduction]=await Promise.all([
    relayProbe('https://jugest-81d94cu0g-cwwvc45jk6-2652.vercel.app/api/relay'),
    relayProbe('https://jugest.vercel.app/api/relay'),
  ]);
  return res.status(200).json({env,direct,oldDeployment,currentProduction});
}
