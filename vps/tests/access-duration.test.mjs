import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {accessFixture} from './helpers/access-fixture.mjs';
import {migrateAccessDatabase,createAccessStore} from '../src/access/store.mjs';

for(const [hours,expected] of [[1,3600000],[24,86400000],[72,259200000],[168,604800000],[720,2592000000],[null,null]]){
  test(`viewer duration ${hours??'unlimited'} is based on redemption server time`,async t=>{
    const f=await accessFixture(t);
    const issued=await f.request('/api/access/admin/invites',{body:{label:'期間テスト',viewerHours:hours}});
    assert.equal(issued.status,200);
    const invite=await issued.json();f.advance(120000);
    const result=await f.request('/api/access/viewer/redeem',{cookie:'',body:{code:invite.code}});
    assert.equal(result.status,200);
    const viewer=await result.json();assert.equal(viewer.expiresAt,expected===null?null:f.now()+expected);
    const cookie=result.headers.get('set-cookie').split(';')[0];
    assert.equal((await f.request('/api/vps/stores',{cookie})).status,200);
    assert.equal((await f.request('/api/access/admin/state',{cookie})).status,403);
    assert.equal((await f.request('/api/vps/stores/private/days',{cookie})).status,403);
    assert.equal((await f.request('/api/vps/judge/machines',{cookie,body:{machines:[]}})).status,403);
    assert.equal((await f.request('/api/access/viewer/redeem',{cookie:'',body:{code:invite.code}})).status,400);
  });
}

test('unlimited viewer survives time, remains listed beyond history, and stops immediately on revocation',async t=>{
  const f=await accessFixture(t),invite=f.store.issueInvite({createdBy:f.admin.id,viewerHours:null,label:'無期限'}),viewer=f.store.redeemInvite(invite.code);
  assert.equal(f.store.db.prepare('SELECT viewer_session_duration FROM pia_access_invites WHERE id=?').get(invite.id).viewer_session_duration,null);
  assert.equal(f.store.db.prepare('SELECT expires_at FROM pia_viewer_sessions WHERE id=?').get(viewer.id).expires_at,null);
  f.advance(366*86400000);
  for(let i=0;i<201;i++){f.advance(1);const past=f.store.issueInvite({createdBy:f.admin.id});f.store.redeemInvite(past.code);f.store.revokeInvite(past.id,f.admin.id)}
  assert.ok(f.store.authenticateViewer(viewer.token));
  assert.equal(f.store.listState().sessions.find(s=>s.id===viewer.id).status,'active');
  assert.ok(f.store.listState().invites.some(i=>i.id===invite.id));
  const cookie='__Host-jugest_pia='+viewer.token;
  assert.equal((await f.request('/api/vps/stores',{cookie})).status,200);
  f.store.revokeViewerSession(viewer.id,f.admin.id);
  assert.equal((await f.request('/api/vps/stores',{cookie})).status,401);
  assert.equal(f.store.db.prepare('SELECT revoked_at FROM pia_viewer_sessions WHERE id=?').get(viewer.id).revoked_at,f.now());
});

test('unlimited invitation still expires after 30 minutes and invitation revocation stops its viewer',async t=>{
  const f=await accessFixture(t),expired=f.store.issueInvite({createdBy:f.admin.id,viewerHours:null});
  f.advance(1800000);assert.throws(()=>f.store.redeemInvite(expired.code),/invalid_invite/);
  const invitation=f.store.issueInvite({createdBy:f.admin.id,viewerHours:null}),viewer=f.store.redeemInvite(invitation.code);
  f.store.revokeInvite(invitation.id,f.admin.id);assert.equal(f.store.authenticateViewer(viewer.token),null);
});

test('viewer cookies are bounded, renewed only after authorization, and never extend a finite server expiry',async t=>{
  const f=await accessFixture(t);
  for(const [hours,issuedAge,renewedAge] of [[1,3600,3599],[24,86400,86399],[72,259200,259199],[168,604800,604799],[720,2592000,2591999],[null,34560000,34560000]]){
    const invite=f.store.issueInvite({createdBy:f.admin.id,viewerHours:hours});
    const redeemed=await f.request('/api/access/viewer/redeem',{cookie:'',body:{code:invite.code}});
    const set=redeemed.headers.get('set-cookie'),cookie=set.split(';')[0];
    assert.match(set,new RegExp(`Max-Age=${issuedAge}(?:;|$)`));
    assert.match(set,/Secure; HttpOnly; SameSite=Strict/);
    f.advance(1000);
    const status=await f.request('/api/access/viewer/status',{cookie});
    assert.equal(status.status,200);const payload=await status.json();assert.equal(payload.serverTime,f.now());
    assert.match(status.headers.get('set-cookie'),new RegExp(`Max-Age=${renewedAge}(?:;|$)`));
    f.store.revokeInvite(invite.id,f.admin.id);
    const rejected=await f.request('/api/access/viewer/status',{cookie});assert.equal(rejected.status,401);assert.equal(rejected.headers.get('set-cookie'),null);
  }
});

