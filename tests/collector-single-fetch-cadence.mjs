import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import p0 from '../api/_relay-payload-0.js';
import p1 from '../api/_relay-payload-1.js';
import p2 from '../api/_relay-payload-2.js';
import { patchRelaySource } from '../api/_relay-web.js';

const kv = new Map();
const store = {
  async get(key,{type}={}) { const v=kv.get(key); if(v==null)return null; return type==='json'?JSON.parse(JSON.stringify(v)):v; },
  async setJSON(key,val,{onlyIfNew}={}) { if(onlyIfNew&&kv.has(key))return{modified:false}; kv.set(key,JSON.parse(JSON.stringify(val))); return{modified:true}; },
  async set(key,val,{onlyIfNew}={}) { if(onlyIfNew&&kv.has(key))return{modified:false}; kv.set(key,String(val)); return{modified:true}; },
  async delete(key){kv.delete(key)},
  async list({prefix=''}){ return {blobs:[...kv.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}; }
};

function deterministicRandomInt(min,max){
  if(max===undefined){max=min;min=0;}
  return max-1;
}

const packed=zlib.gunzipSync(Buffer.from(p0+p1+p2,'base64')).toString('utf8');
const source=patchRelaySource(packed);
const mod=new Function('createBlobStore','createHash','randomBytes','randomInt','timingSafeEqual',source)(()=>store,createHash,randomBytes,deterministicRandomInt,timingSafeEqual);
const handler=mod.default;

async function call(body){
  const r=await handler(new Request('https://jugest.vercel.app/api/relay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
  return {status:r.status,j:await r.json()};
}

function sampleText(date,shop){
  const [y,m,d]=date.split('-').map(Number);
  const rows=Array.from({length:10},(_,i)=>`マイジャグラーV\n${601+i}\n2,727\n-94\n11\n7\n0\n1/151.5\n1/247.9\n1/389.6\n1/0.0`).join('\n');
  return `${y}/${m}/${d}\n${shop}\n全データ一覧\n機種名\n台番号\nG数\n差枚\nBB\nRB\nART\n合成確率\nBB確率\nRB確率\nART確率\n${rows}\n機種別データピックアップ\n`;
}

const d=new Date(Date.now()+9*60*60*1000);d.setUTCDate(d.getUTCDate()-1);const yesterday=d.toISOString().slice(0,10);
const c=await call({action:'createIosCollector'});
assert.equal(c.status,200);
const shop='single fetch test';
const url=`https://ana-slo.com/${yesterday}-single-fetch-test-data/`;
const add=await call({action:'iosCollectorTargetUpsert',channelId:c.j.channelId,receiverToken:c.j.receiverToken,url,startDate:yesterday,shop,priority:2,enabled:true});
assert.equal(add.status,200);

const seen=new Set();
for(let i=0;i<6;i++){
  const next=await call({action:'iosCollectorNextV2',collectorKey:c.j.collectorKey});
  assert.equal(next.j.state,'RUN',`rapid invocation ${i+1} should issue one job without a 15-minute rate-limit WAIT`);
  assert.ok(Number.isInteger(next.j.waitSeconds),`waitSeconds should be an integer on invocation ${i+1}`);
  assert.ok(next.j.waitSeconds>=0&&next.j.waitSeconds<=30,`waitSeconds should stay within 0..30 seconds, got ${next.j.waitSeconds}`);
  const match=String(next.j.url||'').match(/\/(20\d{2}-\d{2}-\d{2})-/);
  assert.ok(match,`job URL should contain a date: ${next.j.url}`);
  assert.ok(!seen.has(match[1]),`each invocation should advance to a new missing day: ${match[1]}`);
  seen.add(match[1]);
  const pushed=await call({action:'iosCollectorPushV2',collectorKey:c.j.collectorKey,jobToken:next.j.jobToken,text:sampleText(match[1],shop),fetchUrl:next.j.url});
  assert.equal(pushed.status,200,`push failed: ${JSON.stringify(pushed.j)}`);
  assert.equal(pushed.j.state,'SAVED');
}

assert.equal(seen.size,6);
assert.equal(kv.has(`ios-window/${c.j.channelId}`),false,'single-fetch cadence should not create the old 15-minute window state');
console.log('PASS Collector single-fetch cadence uses 0..30s jitter and no 15-minute window limit');
