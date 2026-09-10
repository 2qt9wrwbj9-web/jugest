import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,mkdir,readlink,rm,stat,symlink,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {
  readState,
  writeState,
  shouldAttemptDeploy,
  atomicSwitchCurrent,
  cleanupReleases
} from '../src/deploy-core.mjs';

async function tempRoot(t) {
  const root=await mkdtemp(path.join(tmpdir(),'jugest-deploy-core-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return root;
}

test('readState returns safe defaults when state file is absent',async t=>{
  const root=await tempRoot(t);
  const state=await readState(root);
  assert.deepEqual(state,{
    lastSuccessfulSha:null,
    previousSuccessfulSha:null,
    lastAttemptSha:null,
    lastResult:null,
    lastError:null,
    updatedAt:null
  });
});

test('writeState merges patches and persists them atomically',async t=>{
  const root=await tempRoot(t);
  await writeState(root,{lastSuccessfulSha:'abc',lastResult:'success'});
  const state=await readState(root);
  assert.equal(state.lastSuccessfulSha,'abc');
  assert.equal(state.lastResult,'success');
  assert.match(state.updatedAt,/^\d{4}-\d{2}-\d{2}T/);
});

test('same current SHA is skipped',()=>{
  assert.deepEqual(
    shouldAttemptDeploy({remoteSha:'abc',currentSha:'abc',state:{}}),
    {attempt:false,reason:'already-current'}
  );
});

test('same previously failed SHA is skipped',()=>{
  assert.deepEqual(
    shouldAttemptDeploy({remoteSha:'bad',currentSha:'old',state:{lastAttemptSha:'bad',lastResult:'failed'}}),
    {attempt:false,reason:'previously-failed'}
  );
});

test('new SHA is eligible for deployment',()=>{
  assert.deepEqual(
    shouldAttemptDeploy({remoteSha:'new',currentSha:'old',state:{lastAttemptSha:'older',lastResult:'failed'}}),
    {attempt:true,reason:'new-release'}
  );
});

test('atomicSwitchCurrent replaces current symlink with target',async t=>{
  const root=await tempRoot(t);
  const releases=path.join(root,'releases');
  const oldRelease=path.join(releases,'old');
  const newRelease=path.join(releases,'new');
  const current=path.join(root,'current');
  await mkdir(oldRelease,{recursive:true});
  await mkdir(newRelease,{recursive:true});
  await symlink(oldRelease,current,'dir');

  await atomicSwitchCurrent({currentPath:current,targetPath:newRelease});

  assert.equal(await readlink(current),newRelease);
  assert.ok((await stat(newRelease)).isDirectory());
});

test('cleanupReleases never deletes current or previous and keeps newest extras',async t=>{
  const root=await tempRoot(t);
  const releases=path.join(root,'releases');
  await mkdir(releases,{recursive:true});
  const names=['current','previous','old1','old2','new1','new2'];
  for (const [index,name] of names.entries()) {
    const dir=path.join(releases,name);
    await mkdir(dir);
    const when=new Date(Date.now()+index*1000);
    await utimes(dir,when,when);
  }

  const removed=await cleanupReleases({
    releasesDir:releases,
    currentTarget:path.join(releases,'current'),
    previousTarget:path.join(releases,'previous'),
    keep:2
  });

  assert.deepEqual(removed.sort(),['old1','old2'].sort());
  assert.ok((await stat(path.join(releases,'current'))).isDirectory());
  assert.ok((await stat(path.join(releases,'previous'))).isDirectory());
  assert.ok((await stat(path.join(releases,'new1'))).isDirectory());
  assert.ok((await stat(path.join(releases,'new2'))).isDirectory());
});
