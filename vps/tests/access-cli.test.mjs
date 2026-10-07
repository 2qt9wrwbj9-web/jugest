import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,statSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createAccessStore} from '../src/access/store.mjs';

test('CLI creates only a private access DB, bootstrap is single-use, recovery and revoke require operator access',t=>{
  const dir=mkdtempSync(join(tmpdir(),'jugest-cli-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const dbPath=join(dir,'access.sqlite'),script=fileURLToPath(new URL('../scripts/access-admin.mjs',import.meta.url));
  const command=(...args)=>spawnSync(process.execPath,[script,...args],{env:{...process.env,JUGEST_ACCESS_DB:dbPath},encoding:'utf8'});
  assert.equal(command('bootstrap').status,1);
  assert.equal(command('migrate').status,0);assert.equal(command('migrate').status,0);
  assert.equal(statSync(dbPath).mode&0o777,0o600);
  const bootstrap=command('bootstrap');assert.equal(bootstrap.status,0);assert.equal(bootstrap.stderr.includes('JGA_'),false);
  const grant=JSON.parse(bootstrap.stdout);assert.ok(Date.parse(grant.expiresAt)>Date.now());
  const store=createAccessStore({dbPath});t.after(()=>store.close());
  const enrollment=store.lookupEnrollment(grant.token),credential=store.registerCredential({enrollmentId:enrollment.id,credential:{webauthnId:'cli-test',publicKey:Buffer.from('public-key')}});
  const admin=store.issueAdminSession(credential.id);assert.equal(store.lookupEnrollment(grant.token),null);
  assert.equal(command('bootstrap').status,1);assert.equal(command('recover').status,1);
  const recovery=command('recover','--confirm-recovery');assert.equal(recovery.status,0);assert.ok(store.lookupEnrollment(JSON.parse(recovery.stdout).token));
  const status=command('status');assert.equal(status.status,0);assert.ok(!status.stdout.includes(grant.token));assert.ok(!status.stdout.includes(admin.token));
  assert.equal(command('revoke',credential.id).status,0);assert.equal(store.authenticateAdmin(admin.token),null);
  assert.equal(command('bootstrap').status,1);
  assert.equal(readFileSync(dbPath).includes(Buffer.from(grant.token)),false);
});

test('access migration rejects an existing collection database without changing its tables or rows',t=>{
  const dir=mkdtempSync(join(tmpdir(),'jugest-cli-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const path=join(dir,'collection.sqlite'),script=fileURLToPath(new URL('../scripts/access-admin.mjs',import.meta.url));
  const db=new DatabaseSync(path);db.exec("CREATE TABLE stores(id TEXT PRIMARY KEY);INSERT INTO stores VALUES('preserve');");db.close();
  const result=spawnSync(process.execPath,[script,'migrate'],{env:{...process.env,JUGEST_ACCESS_DB:path},encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/access_database_not_empty/);
  const check=new DatabaseSync(path,{readOnly:true});try{
    assert.deepEqual(check.prepare('SELECT id FROM stores').all().map(x=>x.id),['preserve']);
    assert.deepEqual(check.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name),['stores']);
  }finally{check.close()}
});
