import test from 'node:test';
import assert from 'node:assert/strict';
import {accessFixture} from './helpers/access-fixture.mjs';
import {virtualCredential} from './helpers/access-authenticator.mjs';

function cookies(response){return response.headers.getSetCookie().map(x=>x.split(';')[0]).filter(x=>!x.endsWith('=')).join('; ')}
async function begin(f,path,body,cookie=''){
  const response=await f.request('/api/access/'+path+'/options',{cookie,body});
  assert.equal(response.status,200);return {...await response.json(),cookie:[cookie,cookies(response)].filter(Boolean).join('; ')};
}

test('real WebAuthn verification registers, logs in, refreshes and rejects replay and revoked credentials',async t=>{
  const f=await accessFixture(t),key=virtualCredential(),grant=f.store.issueEnrollment({kind:'additional',createdBy:f.admin.id});
  const start=await begin(f,'register',{token:grant.token,name:'iPhoneパスキー'});
  assert.equal(start.options.authenticatorSelection.userVerification,'required');
  assert.equal(start.options.authenticatorSelection.residentKey,'required');
  const registration={flowId:start.flowId,response:key.registration(start.options)};
  const accepted=await f.request('/api/access/register/verify',{cookie:start.cookie,body:registration});
  assert.equal(accepted.status,200);const credential=(await accepted.json()).credential;
  assert.equal(f.store.lookupEnrollment(grant.token),null);
  assert.equal((await f.request('/api/access/register/verify',{cookie:start.cookie,body:registration})).status,400);
  const login=await begin(f,'login',{}),assertion=key.assertion(login.options,{userHandle:start.options.user.id});
  const logged=await f.request('/api/access/login/verify',{cookie:login.cookie,body:{flowId:login.flowId,response:assertion}});
  assert.equal(logged.status,200);const adminCookie=cookies(logged);
  assert.match(adminCookie,/__Host-jugest_admin=/);
  assert.equal((await f.request('/api/access/login/verify',{cookie:login.cookie,body:{flowId:login.flowId,response:assertion}})).status,400);
  f.advance(300000);
  assert.equal((await f.request('/api/access/admin/invites',{cookie:adminCookie,body:{}})).status,403);
  const fresh=await begin(f,'reauth',{},adminCookie);
  const refreshed=await f.request('/api/access/reauth/verify',{cookie:fresh.cookie,body:{flowId:fresh.flowId,response:key.assertion(fresh.options,{userHandle:start.options.user.id})}});
  assert.equal(refreshed.status,200);
  assert.equal((await f.request('/api/access/admin/invites',{cookie:adminCookie,body:{}})).status,200);
  const pending=await begin(f,'login',{});
  f.store.revokeCredential(credential.id,'cli');
  assert.equal((await f.request('/api/access/admin/state',{cookie:adminCookie})).status,401);
  assert.equal((await f.request('/api/access/login/verify',{cookie:pending.cookie,body:{flowId:pending.flowId,response:key.assertion(pending.options)}})).status,400);
});

for(const [name,mutation] of [['wrong registration origin',{origin:'https://evil.example'}],['wrong registration RP',{rpID:'evil.example'}],['no user verification',{uv:false}]]){
  test('registration rejects '+name,async t=>{
    const f=await accessFixture(t),key=virtualCredential(),grant=f.store.issueEnrollment({kind:'additional',createdBy:f.admin.id}),start=await begin(f,'register',{token:grant.token});
    const response=await f.request('/api/access/register/verify',{cookie:start.cookie,body:{flowId:start.flowId,response:key.registration(start.options,mutation)}});
    assert.equal(response.status,400);assert.equal(f.store.listState().credentials.length,1);assert.ok(f.store.lookupEnrollment(grant.token));
    assert.ok(!response.headers.get('set-cookie'));
  });
}

for(const [name,mutation] of [['wrong assertion origin',{origin:'https://evil.example'}],['wrong assertion RP',{rpID:'evil.example'}],['no user verification',{uv:false}],['forged signature',{invalidSignature:true}],['wrong user handle',{userHandle:'wrong'}]]){
  test('authentication rejects '+name,async t=>{
    const f=await accessFixture(t),key=virtualCredential(),grant=f.store.issueEnrollment({kind:'additional',createdBy:f.admin.id}),start=await begin(f,'register',{token:grant.token});
    const registered=await f.request('/api/access/register/verify',{cookie:start.cookie,body:{flowId:start.flowId,response:key.registration(start.options)}});assert.equal(registered.status,200);
    const login=await begin(f,'login',{}),response=await f.request('/api/access/login/verify',{cookie:login.cookie,body:{flowId:login.flowId,response:key.assertion(login.options,mutation)}});
    assert.equal(response.status,400);assert.ok(!response.headers.get('set-cookie'));
  });
}

test('registration grant cannot be used from another ceremony cookie',async t=>{
  const f=await accessFixture(t),key=virtualCredential(),grant=f.store.issueEnrollment({kind:'additional',createdBy:f.admin.id}),start=await begin(f,'register',{token:grant.token});
  const response=await f.request('/api/access/register/verify',{cookie:'__Host-jugest_ceremony=wrong',body:{flowId:start.flowId,response:key.registration(start.options)}});
  assert.equal(response.status,400);assert.ok(f.store.lookupEnrollment(grant.token));
});
