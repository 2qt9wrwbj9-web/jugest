import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,chmod,stat,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSyncRuntime} from '../../api/_sync-web.js';
import {createRelayStore} from '../src/relay-store.mjs';
import {SYNC_NAMESPACE,inspectDbAndImport} from '../scripts/sync-import-offline.mjs';
import {buildLegacyArchive,writePrivateArchive} from '../scripts/sync-export-blob.mjs';
async function origin(t){
 const dir=await mkdtemp(join(tmpdir(),'legacy-blob-export-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const dbPath=join(dir,'src.sqlite'),store=createRelayStore('juggler-device-sync-v1',{dbPath});
 const runtime=createSyncRuntime({createStore:()=>store});
 const send=async body=>(await runtime.default(new Request('http://local/api/sync',{method:'POST',body:JSON.stringify(body)}))).json();
 const auth=await send({action:'create'});
 const response=await send({...auth,action:'push',baseRevision:0,payload:{v:1,zip:'none',iv:'abcdefghijklmnop',ct:'AaBbCcDdEE'}});
 assert.equal(response.ok,true);
 const prefix=SYNC_NAMESPACE+'/';
 const list=async()=>({blobs:(await store.list()).blobs.map(({key})=>({pathname:prefix+key})),cursor:null});
 const get=async pathname=>{
  const value=await store.get(pathname.slice(prefix.length));
  return value===null?{statusCode:404}:{statusCode:200,stream:new Blob([value]).stream()};
 };
 return{dir,list,get,auth,prefix};
}
test('private read-only Blob export retains ciphertext and can write an owner-only archive',async t=>{
 const s=await origin(t);
 const {archive,summary}=await buildLegacyArchive(s);
 assert.equal(summary.shareCount,1);assert.equal(summary.recordCount,2);
 const privateDir=join(s.dir,'owner');await import('node:fs/promises').then(m=>m.mkdir(privateDir,{mode:0o700}));
 await chmod(privateDir,0o700);
 const file=join(privateDir,'archive.json');
 writePrivateArchive(file,archive);
 assert.equal((await stat(file)).mode&0o077,0);
 assert.deepEqual(JSON.parse(await readFile(file,'utf8')),archive);
 assert.throws(()=>writePrivateArchive(file,archive),/EEXIST/);
});
test('source head change between reads fails instead of exporting stale state',async t=>{
 const s=await origin(t);let counter=0;
 const get=async (key,opts)=>{
  const r=await s.get(key,opts);
  if(key.startsWith(s.prefix+'sync/')&&++counter>1)return{statusCode:200,stream:new Blob(['{"altered":true}']).stream()};
  return r;
 };
 await assert.rejects(buildLegacyArchive({...s,get}),/export_head_changed/);
});

test('three historic head-only Blob objects export unchanged and import into a scratch SQLite relay',async t=>{
 const s=await origin(t);
 const originalValue=await new Response((await s.get(s.prefix+'sync/'+s.auth.syncId)).stream).text();
 const current=JSON.parse(originalValue);
 const ids=[s.auth.syncId,'HistoricalSecondId_02','HistoricalThirdId__03'];
 const values=[
   originalValue,
   JSON.stringify({...current,revision:0,payload:null}),
   JSON.stringify({...current,revision:7,payload:{v:1,zip:'none',iv:'abcdefghijklmnop',ct:'OLDciphertxt900'}})
 ];
 const entries=ids.map((id,i)=>({pathname:s.prefix+'sync/'+id,value:values[i]}));
 let reads=0;
 const fake={
   list:async({prefix})=>({blobs:entries.filter(x=>x.pathname.startsWith(prefix)).map(x=>({pathname:x.pathname})),cursor:null}),
   get:async pathname=>{
     reads++;
     const value=entries.find(x=>x.pathname===pathname)?.value;
     return value?{statusCode:200,stream:new Blob([value]).stream()}:{statusCode:404};
   }
 };
 const {archive,summary}=await buildLegacyArchive(fake);
 assert.equal(reads,6,'read each head twice to ensure unchanged source during export');
 assert.equal(summary.shareCount,3);
 assert.equal(summary.recordCount,3);
 assert.equal(summary.skippedTransient,0);
 for(let i=0;i<3;i++)assert.equal(archive.objects.find(o=>o.key==='sync/'+ids[i]).value,values[i]);
 const target=join(s.dir,'3-head-only.sqlite');
 inspectDbAndImport(archive,{dbPath:target,apply:true});
 const restored=createRelayStore('juggler-device-sync-v1',{dbPath:target});
 for(let i=0;i<3;i++)assert.equal(await restored.get('sync/'+ids[i]),values[i]);
});

test('unknown namespace objects fail closed rather than vanish silently',async t=>{
 const s=await origin(t);
 const invalid={
   list:async()=>({blobs:[{pathname:s.prefix+'unrecognized/key'}],cursor:null}),
   get:async()=>{throw new Error('never reach blob get')}
 };
 await assert.rejects(buildLegacyArchive(invalid),/export_unrecognized_source_key/);
});
