import { createBlobStore } from './_blob-store.js';

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
  let direct;
  try{
    const store=createBlobStore('health');
    await store.get(`probe/nonexistent-${Date.now()}`,{useCache:false});
    direct={ok:true};
  }catch(error){
    direct={ok:false,status:Number(error?.status||error?.statusCode||error?.response?.status||0)||500,error:String(error?.message||error?.name||'blob_error').slice(0,160)};
  }
  const [oldDeployment,currentProduction]=await Promise.all([
    relayProbe('https://jugest-81d94cu0g-cwwvc45jk6-2652.vercel.app/api/relay'),
    relayProbe('https://jugest.vercel.app/api/relay'),
  ]);
  return res.status(200).json({env,direct,oldDeployment,currentProduction});
}
