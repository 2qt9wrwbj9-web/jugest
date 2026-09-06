import { createBlobStore } from './_blob-store.js';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const STORE_NAME='juggler-device-sync-v1';
const MAX_BODY_BYTES=5_700_000,MAX_PAYLOAD_BYTES=4_900_000,SYNC_CHUNK_CHARS=700_000,SYNC_DIRECT_CHARS=2_500_000,SYNC_UPLOAD_TTL_MS=20*60*1000,SYNC_MAX_CHUNKS=16;
function originAllowed(req){const origin=req.headers.get('origin')||'';if(!origin)return true;try{return origin===new URL(req.url).origin}catch{return false}}
const store=()=>createBlobStore(STORE_NAME),now=()=>Date.now(),token=(bytes=32)=>randomBytes(bytes).toString('base64url'),digest=value=>createHash('sha256').update(String(value||'')).digest('hex'),byteLength=value=>Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value),'utf8');
function secureMatch(raw,expectedHash){if(!raw||!expectedHash)return false;const a=Buffer.from(digest(raw),'hex'),b=Buffer.from(String(expectedHash),'hex');return a.length===b.length&&timingSafeEqual(a,b)}
function headers(req){const origin=req.headers.get('origin')||'';let allowed='';try{allowed=originAllowed(req)&&origin?origin:new URL(req.url).origin}catch{}return{'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'}}
function json(req,body,status=200){return new Response(JSON.stringify(body),{status,headers:headers(req)})}
function fail(req,status,message,code='sync_error',extra={}){return json(req,{ok:false,code,message,...extra},status)}
async function readBody(req){const text=await req.text();if(byteLength(text)>MAX_BODY_BYTES)throw Object.assign(new Error('同期データが大きすぎるよ'),{status:413});try{return text?JSON.parse(text):{}}catch{throw Object.assign(new Error('JSONを認識できないよ'),{status:400})}}
function validSyncId(v){return/^[A-Za-z0-9_-]{12,80}$/.test(String(v||''))}
function validPayload(p){if(!p||+p.v!==1)return false;if(!['gzip','none'].includes(String(p.zip||'')))return false;if(!/^[A-Za-z0-9_-]{12,40}$/.test(String(p.iv||'')))return false;if(!/^[A-Za-z0-9_-]+$/.test(String(p.ct||'')))return false;return byteLength(p)<=MAX_PAYLOAD_BYTES}

const syncKey=syncId=>`sync/${syncId}`;
const commitKey=(syncId,revision)=>`sync-commit/${syncId}/${String(revision).padStart(12,'0')}`;
async function getRecord(s,syncId){
  if(!validSyncId(syncId))return null;
  let rec=await s.get(syncKey(syncId),{type:'json',useCache:false});
  if(!rec)return null;
  let advanced=false;
  for(let i=0;i<64;i++){
    const nextRevision=(+rec.revision||0)+1;
    const committed=await s.get(commitKey(syncId,nextRevision),{type:'json',useCache:false});
    if(!committed)break;
    if((+committed.revision||0)!==nextRevision)throw new Error('同期revision履歴が不正だよ');
    rec=committed;advanced=true;
  }
  if(advanced)await s.setJSON(syncKey(syncId),rec);
  return rec;
}
async function authenticate(s,syncId,authToken){const rec=await getRecord(s,syncId);if(!rec||rec.revokedAt||!secureMatch(authToken,rec.authHash))return null;return rec}
async function commitRecord(s,syncId,rec){
  const revision=+rec.revision||0;
  const claim=await s.setJSON(commitKey(syncId,revision),rec,{onlyIfNew:true});
  if(!claim?.modified)return false;
  await s.setJSON(syncKey(syncId),rec);
  return true;
}
async function conflictRevision(s,syncId,fallback){try{return +((await getRecord(s,syncId))?.revision)||fallback}catch{return fallback}}

