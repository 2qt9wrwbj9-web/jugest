import{activateStoreModel}from'../upstream/vps/src/research/store-read-output.mjs';
import{baselineModel}from'../upstream/vps/src/research/model-search.mjs';
import{loadStoreDays}from'../upstream/vps/src/analysis/store-data.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync,readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openDatabase} from '../upstream/vps/src/db.mjs';
import {migrate} from '../upstream/vps/src/schema.mjs';
import {createRelayStore} from '../upstream/vps/src/relay-store.mjs';
import {createAnalyticsHandler} from '../upstream/vps/src/analytics-handler.mjs';
const require=createRequire(import.meta.url);
const {Miniflare}=await import('miniflare');
const channel='test_channel_12345',other='other_channel_12345';
// Test-only credentials. Never loaded by the product or copied to any deployment DB.
const token='synthetic-test-receiver-token',assistant='jugest_read_synthetic-test-only';
const digest=v=>createHash('sha256').update(v).digest('hex');
const receiver={'x-jugest-channel-id':channel,authorization:`Bearer ${token}`};
async function fixture(){
 assert.ok(existsSync(new URL('../lib/store-read-api.mjs',import.meta.url)),'store read API missing');
 const {handleStoreRead}=await import('../lib/store-read-api.mjs');
 const {createSitesRelayStore}=await import('../lib/storage/relay-store.mjs');
 const dir=mkdtempSync(path.join(tmpdir(),'jugest-port-read-')),canonicalDbPath=path.join(dir,'canonical.sqlite'),relayDbPath=path.join(dir,'relay.sqlite');
 const sqlite=openDatabase(canonicalDbPath);migrate(sqlite);
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'test'},r2Buckets:['BUCKET'],cf:false});
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
 const migrationDir=new URL('../drizzle/',import.meta.url);
 for(const name of readdirSync(migrationDir).filter(x=>x.endsWith('.sql')).sort())for(const statement of readFileSync(new URL(name,migrationDir),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await db.prepare(statement).run();
 async function insert(table,row){const names=Object.keys(row),sql=`INSERT INTO ${table}(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')})`;sqlite.prepare(sql).run(...Object.values(row));await db.prepare(sql).bind(...Object.values(row)).run()}
 const when='2026-01-01T00:00:00.000Z';
 for(const [id,name,metadata]of [['s1','A store',{collectorChannelId:channel}],['s2','B private',{collectorChannelId:other}],['s3','C PIA',{source:'pia-public-ranking-top',visibility:'public'}],['s4','D invalid',[]]])await insert('stores',{id,name,source_metadata_json:JSON.stringify(metadata),created_at:when,updated_at:when});
 for(const date of ['2026-01-01','2026-01-02','2026-01-03'])await insert('store_days',{store_id:'s1',business_date:date,parser_version:'original-parser',quality_status:date.endsWith('03')?'pending':'valid',created_at:when,updated_at:when});
 for(const [key,payload]of [['20',{tableNo:'20',machine:'my',games:5000,bb:20,rb:18,diff:0}],['10',{tableNo:'10',machine:'fk',games:5000,bb:10,rb:18,diff:-100}],['30',null]])await insert('machine_day_data',{store_id:'s1',business_date:'2026-01-02',machine_key:key,payload_json:key==='30'?'{':JSON.stringify(payload)});
 await insert('client_snapshots',{store_id:'s1',snapshot_type:'store-analysis-default',version:'vps-runtime-v1',business_date:'2026-01-02',payload_json:'{"original":{"p4":0.1234567890123456},"rows":[1,2]}',payload_hash:'test-hash',updated_at:when});
 await insert('analysis_receipts',{store_id:'s1',target_date:'2026-01-02',component:'daily',version:'v1',input_hash:'in',output_hash:'out',created_at:when});
 await insert('analysis_refresh_state',{store_id:'s1',analysis_version:'vps-runtime-v1',generation:3,completed_generation:2,updated_at:when});
 const stores=name=>createSitesRelayStore(name,{db,bucket});
 for(const old of [true,false]){
  const factory=name=>old?createRelayStore(name,{dbPath:relayDbPath}):stores(name);
  await factory('juggler-relay-v1').setJSON(`channel/${channel}`,{receiverHash:digest(token),revokedAt:null});
  const record={channelId:channel,tokenHash:digest(assistant),createdAt:1};
  await factory('assistant-read-v1').setJSON(`token/${digest(assistant)}`,record);await factory('assistant-read-v1').setJSON(`channel/${channel}`,record);
 }
 const reference=createAnalyticsHandler({rootDir:fileURLToPath(new URL('../upstream/',import.meta.url)),relayDbPath,canonicalDbPath});
 async function compare(url,headers=receiver,method='GET'){
  const req={url,method,headers},capture={status:0,headers:{},text:'',writeHead(status,headers){this.status=status;this.headers=headers},end(value){this.text=value?.toString()||''}};
  await reference(req,capture);
  const response=await handleStoreRead(new Request(`https://site.test${url}`,{method,headers}),{db,bucket});
  assert.equal(response.status,capture.status,url);assert.equal(response.headers.get('cache-control'),'no-store');
  const text=await response.text();assert.deepEqual(text?JSON.parse(text):'',capture.text?JSON.parse(capture.text):'',url);
  return text?JSON.parse(text):null;
 }
 return {compare,db,bucket,stores,sqlite,relayDbPath,handleStoreRead,async dispose(){sqlite.close();await mf.dispose();rmSync(dir,{recursive:true,force:true})}};
}
test('store API retains original unauthorized, bad method and HEAD behavior',async()=>{const f=await fixture();try{assert.deepEqual(await f.compare('/api/vps/stores',{}),{ok:false,code:'unauthorized'});await f.compare('/api/vps/stores',{},'POST');await f.compare('/api/vps/stores',receiver,'HEAD')}finally{await f.dispose()}});
test('store list and store access preserve channel isolation and default PIA owner denial',async()=>{const f=await fixture();try{const list=await f.compare('/api/vps/stores');assert.deepEqual(list.stores.map(x=>x.id),['s1']);for(const id of ['s2','s3','s4','missing'])await f.compare(`/api/vps/stores/${id}/days`)}finally{await f.dispose()}});
test('saved days preserve valid filter, limit, ascending output and machine ordering',async()=>{const f=await fixture();try{for(const suffix of ['','?limit=1','?limit=0','?limit=-2','?limit=999','?limit=garbage'])await f.compare('/api/vps/stores/s1/days'+suffix);const day=await f.compare('/api/vps/stores/s1/days/2026-01-02');assert.deepEqual(day.day.machines.map(x=>x.tableNo),['10','20']);for(const date of ['2026-01-03','bad','2026-02-30'])await f.compare('/api/vps/stores/s1/days/'+date)}finally{await f.dispose()}});
test('stored analysis, history and pending status preserve exact original fields and precision',async()=>{const f=await fixture();try{for(const suffix of ['analysis/default','analysis/history','status'])await f.compare('/api/vps/stores/s1/'+suffix);const a=await f.compare('/api/vps/stores/s1/analysis/default');assert.equal(a.analysis.original.p4,0.1234567890123456);await f.db.prepare("DELETE FROM client_snapshots").run();f.sqlite.exec('DELETE FROM client_snapshots');await f.compare('/api/vps/stores/s1/analysis/default')}finally{await f.dispose()}});
test('assistant read scope and channel revocation match the original authorization',async()=>{const f=await fixture();try{const headers={authorization:`Bearer ${assistant}`};await f.compare('/api/vps/stores',headers);await f.compare('/api/vps/stores/s1/days/2026-01-02',headers);await f.compare('/api/vps/stores/s1/analysis/default',headers);await f.compare('/api/vps/stores/s1/status',headers);for(const s of [createRelayStore('juggler-relay-v1',{dbPath:f.relayDbPath}),f.stores('juggler-relay-v1')])await s.setJSON(`channel/${channel}`,{receiverHash:digest(token),revokedAt:1});await f.compare('/api/vps/stores',headers);await f.compare('/api/vps/stores')}finally{await f.dispose()}});
test('incremental history reader preserves every original field and never trims the requested history',async()=>{const f=await fixture();try{
 assert.ok(existsSync(new URL('../lib/store-history.mjs',import.meta.url)),'incremental history reader missing');
 const {openStoreHistory}=await import('../lib/store-history.mjs');
 const {loadStoreDays}=await import('../upstream/vps/src/analysis/store-data.mjs');
 for(const limit of [1,180,3660]){const expected=loadStoreDays(f.sqlite,'s1',{limit});const actual=await openStoreHistory(f.db,'s1',{limit}),days=[];for await(const day of actual.days)days.push(day);assert.deepEqual({store:actual.store,days},expected)}
 const stream=await openStoreHistory(f.db,'s1',{limit:180}),iterator=stream.days[Symbol.asyncIterator]();
 assert.equal((await iterator.next()).value.date,'2026-01-01');
 // Proves the second day's payload is fetched on demand, not eagerly retained.
 await f.db.prepare('INSERT INTO machine_day_data VALUES(?,?,?,?)').bind('s1','2026-01-02','99','{"tableNo":"99"}').run();
 assert.equal((await iterator.next()).value.machines.at(-1).tableNo,'99');
}finally{await f.dispose()}});

test('active store-read API matches original snapshot, explanations, legacy audit and assistant scope',async()=>{const f=await fixture();try{
 const model=baselineModel(),days=loadStoreDays(f.sqlite,'s1').days;activateStoreModel(f.sqlite,{storeId:'s1',fingerprint:model.fingerprint,model,featureVersion:'store-features-v1',frontierDate:'2026-01-02',days,nowIso:'2026-01-03T00:00:00.000Z'});
 for(const table of ['active_store_models','store_prediction_snapshots'])for(const row of f.sqlite.prepare('SELECT * FROM '+table).all()){const keys=Object.keys(row);await f.db.prepare('INSERT INTO '+table+'('+keys.join(',')+') VALUES('+keys.map(()=>'?')+')').bind(...keys.map(k=>row[k])).run()}
 const row=f.sqlite.prepare("SELECT * FROM client_snapshots WHERE snapshot_type='store-read-active'").get(),keys=Object.keys(row);await f.db.prepare('INSERT INTO client_snapshots('+keys.join(',')+') VALUES('+keys.map(()=>'?')+')').bind(...keys.map(k=>row[k])).run();const r=await f.compare('/api/vps/stores/s1/research/store-read');assert.equal(r.storeRead.modelFingerprint,model.fingerprint);assert.equal(r.auditEnriched,false);await f.compare('/api/vps/stores/s1/research/store-read',{authorization:'Bearer '+assistant});await f.compare('/api/vps/stores/s2/research/store-read');await f.compare('/api/vps/stores/s1/research/store-read',{});
 const old=JSON.parse(row.payload_json);delete old.explanationVersion;for(const db of [f.sqlite])db.prepare("UPDATE client_snapshots SET payload_json=? WHERE snapshot_type='store-read-active'").run(JSON.stringify(old));await f.db.prepare("UPDATE client_snapshots SET payload_json=? WHERE snapshot_type='store-read-active'").bind(JSON.stringify(old)).run();const audited=await f.compare('/api/vps/stores/s1/research/store-read');assert.equal(audited.auditEnriched,true);assert.equal(audited.storeRead.explanationVersion,'pre-audit-v1');
 }finally{await f.dispose()}});
