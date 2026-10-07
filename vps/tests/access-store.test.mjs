import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';

import * as module from '../src/access/store.mjs';
import {openDatabase} from '../src/db.mjs';

function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'jugest-access-')),dbPath=join(dir,'access.sqlite');
  let clock=Date.parse('2026-10-06T10:00:00Z');
  module.migrateAccessDatabase(dbPath);
  const store=module.createAccessStore({dbPath,now:()=>clock});
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})});
  const enroll=store.issueEnrollment({kind:'bootstrap'});
  const admin=store.registerCredential({enrollmentId:enroll.id,credential:{webauthnId:'credential-1',publicKey:Buffer.from('public-key'),counter:0,transports:['internal'],deviceType:'multiDevice',backedUp:true}});
  return {dir,dbPath,store,admin,enroll,advance:ms=>{clock+=ms}};
}

test('access commits use FULL durability while existing data databases retain their settings',t=>{
  const f=fixture(t),other=module.createAccessStore({dbPath:f.dbPath}),canonical=openDatabase(join(f.dir,'canonical.sqlite'));
  try{
    for(const store of [f.store,other]){
      assert.equal(store.db.prepare('PRAGMA journal_mode').get().journal_mode,'wal');
      assert.equal(store.db.prepare('PRAGMA synchronous').get().synchronous,2);
    }
    assert.equal(canonical.prepare('PRAGMA synchronous').get().synchronous,1);
  }finally{other.close();canonical.close()}
});

test('invite redeems once, creates a separate session, and secrets are absent from database and audit',t=>{
  const f=fixture(t),invite=f.store.issueInvite({createdBy:f.admin.id,label:'たくや用'});
  assert.match(invite.code,/^JGST-(?:[0-9A-F]{4}-){7}[0-9A-F]{4}$/);
  const session=f.store.redeemInvite(invite.code);
  assert.notEqual(session.token,invite.code);
  assert.equal(session.expiresAt-session.createdAt,86400000);
  assert.equal(f.store.authenticateViewer(session.token).kind,'pia-viewer');
  assert.throws(()=>f.store.redeemInvite(invite.code),/invalid_invite/);
  const dump=f.store.db.prepare('SELECT * FROM pia_access_invites').all().concat(f.store.db.prepare('SELECT * FROM pia_viewer_sessions').all(),f.store.db.prepare('SELECT * FROM access_audit_events').all());
  const serialized=JSON.stringify(dump);
  for(const secret of [invite.code,session.token,f.enroll.token])assert.ok(!serialized.includes(secret));
  for(const file of [f.dbPath,f.dbPath+'-wal']){
    let bytes;try{bytes=readFileSync(file)}catch{continue}
    for(const secret of [invite.code,session.token,f.enroll.token])assert.equal(bytes.includes(Buffer.from(secret)),false);
  }
});

test('invite expiry boundary and explicit revocation both reject redemption',t=>{
  const f=fixture(t),expired=f.store.issueInvite({createdBy:f.admin.id}),revoked=f.store.issueInvite({createdBy:f.admin.id});
  f.store.revokeInvite(revoked.id,f.admin.id);
  assert.throws(()=>f.store.redeemInvite(revoked.code),/invalid_invite/);
  f.advance(1800000);
  assert.throws(()=>f.store.redeemInvite(expired.code),/invalid_invite/);
});

test('viewer expiry and both ways of forced logout apply immediately',t=>{
  const f=fixture(t);
  for(const kind of ['session','invite','time']){
    const invite=f.store.issueInvite({createdBy:f.admin.id,viewerHours:1}),session=f.store.redeemInvite(invite.code);
    assert.ok(f.store.authenticateViewer(session.token));
    if(kind==='session')f.store.revokeViewerSession(session.id,f.admin.id);
    if(kind==='invite')f.store.revokeInvite(invite.id,f.admin.id);
    if(kind==='time')f.advance(3600000);
    assert.equal(f.store.authenticateViewer(session.token),null);
  }
});

test('credential revocation stops login, old sessions and outstanding device enrollment',t=>{
  const f=fixture(t),session=f.store.issueAdminSession(f.admin.id),enroll=f.store.issueEnrollment({kind:'additional',createdBy:f.admin.id});
  assert.ok(f.store.authenticateAdmin(session.token));
  f.store.revokeCredential(f.admin.id,'cli');
  assert.equal(f.store.authenticateAdmin(session.token),null);
  assert.equal(f.store.lookupEnrollment(enroll.token),null);
  assert.throws(()=>f.store.issueAdminSession(f.admin.id),/credential_revoked/);
});

test('bootstrap is single use, cannot be reopened after registration, and duplicate registration rolls back',t=>{
  const f=fixture(t);
  assert.equal(f.store.lookupEnrollment(f.enroll.token),null);
  assert.throws(()=>f.store.issueEnrollment({kind:'bootstrap'}),/already_initialized/);
  const enroll=f.store.issueEnrollment({kind:'additional',createdBy:f.admin.id});
  assert.throws(()=>f.store.registerCredential({enrollmentId:enroll.id,credential:{webauthnId:'credential-1',publicKey:Buffer.from('other'),counter:0}}));
  assert.ok(f.store.lookupEnrollment(enroll.token),'failed registration must not consume grant');
  f.store.revokeCredential(f.admin.id,'cli');
  assert.throws(()=>f.store.issueEnrollment({kind:'bootstrap'}),/already_initialized/);
});

