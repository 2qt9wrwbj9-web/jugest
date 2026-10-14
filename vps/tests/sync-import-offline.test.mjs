import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,symlink,writeFile,chmod,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRelayStore} from '../src/relay-store.mjs';
import {createSyncRuntime} from '../../api/_sync-web.js';
import {SYNC_NAMESPACE,validateArchive,inspectDbAndImport} from '../scripts/sync-import-offline.mjs';

const payload=ct=>({v:1,zip:'none',iv:'abcdefghijklmnop',ct});
function transport(store){
 const runtime=createSyncRuntime({createStore:()=>store});
 return async body=>{
  const r=await runtime.default(new Request('http://local/api/sync',{method:'POST',body:JSON.stringify(body)}));
  return{status:r.status,data:await r.json()};
 };
}
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'sync-archive-rehearsal-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const source=createRelayStore('juggler-device-sync-v1',{dbPath:join(dir,'origin.sqlite')});
 const call=transport(source);
 const auth=(await call({action:'create'})).data;
 assert.equal((await call({...auth,action:'push',baseRevision:0,payload:payload('Aa123456')})).status,200);
 assert.equal((await call({...auth,action:'push',baseRevision:1,payload:payload('Bb123456')})).status,200);
 const objects=[];
 for(const {key} of (await source.list()).blobs)objects.push({key,value:await source.get(key)});
 return{dir,source,call,auth,archive:{format:'jugest-legacy-sync-v1',namespace:SYNC_NAMESPACE,objects}};
}
test('encrypted legacy namespace round-trips into isolated SQLite and preserves share identity, revision and old token',async t=>{
 const f=await fixture(t);
 const path=join(f.dir,'import.sqlite');
 const preview=inspectDbAndImport(f.archive,{dbPath:path});
 assert.equal(preview.shareCount,1);assert.equal(preview.recordCount,3);
 assert.equal(preview.dryRun,true);
 const imported=inspectDbAndImport(f.archive,{dbPath:path,apply:true});
 assert.equal(imported.fingerprint,preview.fingerprint);
 const restored=createRelayStore('juggler-device-sync-v1',{dbPath:path});
 const old=await f.call({...f.auth,action:'pull'});
 const output=await transport(restored)({...f.auth,action:'pull'});
 assert.equal(output.status,200);
 assert.deepEqual(output.data,old.data);
 assert.equal(output.data.revision,2);
 assert.equal((await transport(restored)({...f.auth,action:'push',baseRevision:2,payload:payload('Cc123456')})).status,200);
 assert.equal((await transport(restored)({...f.auth,action:'pull'})).data.revision,3);
});
test('import is fail-closed on missing commit and mismatch, leaves destination unchanged',async t=>{
 const f=await fixture(t);
 const path=join(f.dir,'target.sqlite');
 const missing=structuredClone(f.archive);
 // A gap after the head hides a later durable commit: never import it.
 const head=JSON.parse(missing.objects.find(o=>o.key.startsWith('sync/')).value);
 missing.objects.push({key:`sync-commit/${f.auth.syncId}/000000000004`,
   value:JSON.stringify({...head,revision:4,payload:payload('future')})});
 assert.throws(()=>validateArchive(missing),/missing_revision_after_head/);
 const corrupt=structuredClone(f.archive);
 corrupt.objects.find(o=>o.key.startsWith('sync-commit/')).value='{broken';
 assert.throws(()=>inspectDbAndImport(corrupt,{dbPath:path,apply:true}),/invalid_record_json/);
 const ok=inspectDbAndImport(f.archive,{dbPath:path,apply:true});
 assert.equal(ok.recordCount,3);
 assert.throws(()=>inspectDbAndImport(f.archive,{dbPath:path,apply:true}),/destination_not_empty/);
 const db=new DatabaseSync(path);
 try{assert.equal(db.prepare('SELECT COUNT(*) n FROM relay_kv WHERE namespace=?').get(SYNC_NAMESPACE).n,3)}
 finally{db.close()}
});

test('historic Blob head-only shares, including positive revision without commits, survive exactly',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'sync-legacy-head-only-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const source=createRelayStore('juggler-device-sync-v1',{dbPath:join(dir,'historic.sqlite')});
 const send=transport(source);
 const auths=[],originalHeads=new Map();
 for(const revisions of [0,2,9]){
   const auth=(await send({action:'create'})).data;
   for(let n=0;n<revisions;n++){
     const r=await send({...auth,action:'push',baseRevision:n,payload:payload('Hist'+n+'AbCd')});
     assert.equal(r.status,200);
   }
   auths.push({auth,revisions});
   originalHeads.set(auth.syncId,await source.get(`sync/${auth.syncId}`));
 }
 // Simulate historic Blob storage which wrote only the per-share latest head,
 // long before immutable sync-commit objects were introduced.
 const objects=[...originalHeads].map(([syncId,value])=>({key:`sync/${syncId}`,value}));
 const archive={format:'jugest-legacy-sync-v1',namespace:SYNC_NAMESPACE,objects};
 const summary=validateArchive(archive);
 assert.equal(summary.shareCount,3);
 assert.equal(summary.recordCount,3);
 const target=join(dir,'restored.sqlite');
 const imported=inspectDbAndImport(archive,{dbPath:target,apply:true});
 assert.equal(imported.fingerprint,summary.fingerprint);
 const restored=createRelayStore('juggler-device-sync-v1',{dbPath:target});
 const resumed=transport(restored);
 for(const {auth,revisions} of auths){
   assert.equal(await restored.get(`sync/${auth.syncId}`),originalHeads.get(auth.syncId),
     'encrypted head is byte-preserved without reconstructed history');
   const r=await resumed({...auth,action:'pull'});
   assert.equal(r.status,200);
   assert.equal(r.data.revision,revisions);
   assert.deepEqual(r.data.payload,revisions?payload('Hist'+(revisions-1)+'AbCd'):null);
   const pushed=await resumed({...auth,action:'push',baseRevision:revisions,payload:payload('NewAbCd12')});
   assert.equal(pushed.status,200);
   assert.equal(pushed.data.revision,revisions+1);
   const clash=await resumed({...auth,action:'push',baseRevision:revisions,payload:payload('StaleClient')});
   assert.equal(clash.status,409);
   assert.equal(clash.data.code,'revision_conflict');
   assert.ok(await restored.get(`sync-commit/${auth.syncId}/${String(revisions+1).padStart(12,'0')}`));
   assert.equal((await resumed({...auth,action:'pull'})).data.revision,revisions+1);
 }
});

