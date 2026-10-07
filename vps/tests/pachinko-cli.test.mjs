import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,copyFileSync,writeFileSync,readFileSync,existsSync,symlinkSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertSafeDbPath,assertSafeWritablePath,validateBackfillManifest} from '../scripts/pachinko.mjs';
import {openPachinkoDatabase} from '../src/pachinko/schema.mjs';

const ROOT=fileURLToPath(new URL('../..',import.meta.url));
const SCRIPT=path.join(ROOT,'vps/scripts/pachinko.mjs');
const FIXTURE=path.join(ROOT,'vps/tests/fixtures/pachinko');
function run(...args){return spawnSync(process.execPath,[SCRIPT,...args],{cwd:ROOT,encoding:'utf8'})}
function workspace(){
  const dir=mkdtempSync(path.join(tmpdir(),'pachinko-cli-'));
  for(const name of ['2026-10-05-ranking.json.gz','2026-10-06-ranking.json.gz','2026-10-07-ranking.json.gz'])copyFileSync(path.join(FIXTURE,name),path.join(dir,name));
  const provenance=JSON.parse(readFileSync(path.join(FIXTURE,'provenance.json'),'utf8'));
  writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(provenance));return dir;
}

test('CLI requires explicit safe DB and rejects production roots without explicit future override',()=>{
  assert.throws(()=>assertSafeDbPath('',{}),/explicit_--db_required/);assert.throws(()=>assertSafeDbPath('/var/lib/jugest/pachinko.sqlite'),/production_path/);assert.throws(()=>assertSafeDbPath('/opt/jugest/releases/x/p.sqlite'),/production_path/);assert.equal(assertSafeDbPath('/tmp/jugest-p-test.sqlite'),'/tmp/jugest-p-test.sqlite');
});

test('CLI protects every writable output path, including raw archive destinations',()=>{
  assert.throws(()=>assertSafeWritablePath('/var/lib/jugest/pachinko-raw'),/production_path/);
  assert.throws(()=>assertSafeWritablePath('/opt/jugest/pachinko-raw'),/production_path/);
  assert.equal(assertSafeWritablePath('/tmp/jugest-pachinko-raw'),'/tmp/jugest-pachinko-raw');
  const result=run('collect','--db','/tmp/jugest-pachinko-safe.sqlite','--archive','/var/lib/jugest/pachinko-raw');
  assert.notEqual(result.status,0);assert.match(result.stderr,/production_path/);
});


test('safe DB path resolves symlinked parent directories before production-path checks',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'pachinko-cli-link-'));try{
    const fakeProd=path.join(dir,'production');mkdirSync(fakeProd);const alias=path.join(dir,'alias');symlinkSync(fakeProd,alias,'dir');assert.equal(assertSafeDbPath(path.join(alias,'future.sqlite')),path.join(alias,'future.sqlite'));
    const prodAlias=path.join(dir,'real-prod');symlinkSync('/var/lib/jugest',prodAlias,'dir');assert.throws(()=>assertSafeDbPath(path.join(prodAlias,'future.sqlite')),/production_path/);
  }finally{rmSync(dir,{recursive:true,force:true})}
});

test('CLI executes normally when invoked through the production-style current symlink',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'pachinko-cli-entry-link-'));try{
    const link=path.join(dir,'pachinko-current.mjs');symlinkSync(SCRIPT,link);const db=path.join(dir,'p.sqlite');
    const result=spawnSync(process.execPath,[link,'migrate','--db',db],{cwd:ROOT,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).schemaVersion,2);
  }finally{rmSync(dir,{recursive:true,force:true})}
});

test('backfill validates all raw hashes before creating or migrating the destination DB',()=>{
  const dir=workspace();try{
    const manifestPath=path.join(dir,'manifest.json'),bad=JSON.parse(readFileSync(manifestPath,'utf8'));bad.snapshots[2].raw_sha256='0'.repeat(64);writeFileSync(manifestPath,JSON.stringify(bad));const db=path.join(dir,'must-not-exist.sqlite');
    assert.throws(()=>validateBackfillManifest(manifestPath),/backfill_sha256_mismatch/);const result=run('backfill','--db',db,'--manifest',manifestPath);assert.notEqual(result.status,0);assert.match(result.stderr,/backfill_sha256_mismatch/);assert.equal(existsSync(db),false);
  }finally{rmSync(dir,{recursive:true,force:true})}
});

test('backfill imports the committed manifest in listed order and replay is idempotent',()=>{
  const dir=workspace();try{
    const dbPath=path.join(dir,'p.sqlite'),manifestPath=path.join(dir,'manifest.json');const validated=validateBackfillManifest(manifestPath);assert.equal(validated.items.length,3);
    const first=run('backfill','--db',dbPath,'--manifest',manifestPath);assert.equal(first.status,0,first.stderr);const firstBody=JSON.parse(first.stdout);assert.equal(firstBody.ok,true);assert.equal(firstBody.imported.length,3);
    const db=openPachinkoDatabase(dbPath,{readOnly:true});try{assert.equal(db.prepare('SELECT COUNT(*) n FROM p_snapshots').get().n,3);assert.equal(db.prepare('SELECT COUNT(*) n FROM p_machine_days').get().n,96)}finally{db.close()}
    const second=run('backfill','--db',dbPath,'--manifest',manifestPath);assert.equal(second.status,0,second.stderr);const secondBody=JSON.parse(second.stdout);assert.ok(secondBody.imported.every(x=>x.status==='duplicate'));const db2=openPachinkoDatabase(dbPath,{readOnly:true});try{assert.equal(db2.prepare('SELECT COUNT(*) n FROM p_snapshots').get().n,3);assert.equal(db2.prepare('SELECT COUNT(*) n FROM p_machine_days').get().n,96)}finally{db2.close()}
  }finally{rmSync(dir,{recursive:true,force:true})}
});

test('manifest paths cannot traverse or symlink outside the manifest directory',()=>{
  const dir=workspace();try{const manifestPath=path.join(dir,'manifest.json'),manifest=JSON.parse(readFileSync(manifestPath,'utf8'));manifest.snapshots[0].file='../outside.json.gz';writeFileSync(manifestPath,JSON.stringify(manifest));assert.throws(()=>validateBackfillManifest(manifestPath),/manifest_path_escape/)}finally{rmSync(dir,{recursive:true,force:true})}
});
