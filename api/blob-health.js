import { createBlobStore } from './_blob-store.js';

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const env={
    hasReadWriteToken:!!String(process.env.BLOB_READ_WRITE_TOKEN||'').trim(),
    hasOidcToken:!!String(process.env.VERCEL_OIDC_TOKEN||'').trim(),
    hasStoreId:!!String(process.env.BLOB_STORE_ID||'').trim(),
  };
  try{
    const store=createBlobStore('health');
    await store.get(`probe/nonexistent-${Date.now()}`,{useCache:false});
    return res.status(200).json({ok:true,env});
  }catch(error){
    const status=Number(error?.status||error?.statusCode||error?.response?.status||0)||500;
    return res.status(status>=400&&status<600?status:500).json({ok:false,env,error:String(error?.message||error?.name||'blob_error').slice(0,160)});
  }
}
