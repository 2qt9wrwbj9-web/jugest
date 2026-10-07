import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accessFixture} from './helpers/access-fixture.mjs';

async function unlimited(f,{cookie=''}={}){
  const invite=f.store.issueInvite({createdBy:f.admin.id,viewerHours:null});
  const response=await f.request('/api/access/viewer/redeem',{cookie,body:{code:invite.code}});
  assert.equal(response.status,200);assert.equal((await response.json()).expiresAt,null);
  const header=response.headers.get('set-cookie'),saved=header.split(';')[0];
  const seconds=Number(header.match(/Max-Age=(\d+)/)?.[1]);
  const session=f.store.db.prepare('SELECT * FROM pia_viewer_sessions WHERE invite_id=?').get(invite.id);
  assert.equal(session.expires_at,null);
  return {invite,cookie:saved,header,session,browserExpiresAt:f.now()+seconds*1000};
}

// Catches a short Cookie deadline even when the database permission is unlimited.
// Each case retains the original response Cookie without any intermediate refresh.
for(const days of [30,60,180,399]){
  test(`unlimited viewer returns after ${days} days of inactivity with its originally retained cookie`,async t=>{
    const f=await accessFixture(t),viewer=await unlimited(f),started=f.now();
    f.advance(days*86400000);
    assert.ok(f.now()<viewer.browserExpiresAt,'the issued browser authentication must still be retained');
    const saved=f.store.db.prepare('SELECT expires_at,last_used_at FROM pia_viewer_sessions WHERE id=?').get(viewer.session.id);
    assert.equal(saved.expires_at,null);assert.equal(saved.last_used_at,started,'no background renewal during inactivity');
    assert.equal((await f.request('/api/vps/stores',{cookie:viewer.cookie})).status,200);
    assert.equal((await f.request('/api/vps/stores/pia:35/days/2026-10-05',{cookie:viewer.cookie})).status,200);
    const status=await f.request('/api/access/viewer/status',{cookie:viewer.cookie});assert.equal(status.status,200);
    assert.equal((await status.json()).expiresAt,null);
    assert.match(status.headers.get('set-cookie'),/Max-Age=34560000(?:;|$)/);
    assert.equal(status.headers.get('set-cookie').split(';')[0],viewer.cookie,'Cookie renewal does not create a new grant');
  });
}

test('admin stopping an unlimited viewer immediately rejects its still-retained long cookie',async t=>{
  const f=await accessFixture(t),viewer=await unlimited(f);f.advance(180*86400000);
  assert.equal((await f.request('/api/vps/stores',{cookie:viewer.cookie})).status,200);
  const admin=f.store.issueAdminSession(f.admin.id);
  assert.equal((await f.request(`/api/access/admin/sessions/${viewer.session.id}/revoke`,{cookie:'__Host-jugest_admin='+admin.token,body:{}})).status,200);
  assert.ok(f.now()<viewer.browserExpiresAt);
  for(const route of ['/api/vps/stores','/api/vps/stores/pia:35/days','/api/vps/stores/pia:35/days/2026-10-05','/api/access/viewer/status']){
    const denied=await f.request(route,{cookie:viewer.cookie});assert.equal(denied.status,401);assert.equal(denied.headers.get('set-cookie'),null);
  }
});

test('unlimited viewer logout revokes the server grant as well as clearing the cookie',async t=>{
  const f=await accessFixture(t),viewer=await unlimited(f);f.advance(60*86400000);
  const logout=await f.request('/api/access/viewer/logout',{cookie:viewer.cookie,body:{}});
  assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0(?:;|$)/);
  assert.equal((await f.request('/api/vps/stores',{cookie:viewer.cookie})).status,401);
  assert.equal((await f.request('/api/access/viewer/status',{cookie:viewer.cookie})).status,401);
});

test('redeeming a new unlimited invitation replaces a supplied old token and revokes its previous grant',async t=>{
  const f=await accessFixture(t),first=await unlimited(f),second=await unlimited(f,{cookie:first.cookie});
  assert.notEqual(first.cookie,second.cookie);
  assert.equal((await f.request('/api/vps/stores',{cookie:first.cookie})).status,401);
  assert.equal((await f.request('/api/vps/stores',{cookie:second.cookie})).status,200);
  const forged='__Host-jugest_pia=JGV_'+ 'A'.repeat(43);
  assert.equal((await f.request('/api/vps/stores',{cookie:forged})).status,401);
});

test('long cookie keeps secure attributes, hashed tokens, short single-use OTP and PIA-only authorization',async t=>{
  const f=await accessFixture(t),viewer=await unlimited(f);
  assert.match(viewer.header,/Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=34560000(?:;|$)/);
  assert.doesNotMatch(viewer.header,/Domain=/);
  const invitation=f.store.db.prepare('SELECT * FROM pia_access_invites WHERE id=?').get(viewer.invite.id);
  assert.equal(invitation.redeem_expires_at-invitation.created_at,1800000);
  assert.equal((await f.request('/api/access/viewer/redeem',{cookie:'',body:{code:viewer.invite.code}})).status,400);
  const expired=f.store.issueInvite({createdBy:f.admin.id,viewerHours:null});f.advance(1800000);
  assert.equal((await f.request('/api/access/viewer/redeem',{cookie:'',body:{code:expired.code}})).status,400);
  for(const route of ['/api/access/admin/state','/api/vps/stores/private/days','/api/vps/stores/pia:35/analysis/default','/api/vps/system/resources'])assert.equal((await f.request(route,{cookie:viewer.cookie})).status,403);
  assert.equal((await f.request('/api/access/admin/invites',{cookie:viewer.cookie,body:{viewerHours:null}})).status,403);
  assert.equal((await f.request('/api/vps/judge/machines',{cookie:viewer.cookie,body:{machines:[]}})).status,403);
  assert.equal((await f.request('/api/vps/stores/pia:35/days',{cookie:'',extra:f.owner})).status,200);
  const judge=await (await f.request('/mcp',{cookie:'',origin:'',body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'judge_machines',arguments:{machines:[]}}}})).json();
  assert.equal(judge.result.isError,false);assert.equal(judge.result.structuredContent.ok,true);
  const token=viewer.cookie.split('=')[1],audit=JSON.stringify(f.store.db.prepare('SELECT * FROM access_audit_events').all());
  for(const secret of [token,viewer.invite.code]){
    assert.ok(!audit.includes(secret));
    for(const path of [f.dbPath,f.dbPath+'-wal'])assert.ok(!readFileSync(path).includes(Buffer.from(secret)));
  }
});
