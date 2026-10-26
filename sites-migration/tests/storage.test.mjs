import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {createRelayStore} from '../../vps/src/relay-store.mjs';
const require=createRequire(import.meta.url);
const {Miniflare}=await import(require.resolve('miniflare'));
async function fixture(){
 assert.ok(existsSync(new URL('../relay-store.mjs',import.meta.url)),'storage adapter missing');
 const {createSitesRelayStore}=await import('../relay-store.mjs');
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'test'},r2Buckets:['BUCKET'],cf:false});
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
 await db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8').replaceAll('\n',' '));
 return {mf,db,bucket,store:createSitesRelayStore('test',{db,bucket}),createSitesRelayStore};
}
test('same sequential results as original SQLite store, including malformed JSON and namespace isolation',async()=>{
 const f=await fixture();try{
 const old=createRelayStore('test',{dbPath:':memory:'});
 for(const s of [old,f.store]){await s.setJSON('a',{value:1});await s.setJSON('a',{value:2},{ifMatch:'"r1"'});await s.set('bad','{');}
 for(const key of ['a','bad','missing'])assert.deepEqual(await f.store.get(key,{type:'json'}),await old.get(key,{type:'json'}));
 assert.deepEqual(await f.store.getWithMetadata('a'),await old.getWithMetadata('a'));
 await assert.rejects(f.store.set('a','stale',{ifMatch:'"r1"'}),{code:'precondition_failed'});
 assert.deepEqual(await f.store.setJSON('a',{}, {onlyIfNew:true}),{modified:false});
 assert.equal(await f.createSitesRelayStore('other',{db:f.db,bucket:f.bucket}).get('a'),null);
 }finally{await f.mf.dispose()}
});
test('only one concurrent creator and one concurrent conditional writer win; loser cannot overwrite',async()=>{
 const f=await fixture();try{
 const created=await Promise.all(Array.from({length:8},(_,i)=>f.store.setJSON('race',{i},{onlyIfNew:true})));
 assert.equal(created.filter(x=>x.modified).length,1);
 const updated=await Promise.allSettled(Array.from({length:8},(_,i)=>f.store.setJSON('race',{i},{ifMatch:'"r1"'})));
 assert.equal(updated.filter(x=>x.status==='fulfilled').length,1);
 assert.equal((await f.store.getWithMetadata('race')).etag,'"r2"');
 }finally{await f.mf.dispose()}
});
test('5MB values live in R2; failed R2 write and failed D1 publication preserve previous value',async()=>{
 const f=await fixture();try{
 const value={text:'あ'.repeat(1700000)};await f.store.setJSON('large',value);
 assert.deepEqual(await f.store.get('large',{type:'json'}),value);
 const failBucket={get:(...a)=>f.bucket.get(...a),put:async()=>{throw Error('injected R2 failure')}};
 await assert.rejects(f.createSitesRelayStore('test',{db:f.db,bucket:failBucket}).setJSON('large',{}));
 const failDb={prepare(){throw Error('injected D1 failure')}};
 await assert.rejects(f.createSitesRelayStore('test',{db:failDb,bucket:f.bucket}).setJSON('large',{}));
 assert.deepEqual(await f.store.get('large',{type:'json'}),value);
 assert.ok(JSON.stringify(await f.db.prepare('SELECT * FROM sites_relay_refs').all()).length<2000);
 }finally{await f.mf.dispose()}
});
test('a reader holding the old pointer survives replacement; delete and recreate retain original revision semantics',async()=>{
 const f=await fixture();try{
 await f.store.setJSON('k',{v:1});const row=await f.db.prepare('SELECT object_key FROM sites_relay_refs').first();
 await f.store.setJSON('k',{v:2});assert.deepEqual(JSON.parse(await (await f.bucket.get(row.object_key)).text()),{v:1});
 await f.store.delete('k');assert.equal(await f.store.get('k'),null);
 assert.deepEqual(await f.store.setJSON('k',{v:3}),{modified:true,etag:'"r1"'});
 assert.deepEqual((await f.store.list({prefix:'k'})).blobs.map(x=>x.key),['k']);
 }finally{await f.mf.dispose()}
});