test('enrollment expiry and revoked issuer are rechecked at registration commit',t=>{
  const f=fixture(t),enroll=f.store.issueEnrollment({kind:'additional',createdBy:f.admin.id});
  f.store.revokeCredential(f.admin.id,'cli');
  assert.throws(()=>f.store.registerCredential({enrollmentId:enroll.id,credential:{webauthnId:'new',publicKey:Buffer.from('key'),counter:0}}),/invalid_enrollment/);
  const recovery=f.store.issueEnrollment({kind:'recovery'});
  f.advance(900000);
  assert.throws(()=>f.store.registerCredential({enrollmentId:recovery.id,credential:{webauthnId:'new',publicKey:Buffer.from('key'),counter:0}}),/invalid_enrollment/);
});

test('ceremony must match its cookie and purpose, is expiring and never replayable',t=>{
  const f=fixture(t),ceremony=f.store.putChallenge({challenge:'challenge',flow:'login',ceremonyToken:'ceremony-secret'});
  assert.equal(f.store.claimChallenge({id:ceremony.id,flow:'register',ceremonyToken:'ceremony-secret'}),null);
  assert.equal(f.store.claimChallenge({id:ceremony.id,flow:'login',ceremonyToken:'wrong'}),null);
  assert.equal(f.store.claimChallenge({id:ceremony.id,flow:'login',ceremonyToken:'ceremony-secret'}).challenge,'challenge');
  assert.equal(f.store.claimChallenge({id:ceremony.id,flow:'login',ceremonyToken:'ceremony-secret'}),null);
  const other=f.store.putChallenge({challenge:'challenge-2',flow:'login',ceremonyToken:'ceremony-secret'});
  f.advance(300000);
  assert.equal(f.store.claimChallenge({id:other.id,flow:'login',ceremonyToken:'ceremony-secret'}),null);
});

test('two independent SQLite workers redeem an invite and exactly one succeeds',async t=>{
  const f=fixture(t),invite=f.store.issueInvite({createdBy:f.admin.id});
  const script=`import {parentPort,workerData} from 'node:worker_threads';import {createAccessStore} from ${JSON.stringify(new URL('../src/access/store.mjs',import.meta.url).href)};const store=createAccessStore({dbPath:workerData.dbPath,now:()=>workerData.now});parentPort.postMessage('ready');parentPort.once('message',()=>{try{store.redeemInvite(workerData.code);parentPort.postMessage('success')}catch(error){parentPort.postMessage(error.message)}finally{store.close()}});`;
  const workers=[0,1].map(()=>new Worker(script,{eval:true,type:'module',workerData:{dbPath:f.dbPath,code:invite.code,now:Date.parse('2026-10-06T10:00:00Z')}}));
  await Promise.all(workers.map(w=>once(w,'message')));
  const outputs=workers.map(w=>once(w,'message'));for(const w of workers)w.postMessage('go');
  const results=(await Promise.all(outputs)).flat();
  assert.equal(results.filter(x=>x==='success').length,1);
  assert.equal(results.filter(x=>x==='invalid_invite').length,1);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM pia_viewer_sessions').get().n,1);
  await Promise.all(workers.map(w=>w.terminate()));
});

test('rate limit is shared across connections and clears after its window',t=>{
  const f=fixture(t),other=module.createAccessStore({dbPath:f.dbPath,now:()=>Date.parse('2026-10-06T10:00:00Z')});
  try{
    assert.equal(f.store.consumeRate('bucket',{max:2,windowMs:60000}),true);
    assert.equal(other.consumeRate('bucket',{max:2,windowMs:60000}),true);
    assert.equal(f.store.consumeRate('bucket',{max:2,windowMs:60000}),false);
    f.advance(60000);
    assert.equal(f.store.consumeRate('bucket',{max:2,windowMs:60000}),true);
  }finally{other.close()}
});

test('all active viewing and unused invitations remain manageable beyond 200 historical and active records',t=>{
  const f=fixture(t),old=f.store.issueInvite({createdBy:f.admin.id,label:'long-lived',viewerHours:168}),viewer=f.store.redeemInvite(old.code),unused=f.store.issueInvite({createdBy:f.admin.id,redeemMinutes:1440});
  for(let i=0;i<201;i++){
    f.advance(1);const invite=f.store.issueInvite({createdBy:f.admin.id}),session=f.store.redeemInvite(invite.code);f.store.revokeInvite(invite.id,f.admin.id);
  }
  assert.ok(f.store.authenticateViewer(viewer.token));
  let state=f.store.listState();assert.ok(state.sessions.some(s=>s.id===viewer.id));assert.ok(state.invites.some(i=>i.id===old.id));assert.ok(state.invites.some(i=>i.id===unused.id));
  for(let i=0;i<210;i++){f.advance(1);f.store.redeemInvite(f.store.issueInvite({createdBy:f.admin.id}).code)}
  state=f.store.listState();assert.equal(state.sessions.filter(s=>s.status==='active').length,211);assert.ok(state.invites.some(i=>i.id===unused.id));
  f.store.revokeViewerSession(viewer.id,f.admin.id);assert.equal(f.store.authenticateViewer(viewer.token),null);
});
