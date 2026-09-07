import zlib from 'node:zlib';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import p0 from '../api/_relay-payload-0.js';
import p1 from '../api/_relay-payload-1.js';
import p2 from '../api/_relay-payload-2.js';
import { patchRelaySource } from '../api/_relay-web.js';

const kv=new Map();
const counts={get:0,setJSON:0,set:0,delete:0,list:0};
const traces={get:[],setJSON:[],set:[],delete:[],list:[]};
const family=key=>String(key||'').split('/').slice(0,2).join('/');
const reset=()=>{Object.keys(counts).forEach(k=>counts[k]=0);Object.keys(traces).forEach(k=>traces[k]=[])};
const snap=()=>({counts:{...counts},families:Object.fromEntries(Object.entries(traces).map(([k,a])=>[k,a.map(family)]))});
const store={
 async get(key,{type}={}){counts.get++;traces.get.push(key);const v=kv.get(key);if(v==null)return null;return type==='json'?JSON.parse(JSON.stringify(v)):v},
 async setJSON(key,val,{onlyIfNew}={}){counts.setJSON++;traces.setJSON.push(key);if(onlyIfNew&&kv.has(key))return{modified:false};kv.set(key,JSON.parse(JSON.stringify(val)));return{modified:true}},
 async set(key,val,{onlyIfNew}={}){counts.set++;traces.set.push(key);if(onlyIfNew&&kv.has(key))return{modified:false};kv.set(key,String(val));return{modified:true}},
 async delete(key){counts.delete++;traces.delete.push(key);kv.delete(key)},
 async list({prefix=''}){counts.list++;traces.list.push(prefix);return{blobs:[...kv.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}},
};
function deterministicRandomInt(min,max){if(max===undefined){max=min;min=0}return max-1}
const packed=zlib.gunzipSync(Buffer.from(p0+p1+p2,'base64')).toString('utf8');
const source=patchRelaySource(packed);
const mod=new Function('createBlobStore','createHash','randomBytes','randomInt','timingSafeEqual',source)(()=>store,createHash,randomBytes,deterministicRandomInt,timingSafeEqual);
const handler=mod.default;
async function call(body){const r=await handler(new Request('https://jugest.vercel.app/api/relay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));return{status:r.status,j:await r.json()}}
function sampleText(date,shop){const [y,m,d]=date.split('-').map(Number);const rows=Array.from({length:10},(_,i)=>`マイジャグラーV\n${601+i}\n2,727\n-94\n11\n7\n0\n1/151.5\n1/247.9\n1/389.6\n1/0.0`).join('\n');return `${y}/${m}/${d}\n${shop}\n全データ一覧\n機種名\n台番号\nG数\n差枚\nBB\nRB\nART\n合成確率\nBB確率\nRB確率\nART確率\n${rows}\n機種別データピックアップ\n`}
const d=new Date(Date.now()+9*60*60*1000);d.setUTCDate(d.getUTCDate()-1);const yesterday=d.toISOString().slice(0,10);
const c=await call({action:'createIosCollector'});
const shop='blob op diagnosis';
const url=`https://ana-slo.com/${yesterday}-blob-op-diagnosis-data/`;
const add=await call({action:'iosCollectorTargetUpsert',channelId:c.j.channelId,receiverToken:c.j.receiverToken,url,startDate:yesterday,shop,priority:2,enabled:true});
reset();
const next=await call({action:'iosCollectorNextV2',collectorKey:c.j.collectorKey});
const nextOps=snap();
const date=String(next.j.url||'').match(/\/(20\d{2}-\d{2}-\d{2})-/)?.[1];
if(!date){console.log('COLLECTOR_BLOB_OPS_DIAG',JSON.stringify({createStatus:c.status,addStatus:add.status,add:add.j,nextStatus:next.status,next:next.j,nextOps}));process.exit(0)}
reset();
const pushed=await call({action:'iosCollectorPushV2',collectorKey:c.j.collectorKey,jobToken:next.j.jobToken,text:sampleText(date,shop),fetchUrl:next.j.url});
const pushOps=snap();
const total={get:nextOps.counts.get+pushOps.counts.get,setJSON:nextOps.counts.setJSON+pushOps.counts.setJSON,set:nextOps.counts.set+pushOps.counts.set,delete:nextOps.counts.delete+pushOps.counts.delete,list:nextOps.counts.list+pushOps.counts.list};
console.log('COLLECTOR_BLOB_OPS',JSON.stringify({nextState:next.j.state,pushState:pushed.j.state,nextOps,pushOps,total}));