test('finite expiry boundary is enforced and null/invalid admin durations never grant admin access',async t=>{
  const f=await accessFixture(t),invite=f.store.issueInvite({createdBy:f.admin.id,viewerHours:720}),viewer=f.store.redeemInvite(invite.code),cookie='__Host-jugest_pia='+viewer.token;
  f.advance(2591999999);assert.equal((await f.request('/api/vps/stores',{cookie})).status,200);
  f.advance(1);assert.equal((await f.request('/api/vps/stores',{cookie})).status,401);
  for(const hours of [0,-1,721,'unlimited',false])assert.throws(()=>f.store.issueInvite({createdBy:f.admin.id,viewerHours:hours}),/invalid_duration/);
  assert.throws(()=>f.store.db.prepare('UPDATE admin_sessions SET expires_at=NULL').run());
});

test('schema 1 upgrades atomically, preserves grants/credentials/sessions, and fresh schema is the same version',t=>{
  const dir=mkdtempSync(join(tmpdir(),'access-upgrade-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const legacy=join(dir,'legacy.sqlite'),fresh=join(dir,'fresh.sqlite');
  const db=new DatabaseSync(legacy);db.exec(readFileSync(new URL('./fixtures/access-schema-1.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO access_meta VALUES(?,?)').run('user_id','preserved-user');
  db.exec("INSERT INTO admin_credentials(id,name,webauthn_id,public_key,device_type,created_at) VALUES('admin','legacy','webauthn',X'01','singleDevice',1000); INSERT INTO pia_access_invites(id,label,token_hash,created_by,created_at,redeem_expires_at,viewer_session_duration,used_at) VALUES('invite','legacy','invite-hash','admin',1000,999999,86400000,1000); INSERT INTO pia_viewer_sessions(id,invite_id,session_hash,created_at,expires_at,last_used_at) VALUES('viewer','invite','viewer-hash',1000,86401000,1000); INSERT INTO admin_sessions(id,credential_id,session_hash,created_at,expires_at,authenticated_at,last_used_at) VALUES('session','admin','admin-hash',1000,99999,1000,1000);");db.close();
  migrateAccessDatabase(legacy);migrateAccessDatabase(legacy);migrateAccessDatabase(fresh);
  const a=createAccessStore({dbPath:legacy}),b=createAccessStore({dbPath:fresh});
  try{
    assert.equal(a.db.prepare('PRAGMA user_version').get().user_version,2);assert.equal(b.db.prepare('PRAGMA user_version').get().user_version,2);
    assert.equal(a.userID(),'preserved-user');
    assert.equal(a.db.prepare('SELECT name FROM admin_credentials').get().name,'legacy');
    assert.equal(a.db.prepare('SELECT expires_at FROM pia_viewer_sessions').get().expires_at,86401000);
    assert.equal(a.db.prepare('SELECT viewer_session_duration FROM pia_access_invites').get().viewer_session_duration,86400000);
    assert.equal(a.db.prepare('SELECT session_hash FROM admin_sessions').get().session_hash,'admin-hash');
    assert.deepEqual(a.db.prepare('PRAGMA foreign_key_check').all(),[]);
    const objects=s=>s.db.prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>[r.name,r.sql.replace(/\s+/g,' ')]);
    assert.deepEqual(objects(a),objects(b));
  }finally{a.close();b.close()}
});

test('failed schema 1 upgrade rolls back its table rebuild and version without losing legacy rows',t=>{
  const dir=mkdtempSync(join(tmpdir(),'access-upgrade-failure-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const path=join(dir,'invalid.sqlite'),db=new DatabaseSync(path);
  db.exec(readFileSync(new URL('./fixtures/access-schema-1.sql',import.meta.url),'utf8'));
  db.exec('PRAGMA foreign_keys=OFF;');
  // Corrupt legacy input is detected, not silently accepted into the new schema.
  db.exec("INSERT INTO pia_access_invites(id,label,token_hash,created_by,created_at,redeem_expires_at,viewer_session_duration) VALUES('orphan','preserve','hash','missing-admin',1,2,3600000);");
  const before=db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all();db.close();
  assert.throws(()=>migrateAccessDatabase(path),/access_foreign_key_check_failed/);
  const check=new DatabaseSync(path,{readOnly:true});
  try{
    assert.equal(check.prepare('PRAGMA user_version').get().user_version,1);
    assert.deepEqual(check.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all(),before);
    assert.equal(check.prepare('SELECT label FROM pia_access_invites').get().label,'preserve');
  }finally{check.close()}
});
