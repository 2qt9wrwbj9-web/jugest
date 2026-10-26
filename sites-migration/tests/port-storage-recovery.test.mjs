import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {createSitesRelayStore} from '../lib/storage/relay-store.mjs';
import {Miniflare} from 'miniflare';
async function fixture(){
 assert.ok(existsSync(new URL('../lib/storage/recovery.mjs',import.meta.url)),'verified storage recovery missing');
 const recovery=await import('../lib/storage/recovery.mjs');
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'test'},r2Buckets:['BUCKET'],cf:false});
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
 const dir=new URL('../drizzle/',import.meta.url);
 for(const name of readdirSync(dir).filter(x=>x.endsWith('.sql')).sort())for(const sql of readFileSync(new URL(name,dir),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
 return {mf,db,bucket,store:createSitesRelayStore('test',{db,bucket}),...recovery};
}
test('missing R2 payload restores only exact hash-verified backup bytes without changing D1 revision',async()=>{const f=await fixture();try{
 await f.store.setJSON('k',{value:'original exact bytes'});const row=await f.db.prepare('SELECT * FROM sites_relay_refs').first();await f.bucket.delete(row.object_key);
 await assert.rejects(f.store.get('k'),/relay_payload_missing/);
 await assert.rejects(f.restoreMissingRelayPayload({db:f.db,bucket:f.bucket,namespace:f.store._namespace,key:'k',etag:'"r1"',text:'wrong'}),/backup_hash_mismatch/);
 await f.restoreMissingRelayPayload({db:f.db,bucket:f.bucket,namespace:f.store._namespace,key:'k',etag:'"r1"',text:'{"value":"original exact bytes"}'});
 assert.deepEqual(await f.store.getWithMetadata('k'),{value:{value:'original exact bytes'},etag:'"r1"'});
 assert.deepEqual(await f.db.prepare('SELECT * FROM sites_relay_refs').first(),row);
}finally{await f.mf.dispose()}});
test('integrity audit finds missing, corrupted and unreferenced objects and never deletes or repairs them',async()=>{const f=await fixture();try{
 for(const key of ['good','missing','bad'])await f.store.setJSON(key,{key});
 const rows=(await f.db.prepare('SELECT * FROM sites_relay_refs ORDER BY key').all()).results;
 await f.bucket.delete(rows.find(x=>x.key==='missing').object_key);await f.bucket.put(rows.find(x=>x.key==='bad').object_key,'corrupted');
 await f.bucket.put('sites-relay/unreferenced-test-only','pending writer');
 let cursor,observed=[];do{const page=await f.auditRelayReferences({db:f.db,bucket:f.bucket,limit:1,cursor});observed.push(...page.references);cursor=page.cursor}while(cursor);
 assert.deepEqual(observed.map(x=>[x.key,x.status]),[['bad','hash_mismatch'],['good','verified'],['missing','missing']]);
 const candidates=await f.listUnreferencedRelayObjects({db:f.db,bucket:f.bucket,limit:2});assert.equal(candidates.destructive,false);
 let objectCursor=candidates.cursor,all=[...candidates.objects];while(objectCursor){const p=await f.listUnreferencedRelayObjects({db:f.db,bucket:f.bucket,limit:2,cursor:objectCursor});all.push(...p.objects);objectCursor=p.cursor}
 assert.deepEqual(all.filter(x=>!x.referenced).map(x=>x.objectKey),['sites-relay/unreferenced-test-only']);assert.ok(await f.bucket.get('sites-relay/unreferenced-test-only'));
 await assert.rejects(f.store.get('bad'),/relay_payload_hash_mismatch/);
}finally{await f.mf.dispose()}});
test('recovery rejects stale revisions and never overwrites an existing R2 object',async()=>{const f=await fixture();try{
 await f.store.set('k','one');await f.store.set('k','two');
 await assert.rejects(f.restoreMissingRelayPayload({db:f.db,bucket:f.bucket,namespace:f.store._namespace,key:'k',etag:'"r1"',text:'one'}),/backup_reference_changed/);
 await f.restoreMissingRelayPayload({db:f.db,bucket:f.bucket,namespace:f.store._namespace,key:'k',etag:'"r2"',text:'two'});
 assert.equal(await f.store.get('k'),'two');
 const row=await f.db.prepare('SELECT * FROM sites_relay_refs').first();await f.bucket.put(row.object_key,'bad');
 await assert.rejects(f.restoreMissingRelayPayload({db:f.db,bucket:f.bucket,namespace:f.store._namespace,key:'k',etag:'"r2"',text:'two'}),/existing_object_hash_mismatch/);
 assert.equal(await(await f.bucket.get(row.object_key)).text(),'bad');
}finally{await f.mf.dispose()}});