test('historic head plus sparse *older* commits is valid; future gaps and identity conflicts are rejected',async t=>{
 const f=await fixture(t);
 const base=structuredClone(f.archive);
 const head=JSON.parse(base.objects.find(x=>x.key.startsWith('sync/')).value);
 const headOnly={...base,objects:base.objects.filter(x=>x.key.startsWith('sync/'))};
 assert.equal(validateArchive(headOnly).recordCount,1);
 const priorSparse={...base,objects:base.objects.filter(x=>!x.key.endsWith('000000000001'))};
 assert.equal(validateArchive(priorSparse).recordCount,2);
 const future={...headOnly,objects:[...headOnly.objects,
  {key:`sync-commit/${f.auth.syncId}/000000000003`,value:JSON.stringify({...head,revision:3})}]};
 assert.equal(validateArchive(future).recordCount,2);
 const broken={...headOnly,objects:[...headOnly.objects,
  {key:`sync-commit/${f.auth.syncId}/000000000004`,value:JSON.stringify({...head,revision:4})}]};
 assert.throws(()=>validateArchive(broken),/missing_revision_after_head/);
 const different={...headOnly,objects:[...headOnly.objects,
  {key:`sync-commit/${f.auth.syncId}/000000000003`,
   value:JSON.stringify({...head,revision:3,authHash:'b'.repeat(64)})}]};
 assert.throws(()=>validateArchive(different),/share_identity_mismatch/);
 const disagree={...base,objects:base.objects.map(x=>x.key.endsWith('000000000002')
   ? {...x,value:JSON.stringify({...JSON.parse(x.value),updatedAt:Date.now()+10000})}:x)};
 assert.throws(()=>validateArchive(disagree),/head_commit_disagree/);
});

test('wrong namespace, missing shares, collision keys and protected paths are rejected',async t=>{
 const f=await fixture(t);
 assert.throws(()=>validateArchive({...f.archive,namespace:'other'}),/bad_archive_format/);
 assert.throws(()=>validateArchive({...f.archive,objects:[]}),/no_shares/);
 assert.throws(()=>validateArchive({...f.archive,objects:[...f.archive.objects,f.archive.objects[0]]}),/duplicate_key/);
 assert.throws(()=>inspectDbAndImport(f.archive,{dbPath:'/var/lib/jugest/relay.sqlite'}),/production_target_not_allowed/);
 const alias=join(f.dir,'alias-prod');await symlink('/var/lib/jugest',alias,'dir');
 assert.throws(()=>inspectDbAndImport(f.archive,{dbPath:join(alias,'relay.sqlite')}),/production_target_not_allowed/);
 const aliasDb=join(f.dir,'alias-db.sqlite');
 await symlink(join(f.dir,'new.sqlite'),aliasDb);
 assert.throws(()=>inspectDbAndImport(f.archive,{dbPath:aliasDb,apply:true}),/target_symlink/);

});

test('command line reads only owner-only archive, dry-run never creates a DB, and apply writes only scratch',async t=>{
 const f=await fixture(t),archive=join(f.dir,'legacy-export.json'),dest=join(f.dir,'scratch.sqlite');
 await writeFile(archive,JSON.stringify(f.archive),{mode:0o600});
 const script=fileURLToPath(new URL('../scripts/sync-import-offline.mjs',import.meta.url));
 const run=(...args)=>spawnSync(process.execPath,[script,'--archive',archive,'--db',dest,...args],{encoding:'utf8'});
 const preview=run();
 assert.equal(preview.status,0,preview.stderr);
 assert.equal(JSON.parse(preview.stdout).dryRun,true);
 assert.equal((await import('node:fs')).existsSync(dest),false);
 const applied=run('--apply');
 assert.equal(applied.status,0,applied.stderr);
 assert.equal(JSON.parse(applied.stdout).recordCount,3);
 await chmod(archive,0o644);
 const denied=run();
 assert.notEqual(denied.status,0);
 assert.match(denied.stderr,/permissions_must_be_0600/);
});