async function createSync(req,s){for(let i=0;i<10;i++){const syncId=token(18),authToken=token(32),createdAt=now();const rec={version:1,createdAt,updatedAt:createdAt,revokedAt:0,revision:0,authHash:digest(authToken),payload:null};const out=await s.setJSON(syncKey(syncId),rec,{onlyIfNew:true});if(out?.modified)return json(req,{ok:true,syncId,authToken,revision:0,createdAt})}return fail(req,503,'共有領域を作れなかったよ。少し待ってもう一度試してね','create_busy')}
async function pullSync(req,s,body){const rec=await authenticate(s,body.syncId,body.authToken);if(!rec)return fail(req,401,'共有コードが無効だよ。もう一度連携してね','unauthorized');const base={ok:true,revision:+rec.revision||0,updatedAt:+rec.updatedAt||0};if(body.metaOnly)return json(req,base);if(!rec.payload)return json(req,{...base,payload:null});const payloadText=JSON.stringify(rec.payload);if(payloadText.length>SYNC_DIRECT_CHARS)return json(req,{...base,chunked:true,payloadBytes:byteLength(payloadText),chunkTotal:Math.ceil(payloadText.length/SYNC_CHUNK_CHARS)});return json(req,{...base,payload:rec.payload})}
async function pushSync(req,s,body){
  const rec=await authenticate(s,body.syncId,body.authToken);if(!rec)return fail(req,401,'共有コードが無効だよ。もう一度連携してね','unauthorized');
  if(!validPayload(body.payload))return fail(req,400,'暗号化同期データの形式かサイズが不正だよ','bad_payload');
  const current=+rec.revision||0,base=Math.max(0,+body.baseRevision||0);if(base!==current)return fail(req,409,'別端末が先に更新したよ。最新データでもう一度統合してね','revision_conflict',{revision:current});
  const next={...rec,revision:current+1,updatedAt:now(),payload:body.payload};
  if(!await commitRecord(s,body.syncId,next)){const revision=await conflictRevision(s,body.syncId,current+1);return fail(req,409,'別端末が先に更新したよ。最新データでもう一度統合してね','revision_conflict',{revision})}
  return json(req,{ok:true,revision:next.revision,updatedAt:next.updatedAt});
}

