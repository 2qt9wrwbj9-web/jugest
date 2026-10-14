import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,chmod,symlink,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SYNC_NAMESPACE} from '../scripts/sync-import-offline.mjs';
import {parseArgs,verifyMatchingExports} from '../scripts/sync-verify-two-exports.mjs';
const ID='SyntheticHead_12345678';
const head=(revision=3,ct='BbbCCCdddEe')=>({version:1,createdAt:100,updatedAt:200,revokedAt:0,revision,
  authHash:'a'.repeat(64),payload:{v:1,zip:'none',iv:'abcdefghijklmnop',ct}});
const archive=(h=head())=>({format:'jugest-legacy-sync-v1',namespace:SYNC_NAMESPACE,
  objects:[{key:'sync/'+ID,value:JSON.stringify(h)}]});
test('two matching frozen source snapshots verify without exposing auth or encrypted payload',()=>{
  const result=verifyMatchingExports(archive(),archive());
  assert.equal(result.ok,true);
  assert.equal(result.matching,true);
  assert.equal(result.shareCount,1);
  assert.equal(result.recordCount,1);
  assert.ok(/^[0-9a-f]{64}$/.test(result.fingerprint));
  assert.ok(!JSON.stringify(result).includes(ID));
  assert.ok(!JSON.stringify(result).includes('BbbCCCdddEe'));
});
test('changes to head, ciphertext, revision, added commits, or missing shares stop cutover',()=>{
  const old=archive();
  for(const newer of [archive(head(4)),archive(head(3,'AbcAbcAbcAb')),
    {...archive(),objects:[...archive().objects,{key:'sync-commit/'+ID+'/000000000004',
      value:JSON.stringify(head(4))}]},
    {...archive(),objects:[]}]){
    assert.throws(()=>verifyMatchingExports(old,newer));
  }
});
test('CLI refuses same archive, world-readable permissions and symlink aliases; no destination DB created',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'jugest-snap-verify-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await chmod(dir,0o700);
  const a=join(dir,'one.json'),b=join(dir,'two.json');
  await writeFile(a,JSON.stringify(archive()),{mode:0o600});
  await writeFile(b,JSON.stringify(archive()),{mode:0o600});
  const script=fileURLToPath(new URL('../scripts/sync-verify-two-exports.mjs',import.meta.url));
  const call=(x,y)=>spawnSync(process.execPath,[script,'--first',x,'--second',y],{encoding:'utf8'});
  let response=call(a,b);assert.equal(response.status,0,response.stderr);
  assert.equal(JSON.parse(response.stdout).matching,true);
  assert.equal(call(a,a).status,1);
  const alias=join(dir,'alias.json');await symlink(a,alias);
  assert.equal(call(alias,b).status,1);
  await chmod(b,0o644);
  response=call(a,b);assert.equal(response.status,1);
  assert.match(response.stderr,/permissions_must_be_0600/);
  await chmod(b,0o600);
  await chmod(dir,0o755);
  response=call(a,b);assert.equal(response.status,1);
  assert.match(response.stderr,/parent_requires_0700/);
});
