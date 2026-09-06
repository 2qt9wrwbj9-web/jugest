import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import p0 from '../api/_relay-payload-0.js';
import p1 from '../api/_relay-payload-1.js';
import p2 from '../api/_relay-payload-2.js';
import { patchRelaySource } from '../api/_relay-web.js';

const kv=new Map();
const store={
  async get(key,{type}={}){const v=kv.get(key);if(v==null)return null;return type==='json'?JSON.parse(JSON.stringify(v)):v},
  async setJSON(key,val,{onlyIfNew}={}){if(onlyIfNew&&kv.has(key))return{modified:false};kv.set(key,JSON.parse(JSON.stringify(val)));return{modified:true}},
  async set(key,val,{onlyIfNew}={}){if(onlyIfNew&&kv.has(key))return{modified:false};kv.set(key,String(val));return{modified:true}},
  async delete(key){kv.delete(key)},
  async list({prefix=''}){return{blobs:[...kv.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}}
};
const packed=zlib.gunzipSync(Buffer.from(p0+p1+p2,'base64')).toString('utf8');
const source=patchRelaySource(packed);
const mod=new Function('createBlobStore','createHash','randomBytes','randomInt','timingSafeEqual',source)(()=>store,createHash,randomBytes,randomInt,timingSafeEqual);
const handler=mod.default;
async function call(body){const r=await handler(new Request('https://jugest.vercel.app/api/relay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));return{status:r.status,j:await r.json()}}
function addDays(date,n){const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
const d=new Date(Date.now()+9*60*60*1000);d.setUTCDate(d.getUTCDate()-1);const yesterday=d.toISOString().slice(0,10),previous=addDays(yesterday,-1),third=addDays(yesterday,-2);

const c=await call({action:'createIosCollector'});assert.equal(c.status,200);
const add=await call({action:'iosCollectorTargetUpsert',channelId:c.j.channelId,receiverToken:c.j.receiverToken,url:`https://ana-slo.com/${yesterday}-coverage-test-data/`,startDate:yesterday,shop:'Coverage店',priority:2,enabled:true});
assert.equal(add.status,200);const sourceStoreId=add.j.store.sourceStoreId;

const before=await call({action:'collectorStatus',channelId:c.j.channelId,receiverToken:c.j.receiverToken,sinceRevision:0});
const beforeMissing=before.j.iosTargets.find(x=>x.sourceStoreId===sourceStoreId).missingDays;
const synced=await call({action:'collectorStatus',channelId:c.j.channelId,receiverToken:c.j.receiverToken,sinceRevision:0,localCoverage:[{shop:'Coverage店',dates:[yesterday,previous]}]});
assert.equal(synced.status,200);
const afterMissing=synced.j.iosTargets.find(x=>x.sourceStoreId===sourceStoreId).missingDays;
assert.equal(afterMissing,beforeMissing-2,'dates already stored in JUGEST must not count as Collector gaps');
assert.equal(synced.j.pending,0,'local coverage metadata must not become pending Collector payloads');

const next=await call({action:'iosCollectorNextV2',collectorKey:c.j.collectorKey});
assert.equal(next.j.state,'RUN');
assert.ok(String(next.j.url).includes(third),`Collector must skip locally-held ${yesterday} and ${previous}: ${next.j.url}`);

const requeue=await call({action:'iosCollectorRequeueDate',channelId:c.j.channelId,receiverToken:c.j.receiverToken,sourceStoreId,date:yesterday});
assert.equal(requeue.status,200);
const forced=await call({action:'iosCollectorNextV2',collectorKey:c.j.collectorKey});
assert.equal(forced.j.state,'RUN');
assert.ok(String(forced.j.url).includes(yesterday),'manual requeue must override local coverage and force a fresh fetch');
console.log('PASS Collector skips local JUGEST dates while preserving manual requeue');
