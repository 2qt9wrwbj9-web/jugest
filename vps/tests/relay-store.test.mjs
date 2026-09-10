import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRelayStore} from '../src/relay-store.mjs';

async function withStore(t,name='juggler-relay-v1'){
  const dir=await mkdtemp(path.join(tmpdir(),'jugest-relay-store-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const dbPath=path.join(dir,'relay.sqlite');
  return {dbPath,store:createRelayStore(name,{dbPath,root:'jugest-test'})};
}

test('relay store persists JSON and text values across store instances',async t=>{
  const {dbPath,store}=await withStore(t);
  const first=await store.setJSON('channel/demo',{ok:true,count:1});
  assert.equal(first.modified,true);
  assert.ok(first.etag);
  assert.deepEqual(await store.get('channel/demo',{type:'json'}),{ok:true,count:1});

  const reopened=createRelayStore('juggler-relay-v1',{dbPath,root:'jugest-test'});
  assert.deepEqual(await reopened.get('channel/demo',{type:'json'}),{ok:true,count:1});
  await reopened.set('plain/key','hello');
  assert.equal(await store.get('plain/key'),'hello');
});

test('relay store supports onlyIfNew and ETag compare-and-swap writes',async t=>{
  const {store}=await withStore(t);
  const created=await store.setJSON('state/key',{revision:1},{onlyIfNew:true});
  assert.equal(created.modified,true);
  assert.equal((await store.setJSON('state/key',{revision:99},{onlyIfNew:true})).modified,false);

  const snapshot=await store.getWithMetadata('state/key');
  assert.deepEqual(snapshot.value,{revision:1});
  const updated=await store.setJSON('state/key',{revision:2},{ifMatch:snapshot.etag});
  assert.equal(updated.modified,true);
  assert.notEqual(updated.etag,snapshot.etag);
  assert.deepEqual(await store.get('state/key',{type:'json'}),{revision:2});

  await assert.rejects(
    store.setJSON('state/key',{revision:3},{ifMatch:snapshot.etag}),
    error=>Number(error?.status)===412
  );
  assert.deepEqual(await store.get('state/key',{type:'json'}),{revision:2});
});

test('relay store lists by prefix and deletes keys without crossing namespaces',async t=>{
  const {dbPath,store}=await withStore(t,'alpha');
  await store.set('jobs/2','two');
  await store.set('jobs/1','one');
  await store.set('other/1','other');
  const second=createRelayStore('beta',{dbPath,root:'jugest-test'});
  await second.set('jobs/0','beta');

  const listed=await store.list({prefix:'jobs/'});
  assert.deepEqual(listed.blobs.map(item=>item.key),['jobs/1','jobs/2']);
  await store.delete('jobs/1');
  assert.equal(await store.get('jobs/1'),null);
  assert.equal(await second.get('jobs/0'),'beta');
});
