import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src=fs.readFileSync(new URL('../sync-ui.js',import.meta.url),'utf8');
assert.ok(src.includes("const APP_VERSION='4.8.6'"));
assert.ok(src.includes("const STATE_KEY='juggler_tool_state_v33'"));
assert.ok(src.includes("const HANA_KEY='hanaJudgeStateV3'"));
assert.ok(src.includes("const API='/api/sync'"));
assert.ok(src.includes("const EXTERNAL_KEY='externalDays'"));
assert.ok(src.includes("const ANALYSIS_INDEX_KEY='storeAnalysisHistoryIndexV1'"));
assert.ok(src.includes("crypto.subtle.encrypt"),'client-side encryption missing');
assert.ok(src.includes("CompressionStream('gzip')"),'gzip compression missing');
assert.ok(!src.includes('jugglerRelayReceiver:v1'),'Relay auth must not be synchronized');

const sandbox={console,globalThis:null,window:undefined,document:undefined,crypto:globalThis.crypto,Date,Math,JSON,Map,Set,Promise,Number,String,Array,Object,Infinity,NaN,parseInt,isFinite,TextEncoder,TextDecoder,Blob,Response,CompressionStream,DecompressionStream,
  btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary')};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);vm.runInContext(src,sandbox,{timeout:10000});
const a=sandbox.__JUGEST_SYNC_TEST__;
assert.ok(a,'test API missing');

const local={schema:'juggler-device-sync',version:1,sourceDevice:'A',core:{
  shops:[{id:'la',name:'テスト店',savedCoinBase:100,savedCoinBaseUpdatedAt:10}],
  tags:[{id:'ta',name:'前日凹み',active:true,createdAt:1}],
  sessions:[{id:1,_syncId:'A:s1',shopId:'la',tagIds:['ta'],createdAt:10,date:'2026-09-01',playedG:1000}],
  forecasts:[{id:1,shop:'テスト店',targetDate:'2026-09-02',updatedAt:10,rows:[{tableNo:'1'}]}],
  layoutOverrides:[],moveHistory:[],hybridProfiles:{},sections:{}
},externalDays:[{shop:'テスト店',date:'2026-08-31',updatedAt:10,machines:[{tableNo:'1'}]}],analysisSnapshots:[]};
const remote={schema:'juggler-device-sync',version:1,sourceDevice:'B',core:{
  shops:[{id:'rb',name:'テスト店',savedCoinBase:250,savedCoinBaseUpdatedAt:20}],
  tags:[{id:'tb',name:'前日凹み',active:true,createdAt:2}],
  sessions:[{id:1,_syncId:'B:s2',shopId:'rb',tagIds:['tb'],createdAt:20,date:'2026-09-02',playedG:2000}],
  forecasts:[{id:1,shop:'テスト店',targetDate:'2026-09-02',updatedAt:20,rows:[{tableNo:'2'}]}],
  layoutOverrides:[],moveHistory:[],hybridProfiles:{},sections:{}
},externalDays:[
  {shop:'テスト店',date:'2026-08-31',updatedAt:20,machines:[{tableNo:'1'},{tableNo:'2'}]},
  {shop:'テスト店',date:'2026-09-01',updatedAt:30,machines:[{tableNo:'3'}]}
],analysisSnapshots:[]};
const merged=a.mergePackages(local,remote);
assert.equal(merged.core.shops.length,1,'same-name shop must dedupe');
assert.equal(merged.core.shops[0].id,'la','local shop id must stay stable on current device');
assert.equal(merged.core.shops[0].savedCoinBase,250,'newer saved coin base must win');
assert.equal(merged.core.tags.length,1,'same-name tag must dedupe');
assert.equal(merged.core.sessions.length,2,'both device sessions must survive');
assert.ok(merged.core.sessions.every(x=>x.shopId==='la'),'remote session shop id must remap to local shop id');
assert.ok(merged.core.sessions.every(x=>x.tagIds[0]==='ta'),'remote session tag id must remap to local tag id');
assert.equal(new Set(merged.core.sessions.map(x=>x.id)).size,2,'numeric session ids must be collision-free');
assert.equal(merged.core.forecasts.length,1,'same store/date forecast must dedupe');
assert.equal(merged.core.forecasts[0].rows[0].tableNo,'2','newer forecast must win');
assert.equal(merged.externalDays.length,2,'external store days must union');
assert.equal(merged.externalDays.find(x=>x.date==='2026-08-31').machines.length,2,'newer duplicate external day must win');

const link={id:'abcdefghijklmnop',auth:'abcdefghijklmnopqrstuvwxyzABCDE',key:'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQR'};
const code=a.linkCode(link);assert.deepEqual(JSON.parse(JSON.stringify(a.parseCode(code))),link,'share code round trip');

const fn=fs.readFileSync(new URL('../netlify/functions/sync.mjs',import.meta.url),'utf8');
for(const x of ["const STORE_NAME = 'juggler-device-sync-v1'","path: '/api/sync'","action === 'create'","action === 'pull'","action === 'push'",'revision_conflict','authHash: digest(authToken)'])assert.ok(fn.includes(x),'sync server missing '+x);
assert.ok(!fn.includes('encryptionKey'),'server must never receive/store encryption key');

console.log('v4.8.6 device sync regression: ok');
