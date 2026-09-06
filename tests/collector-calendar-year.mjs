import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
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
const packed=zlib.gunzipSync(Buffer.from(p0+p1+p2,'base64')).toString('utf8');
const source=patchRelaySource(packed);
const mod=new Function('createBlobStore','createHash','randomBytes','randomInt','timingSafeEqual',source)(()=>store,createHash,randomBytes,randomInt,timingSafeEqual);
const handler=mod.default;

async function call(body){
  const r=await handler(new Request('https://jugest.vercel.app/api/relay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
  return {status:r.status,j:await r.json()};
}
function addDays(date,n){const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
const d=new Date(Date.now()+9*60*60*1000);d.setUTCDate(d.getUTCDate()-1);const yesterday=d.toISOString().slice(0,10);const previous=addDays(yesterday,-1);const [y,m,day]=yesterday.split('-');

const c=await call({action:'createIosCollector'});
assert.equal(c.status,200);
const url=`https://ana-slo.com/${yesterday}-calendar-test-data/`;
const add=await call({action:'iosCollectorTargetUpsert',channelId:c.j.channelId,receiverToken:c.j.receiverToken,url,startDate:yesterday,shop:'calendar test',priority:2,enabled:true});
assert.equal(add.status,200);

const first=await call({action:'iosCollectorNextV2',collectorKey:c.j.collectorKey});
assert.equal(first.j.state,'RUN');
assert.ok(first.j.url.includes(yesterday));

const text=`${y}/${+m}/${+day}\ncalendar test\n全データ一覧\n機種名\n台番号\nG数\n差枚\nBB\nRB\nART\n合成確率\nBB確率\nRB確率\nART確率\nマイジャグラーV\n601\n2,727\n-94\n11\n7\n0\n1/151.5\n1/247.9\n1/389.6\n1/0.0\n機種別データピックアップ\n`;
const pushed=await call({action:'iosCollectorPushV2',collectorKey:c.j.collectorKey,jobToken:first.j.jobToken,text,fetchUrl:first.j.url});
assert.equal(pushed.status,200);
assert.equal(pushed.j.state,'SAVED');

const second=await call({action:'iosCollectorNextV2',collectorKey:c.j.collectorKey});
assert.equal(second.j.state,'RUN','取得開始日が昨日でも、過去1年の未取得日を自動で遡ってRUNにする');
assert.ok(second.j.url.includes(previous),`次の未取得日 ${previous} を取得する: ${second.j.url}`);
console.log('PASS Collector calendar-year scheduling ignores manual startDate and walks backward');
