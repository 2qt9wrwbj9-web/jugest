import assert from 'node:assert/strict';
import {makeBlobStore} from '../api/_blob-store.js';
import {__test as relayTest} from '../api/_relay-web.js';

const db=new Map();let seq=0;
const client={
  async put(path,body,opts={}){if(db.has(path)&&!opts.allowOverwrite){const e=new Error('already exists');e.status=409;throw e}const rec={text:String(body),etag:`e${++seq}`,pathname:path};db.set(path,rec);return rec},
  async get(path){const rec=db.get(path);if(!rec)return null;return{statusCode:200,blob:{etag:rec.etag,pathname:path},stream:new Blob([rec.text]).stream()}},
  async list({prefix='',cursor,limit=1000}={}){const keys=[...db.keys()].filter(k=>k.startsWith(prefix)).sort();const start=cursor?+cursor:0,part=keys.slice(start,start+limit);return{blobs:part.map(pathname=>({pathname})),cursor:start+part.length<keys.length?String(start+part.length):undefined}},
  async del(path){db.delete(path)}
};
const s=makeBlobStore('juggler-relay-v1',client);
const req=new Request('https://preview.vercel.app/api/relay',{method:'POST',headers:{origin:'https://preview.vercel.app'}});
let r=await relayTest.createPair(req,s);assert.equal(r.status,200);const pair=await r.json();assert.match(pair.code,/^\d{6}$/);
r=await relayTest.claimPair(req,s,{code:pair.code});assert.equal(r.status,200);const claimed=await r.json();assert.equal(claimed.channelId,pair.channelId);
r=await relayTest.pairStatus(req,s,{channelId:pair.channelId,receiverToken:pair.receiverToken});assert.equal((await r.json()).linked,true);
const payload={format:'juggler-external-import-bulk',shop:'Test店',days:[{date:'2026-09-06',machines:[{tableNo:'1'}]}]};
r=await relayTest.sendMessage(req,s,{channelId:pair.channelId,senderToken:claimed.senderToken,payload,batchId:'b1',chunkIndex:1,chunkTotal:1});assert.equal(r.status,200);const sent=await r.json();assert.ok(sent.messageId);
r=await relayTest.receiveMessage(req,s,{channelId:pair.channelId,receiverToken:pair.receiverToken});const inbox=await r.json();assert.equal(inbox.count,1);assert.equal(inbox.message.payload.shop,'Test店');
r=await relayTest.ackMessage(req,s,{channelId:pair.channelId,receiverToken:pair.receiverToken,messageId:sent.messageId});assert.equal(r.status,200);
r=await relayTest.receiveMessage(req,s,{channelId:pair.channelId,receiverToken:pair.receiverToken});assert.equal((await r.json()).count,0);
assert.ok([...db.keys()].every(k=>k.startsWith('jugest/juggler-relay-v1/')));
console.log('Vercel native relay behavior PASS');
