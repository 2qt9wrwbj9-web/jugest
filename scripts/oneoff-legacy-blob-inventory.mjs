// One-off read-only Vercel Preview build audit.
// Never print account IDs, sync IDs, tokens, record values, or blob pathnames.
// This file exists only on the disposable audit branch; not a production endpoint.
const prefix='jugest/juggler-device-sync-v1/';
const result={scope:'legacy-sync-prefix',readOnly:true,permission:'unknown',
  syncHeads:0,commitObjects:0,transientUploads:0,unexpected:0,other:0,
  pages:0,exhaustive:false};
if(process.env.VERCEL_ENV!=='preview'){
 console.log('[legacy-sync-inventory]',JSON.stringify({...result,skipped:'not_preview'}));
}else{
 const tokenPresent=Boolean(process.env.BLOB_READ_WRITE_TOKEN);
 if(!tokenPresent){
  console.log('[legacy-sync-inventory]',JSON.stringify({...result,skipped:'no_blob_token_in_build_context'}));
 }else{
  try{
   const {list}=await import('@vercel/blob');
   let cursor,done=false;
   const limitPages=100;
   for(let pageNo=0;pageNo<limitPages;pageNo++){
    const page=await list({prefix,limit:1000,...(cursor?{cursor}:{})});
    if(!page||!Array.isArray(page.blobs))throw Error('invalid_list_response');
    result.pages++;
    for(const object of page.blobs){
      const key=String(object.pathname??'');
      if(!key.startsWith(prefix)){result.unexpected++;continue}
      const part=key.slice(prefix.length);
      if(/^sync\/[A-Za-z0-9_-]{12,80}$/.test(part))result.syncHeads++;
      else if(/^sync-commit\/[A-Za-z0-9_-]{12,80}\/\d{12}$/.test(part))result.commitObjects++;
      else if(part.startsWith('sync-upload/'))result.transientUploads++;
      else result.other++;
    }
    cursor=page.cursor||undefined;
    if(!cursor){done=true;break}
   }
   result.exhaustive=done;
   result.permission='list_succeeded';
   console.log('[legacy-sync-inventory]',JSON.stringify(result));
  }catch(error){
   console.log('[legacy-sync-inventory]',JSON.stringify({...result,permission:'list_failed',errorName:String(error?.name??'unknown').slice(0,60),httpStatus:Number(error?.status||error?.statusCode)||null}));
  }
 }
}
