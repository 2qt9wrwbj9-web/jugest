import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeBlobStore} from '../api/_blob-store.js';
import {__test as syncTest} from '../api/_sync-web.js';

const db=new Map();let seq=0;
const client={
  async put(path,body,opts={}){if(db.has(path)&&!opts.allowOverwrite){const e=new Error('already exists');e.status=409;throw e}const rec={text:String(body),etag:`e${++seq}`,pathname:path};db.set(path,rec);return rec},
  async get(path){const rec=db.get(path);if(!rec)return null;return{statusCode:200,blob:{etag:rec.etag,pathname:path},stream:new Blob([rec.text]).stream()}},
  async list({prefix='',cursor,limit=1000}={}){const keys=[...db.keys()].filter(k=>k.startsWith(prefix)).sort();const start=cursor?+cursor:0,part=keys.slice(start,start+limit);return{blobs:part.map(pathname=>({pathname})),cursor:start+part.length<keys.length?String(start+part.length):undefined}},
  async del(path){db.delete(path)}
};
const s=makeBlobStore('juggler-device-sync-v1',client);
const syncId='abcdefghijklmnopqr',authToken='A'.repeat(43),digest=x=>createHash('sha256').update(String(x)).digest('hex');
await s.setJSON(`sync/${syncId}`,{version:1,createdAt:1,updatedAt:1,revokedAt:0,revision:0,authHash:digest(authToken),payload:null});
const req=new Request('https://preview.vercel.app/api/sync',{method:'POST',headers:{origin:'https://preview.vercel.app'}});
const payload={v:1,zip:'gzip',iv:'abcdefghijklmnop',ct:'x'.repeat(2_800_000)};
const text=JSON.stringify(payload),chunks=[];for(let i=0;i<text.length;i+=700000)chunks.push(text.slice(i,i+700000));
let r=await syncTest.pushStartSync(req,s,{syncId,authToken,baseRevision:0,totalChunks:chunks.length,totalBytes:text.length});
assert.equal(r.status,200);const start=await r.json();assert.ok(start.uploadId);
for(let i=0;i<chunks.length;i++){r=await syncTest.pushChunkSync(req,s,{syncId,authToken,uploadId:start.uploadId,index:i,totalChunks:chunks.length,chunk:chunks[i]});assert.equal(r.status,200)}
r=await syncTest.pushCommitSync(req,s,{syncId,authToken,uploadId:start.uploadId});assert.equal(r.status,200);assert.equal((await r.json()).revision,1);
r=await syncTest.pullSync(req,s,{syncId,authToken});const meta=await r.json();assert.equal(meta.chunked,true);assert.equal(meta.chunkTotal,chunks.length);assert.equal(meta.payload,undefined);
const pulled=[];for(let i=0;i<meta.chunkTotal;i++){const rr=await syncTest.pullChunkSync(req,s,{syncId,authToken,revision:1,index:i});assert.equal(rr.status,200);pulled.push((await rr.json()).chunk)}
assert.deepEqual(JSON.parse(pulled.join('')),payload);
r=await syncTest.pushStartSync(req,s,{syncId,authToken,baseRevision:0,totalChunks:1,totalBytes:100});assert.equal(r.status,409,'stale base revision must conflict before chunk upload');
console.log('Vercel sync chunk server PASS');