function syncUploadPrefix(syncId,uploadId){return`sync-upload/${syncId}/${uploadId}/`}
function syncUploadMetaKey(syncId,uploadId){return`${syncUploadPrefix(syncId,uploadId)}meta`}
function syncUploadChunkKey(syncId,uploadId,index){return`${syncUploadPrefix(syncId,uploadId)}chunk-${String(index).padStart(3,'0')}`}
function validUploadId(v){return/^[A-Za-z0-9_-]{12,80}$/.test(String(v||''))}
async function cleanupSyncUpload(s,syncId,uploadId){if(!validSyncId(syncId)||!validUploadId(uploadId))return;try{const{blobs}=await s.list({prefix:syncUploadPrefix(syncId,uploadId)});await Promise.all(blobs.map(x=>s.delete(x.key)))}catch{}}
async function pushStartSync(req,s,body){const rec=await authenticate(s,body.syncId,body.authToken);if(!rec)return fail(req,401,'共有コードが無効だよ。もう一度連携してね','unauthorized');const current=+rec.revision||0,base=Math.max(0,+body.baseRevision||0);if(base!==current)return fail(req,409,'別端末が先に更新したよ。最新データでもう一度統合してね','revision_conflict',{revision:current});const totalChunks=Math.max(0,+body.totalChunks||0),totalBytes=Math.max(0,+body.totalBytes||0);if(!Number.isInteger(totalChunks)||totalChunks<1||totalChunks>SYNC_MAX_CHUNKS||totalBytes<1||totalBytes>MAX_PAYLOAD_BYTES)return fail(req,400,'同期チャンク情報が不正だよ','bad_chunk_meta');const uploadId=token(12),createdAt=now();await s.setJSON(syncUploadMetaKey(body.syncId,uploadId),{version:1,syncId:body.syncId,uploadId,baseRevision:base,totalChunks,totalBytes,createdAt,expiresAt:createdAt+SYNC_UPLOAD_TTL_MS},{onlyIfNew:true});return json(req,{ok:true,uploadId,totalChunks,totalBytes,expiresAt:createdAt+SYNC_UPLOAD_TTL_MS})}
async function pushChunkSync(req,s,body){const rec=await authenticate(s,body.syncId,body.authToken);if(!rec)return fail(req,401,'共有コードが無効だよ。もう一度連携してね','unauthorized');const uploadId=String(body.uploadId||'');if(!validUploadId(uploadId))return fail(req,400,'同期アップロードIDが不正だよ','bad_upload_id');const meta=await s.get(syncUploadMetaKey(body.syncId,uploadId),{type:'json',useCache:false});if(!meta||+meta.expiresAt<=now()){if(meta)await cleanupSyncUpload(s,body.syncId,uploadId);return fail(req,410,'同期アップロードの有効期限が切れたよ','upload_expired')}const index=+body.index,chunk=String(body.chunk??'');if(!Number.isInteger(index)||index<0||index>=+meta.totalChunks||!chunk||byteLength(chunk)>SYNC_CHUNK_CHARS)return fail(req,400,'同期チャンクが不正だよ','bad_chunk');await s.setJSON(syncUploadChunkKey(body.syncId,uploadId,index),{index,chunk});return json(req,{ok:true,index})}
async function pushCommitSync(req,s,body){
  const rec=await authenticate(s,body.syncId,body.authToken);if(!rec)return fail(req,401,'共有コードが無効だよ。もう一度連携してね','unauthorized');const uploadId=String(body.uploadId||'');if(!validUploadId(uploadId))return fail(req,400,'同期アップロードIDが不正だよ','bad_upload_id');
  const meta=await s.get(syncUploadMetaKey(body.syncId,uploadId),{type:'json',useCache:false});if(!meta||+meta.expiresAt<=now()){if(meta)await cleanupSyncUpload(s,body.syncId,uploadId);return fail(req,410,'同期アップロードの有効期限が切れたよ','upload_expired')}
  const current=+rec.revision||0;if(+meta.baseRevision!==current){await cleanupSyncUpload(s,body.syncId,uploadId);return fail(req,409,'別端末が先に更新したよ。最新データでもう一度統合してね','revision_conflict',{revision:current})}
  const chunks=[];for(let i=0;i<+meta.totalChunks;i++){const part=await s.get(syncUploadChunkKey(body.syncId,uploadId,i),{type:'json',useCache:false});if(!part||+part.index!==i||typeof part.chunk!=='string')return fail(req,409,'同期チャンクがまだ揃ってないよ','upload_incomplete',{index:i});chunks.push(part.chunk)}
  const payloadText=chunks.join('');if(byteLength(payloadText)!==+meta.totalBytes)return fail(req,400,'同期チャンクのサイズが一致しないよ','chunk_size_mismatch');let payload;try{payload=JSON.parse(payloadText)}catch{return fail(req,400,'同期チャンクをJSONとして復元できないよ','bad_chunk_json')}if(!validPayload(payload))return fail(req,400,'暗号化同期データの形式かサイズが不正だよ','bad_payload');
  const next={...rec,revision:current+1,updatedAt:now(),payload};
  if(!await commitRecord(s,body.syncId,next)){await cleanupSyncUpload(s,body.syncId,uploadId);const revision=await conflictRevision(s,body.syncId,current+1);return fail(req,409,'別端末が先に更新したよ。最新データでもう一度統合してね','revision_conflict',{revision})}
  await cleanupSyncUpload(s,body.syncId,uploadId);return json(req,{ok:true,revision:next.revision,updatedAt:next.updatedAt});
}
async function pullChunkSync(req,s,body){const rec=await authenticate(s,body.syncId,body.authToken);if(!rec)return fail(req,401,'共有コードが無効だよ。もう一度連携してね','unauthorized');const revision=Math.max(0,+body.revision||0),current=+rec.revision||0;if(revision!==current)return fail(req,409,'同期中にクラウドデータが更新されたよ。もう一度同期してね','revision_conflict',{revision:current});if(!rec.payload)return fail(req,404,'同期データがまだないよ','payload_missing');const text=JSON.stringify(rec.payload),total=Math.ceil(text.length/SYNC_CHUNK_CHARS),index=+body.index;if(!Number.isInteger(index)||index<0||index>=total)return fail(req,400,'同期チャンク番号が不正だよ','bad_chunk_index');return json(req,{ok:true,revision:current,index,totalChunks:total,chunk:text.slice(index*SYNC_CHUNK_CHARS,(index+1)*SYNC_CHUNK_CHARS)})}

export default async req=>{if(req.method==='OPTIONS')return new Response('',{status:204,headers:headers(req)});if(req.method!=='POST')return fail(req,405,'POSTで呼んでね','method_not_allowed');const origin=req.headers.get('origin')||'';if(origin&&!originAllowed(req))return fail(req,403,'このページからは同期APIを使えないよ','origin_denied');try{const body=await readBody(req),action=String(body.action||''),s=store();if(action==='create')return await createSync(req,s);if(action==='pull')return await pullSync(req,s,body);if(action==='pullChunk')return await pullChunkSync(req,s,body);if(action==='push')return await pushSync(req,s,body);if(action==='pushStart')return await pushStartSync(req,s,body);if(action==='pushChunk')return await pushChunkSync(req,s,body);if(action==='pushCommit')return await pushCommitSync(req,s,body);return fail(req,400,'同期APIの操作を認識できないよ','bad_action')}catch(e){console.error('[juggler-sync]',e);return fail(req,+e?.status||500,e?.message||'同期APIでエラーが起きたよ','server_error')}};
export const config={path:'/api/sync',rateLimit:{windowLimit:60,windowSize:60,aggregateBy:['ip','domain']}};
export const __test={pullSync,pushSync,pullChunkSync,pushStartSync,pushChunkSync,pushCommitSync,validPayload};
