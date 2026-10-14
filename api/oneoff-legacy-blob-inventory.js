import {createHash,timingSafeEqual} from 'node:crypto';

// One-time, read-only, preview-only inventory. No IDs, payloads, keys or
// credentials are returned or logged. Not merged into any production branch.
const expected=Buffer.from('0e703b42ba6d0fb1b9a788f66e63aff0d7fcb1772fabb75a7d1d98af7649c64e','hex');
const prefix='jugest/juggler-device-sync-v1/';
const deny=(res,status)=>res.status(status).setHeader('Cache-Control','no-store').json({ok:false});
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Robots-Tag','noindex');
 if(process.env.VERCEL_ENV!=='preview'||req.method!=='POST')return deny(res,404);
 const auth=String(req.headers.authorization||'');
 if(!auth.startsWith('Bearer ')||auth.length>256)return deny(res,404);
 const hash=createHash('sha256').update(auth.slice(7)).digest();
 if(!timingSafeEqual(hash,expected))return deny(res,404);
 const counts={heads:0,commits:0,uploads:0,unknown:0,pages:0,complete:false,validHeads:0,invalidHeads:0,unreadableHeads:0,revisionZero:0,revisionPositive:0,positiveRevisionWithPayload:0,zeroRevisionWithoutPayload:0};
 try{
   const {list,get}=await import('@vercel/blob');
   const privateHeadPaths=[];
   let cursor;
   for(let i=0;i<50;i++){
     const response=await list({prefix,limit:1000,...(cursor?{cursor}:{})});
     if(!Array.isArray(response?.blobs))throw new Error('bad_result');
     counts.pages++;
     for(const b of response.blobs){
       const key=String(b.pathname||'');
       if(!key.startsWith(prefix)){counts.unknown++;continue}
       const part=key.slice(prefix.length);
       if(/^sync\/[A-Za-z0-9_-]{12,80}$/.test(part))counts.heads++;privateHeadPaths.push(key);
       else if(/^sync-commit\/[A-Za-z0-9_-]{12,80}\/\d{12}$/.test(part))counts.commits++;
       else if(part.startsWith('sync-upload/'))counts.uploads++;
       else counts.unknown++;
     }
     cursor=response.cursor||undefined;
     if(!cursor){counts.complete=true;break}
   }
   // The preview may inspect aggregates only. Raw IDs, ciphertext, and hashes
   // stay in-memory and are never returned or printed.
   for(const pathname of privateHeadPaths){
     try{
       const reply=await get(pathname,{access:'private',useCache:false});
       if(!reply||reply.statusCode!==200||!reply.stream){counts.unreadableHeads++;continue}
       const txt=await new Response(reply.stream).text();
       let head;try{head=JSON.parse(txt)}catch{counts.invalidHeads++;continue}
       const valid=head&&head.version===1&&Number.isSafeInteger(head.revision)&&head.revision>=0&&
         typeof head.authHash==='string'&&/^[0-9a-f]{64}$/.test(head.authHash)&&
         Number.isFinite(head.createdAt)&&Number.isFinite(head.updatedAt);
       if(!valid){counts.invalidHeads++;continue}
       counts.validHeads++;
       if(head.revision===0){
         counts.revisionZero++;
         if(head.payload===null)counts.zeroRevisionWithoutPayload++;
       }else{
         counts.revisionPositive++;
         const p=head.payload;
         if(p&&p.v===1&&['none','gzip'].includes(p.zip)&&
           typeof p.iv==='string'&&/^[A-Za-z0-9_-]{12,40}$/.test(p.iv)&&
           typeof p.ct==='string'&&/^[A-Za-z0-9_-]+$/.test(p.ct))counts.positiveRevisionWithPayload++;
       }
     }catch{counts.unreadableHeads++}
   }
   return res.status(200).json({ok:true,readOnly:true,...counts});
 }catch(error){
   const status=Number(error?.status||error?.statusCode)||null;
   return res.status(503).json({ok:false,readOnly:true,reason:'storage_read_unavailable',status});
 }
}
