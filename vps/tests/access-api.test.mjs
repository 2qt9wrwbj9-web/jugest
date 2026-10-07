import test from 'node:test';
import assert from 'node:assert/strict';
import {accessFixture,ORIGIN} from './helpers/access-fixture.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import {setImmediate as nextTick} from 'node:timers/promises';

test('admin API issues code once, only safe metadata is subsequently listed, viewer cannot manage',async t=>{
  const f=await accessFixture(t),issued=await f.request('/api/access/admin/invites',{body:{label:'たくや用',redeemMinutes:30,viewerHours:24}});
  assert.equal(issued.status,200);const invite=await issued.json();assert.ok(invite.code);
  const response=await f.request('/api/access/viewer/redeem',{cookie:'',body:{code:invite.code}});
  assert.equal(response.status,200);
  const setCookie=response.headers.get('set-cookie');assert.match(setCookie,/Secure/);assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);assert.match(setCookie,/Path=\//);assert.doesNotMatch(setCookie,/Domain=/);
  const viewer=setCookie.split(';')[0];
  assert.equal((await f.request('/api/access/viewer/redeem',{cookie:'',body:{code:invite.code}})).status,400);
  assert.equal((await f.request('/api/access/admin/state',{cookie:viewer})).status,403);
  assert.equal((await f.request('/api/access/admin/invites',{cookie:viewer,body:{label:'bad'}})).status,403);
  const listed=await (await f.request('/api/access/admin/state')).json();
  assert.ok(!JSON.stringify(listed).includes(invite.code));assert.doesNotMatch(JSON.stringify(listed),/token_hash|session_hash|public_key/);
});

test('viewer reads only PIA list and days, existing owner continues and all non-view endpoints reject cookie',async t=>{
  const f=await accessFixture(t),invite=f.store.issueInvite({createdBy:f.admin.id}),session=f.store.redeemInvite(invite.code),cookie='__Host-jugest_pia='+session.token;
  const routes=['/api/vps/stores','/api/vps/stores/pia:35/days','/api/vps/stores/pia:35/days/2026-10-05'];
  for(const route of routes){assert.equal((await f.request(route,{cookie:''})).status,401);assert.equal((await f.request(route,{cookie})).status,200)}
  const list=await (await f.request('/api/vps/stores',{cookie})).json();assert.deepEqual(list.stores.map(x=>x.id),['pia:35']);
  for(const route of ['/api/vps/stores/private/days','/api/vps/stores/pia:35/analysis/default','/api/vps/stores/pia:35/legacy-plan','/api/vps/system/resources','/api/vps/assistant-key'])assert.equal((await f.request(route,{cookie})).status,403,route);
  assert.equal((await f.request('/api/vps/judge/machines',{cookie,body:{machines:[]}})).status,403);
  const owner=await fetch(f.base+'/api/vps/stores/private/days',{headers:f.owner});assert.equal(owner.status,200);
  f.store.revokeViewerSession(session.id,f.admin.id);
  assert.equal((await f.request('/api/vps/stores/pia:35/days',{cookie})).status,401);
});

test('expiration and stale admin authentication are enforced by server',async t=>{
  const f=await accessFixture(t),invite=f.store.issueInvite({createdBy:f.admin.id,viewerHours:1}),session=f.store.redeemInvite(invite.code),cookie='__Host-jugest_pia='+session.token;
  f.advance(300000);
  assert.equal((await f.request('/api/access/admin/invites',{body:{label:'stale'}})).status,403);
  assert.equal((await f.request('/api/access/admin/state')).status,200);
  f.advance(3300000);
  assert.equal((await f.request('/api/vps/stores',{cookie})).status,401);
  f.advance(43200000);
  assert.equal((await f.request('/api/access/admin/state')).status,401);
});

test('CSRF rejects foreign or missing Origin and missing JSON-specific header',async t=>{
  const f=await accessFixture(t);
  for(const origin of ['https://evil.example','null',''])assert.equal((await f.request('/api/access/admin/invites',{body:{label:'csrf'},origin})).status,403);
  const response=await fetch(f.base+'/api/access/admin/invites',{method:'POST',headers:{cookie:f.cookie,origin:ORIGIN,'content-type':'application/json'},body:'{}'});
  assert.equal(response.status,403);
  assert.equal(f.store.listState().invites.length,0);
});

test('rate limit rejects repeated code guesses and errors never reflect submitted secrets',async t=>{
  const f=await accessFixture(t);const marker='secret-marker-do-not-log';let limited=false;
  for(let i=0;i<12;i++){
    const r=await f.request('/api/access/viewer/redeem',{cookie:'',body:{code:marker}});const text=await r.text();assert.ok(!text.includes(marker));if(r.status===429)limited=true;
  }
  assert.equal(limited,true);
});

test('static JSON, raw collection files, SQLite and encoded alternatives never bypass authorization',async t=>{
  const f=await accessFixture(t);
  for(const route of ['/pia.json','/pia-alias.js','/secret-alias.css','/backup.json','/data.json','/access.sqlite','/pia.csv','/pia.json.gz','/public/pia.json','/%70ia.json','/public%2fpia.json','/vps/src/schema.mjs','/raw','/data/pia.json','/static/pia-data.json']){
    const r=await fetch(f.base+route);assert.equal(r.status,404,route);assert.ok(!(await r.text()).includes('PRIVATE_PIA_MARKER'));
  }
});

test('revoking credential invalidates a live admin cookie immediately',async t=>{
  const f=await accessFixture(t);
  assert.equal((await f.request('/api/access/admin/state')).status,200);
  f.store.revokeCredential(f.admin.id,'cli');
  assert.equal((await f.request('/api/access/admin/state')).status,401);
});

test('login and access pages are available, administrative and data pages require appropriate session',async t=>{
  const f=await accessFixture(t);
  for(const route of ['/admin/login','/admin/register','/pia/access'])assert.equal((await f.request(route,{cookie:''})).status,200,route);
  assert.equal((await f.request('/admin',{cookie:''})).status,401);
  assert.equal((await f.request('/pia',{cookie:''})).status,401);
  const invite=f.store.issueInvite({createdBy:f.admin.id}),session=f.store.redeemInvite(invite.code),cookie='__Host-jugest_pia='+session.token;
  assert.equal((await f.request('/admin',{cookie})).status,403);
  assert.equal((await f.request('/pia',{cookie})).status,200);
  assert.equal((await f.request('/admin')).status,200);
});

test('API expiration, disabled invitations, concurrent redemption and forced logout',async t=>{
  const f=await accessFixture(t),expired=f.store.issueInvite({createdBy:f.admin.id,redeemMinutes:1}),disabled=f.store.issueInvite({createdBy:f.admin.id});
  assert.equal((await f.request('/api/access/admin/invites/'+disabled.id+'/revoke',{body:{}})).status,200);
  assert.equal((await f.request('/api/access/viewer/redeem',{cookie:'',body:{code:disabled.code}})).status,400);
  f.advance(60000);assert.equal((await f.request('/api/access/viewer/redeem',{cookie:'',body:{code:expired.code}})).status,400);
  const invitation=f.store.issueInvite({createdBy:f.admin.id});
  const results=await Promise.all([0,1].map(()=>f.request('/api/access/viewer/redeem',{cookie:'',body:{code:invitation.code}})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
  const viewer=results.find(r=>r.status===200).headers.get('set-cookie').split(';')[0];
  const session=f.store.db.prepare('SELECT id FROM pia_viewer_sessions WHERE invite_id=?').get(invitation.id);
  assert.equal((await f.request('/api/access/admin/sessions/'+session.id+'/revoke',{body:{}})).status,200);
  assert.equal((await f.request('/api/vps/stores',{cookie:viewer})).status,401);
});

test('actual HTTP handling and audit never write submitted codes, cookies or enrollment tokens to logs',async t=>{
  const f=await accessFixture(t),grant=f.store.issueEnrollment({kind:'additional',createdBy:f.admin.id}),invite=f.store.issueInvite({createdBy:f.admin.id}),viewer=f.store.redeemInvite(f.store.issueInvite({createdBy:f.admin.id}).code);
  const script=fileURLToPath(new URL('./helpers/access-log-probe.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[script],{input:JSON.stringify({dbPath:f.dbPath,now:f.now(),code:invite.code,token:grant.token,cookie:f.cookie,viewerCookie:'__Host-jugest_pia='+viewer.token}),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  for(const secret of [grant.token,f.cookie.split('=')[1],viewer.token,invite.code])assert.ok(!(result.stdout+result.stderr+JSON.stringify(f.store.db.prepare('SELECT * FROM access_audit_events').all())).includes(secret));
});

for(const [name,invalidate,status] of [
  ['session revoked',f=>f.store.revokeAdminSession(f.store.authenticateAdmin(f.cookie.split('=')[1]).id,'cli'),401],
  ['fresh verification expired',f=>f.advance(300000),403]
])test('important operation rechecks authorization after a delayed request body: '+name,async t=>{
  const f=await accessFixture(t),invite=f.store.issueInvite({createdBy:f.admin.id});
  let request;
  const response=new Promise((resolve,reject)=>{
    request=http.request(f.base+'/api/access/admin/invites/'+invite.id+'/revoke',{method:'POST',headers:{cookie:f.cookie,origin:ORIGIN,'content-type':'application/json','x-jugest-access':'1'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))});request.on('error',reject);request.write('{');
  });
  for(let i=0;i<100&&!f.store.db.prepare("SELECT 1 FROM access_rate_limits WHERE bucket='global:admin'").get();i++)await nextTick();
  assert.ok(f.store.db.prepare("SELECT 1 FROM access_rate_limits WHERE bucket='global:admin'").get());
  invalidate(f);request.end('}');assert.equal(await response,status);
  assert.equal(f.store.listState().invites.find(i=>i.id===invite.id).status,'unused');
});

test('confirmed proxy has independent peer limits, while spoofed headers cannot bypass the default limit',async t=>{
  const safe=await accessFixture(t),proxy=await accessFixture(t,{trustLoopbackProxy:true});
  for(let i=0;i<10;i++)assert.equal((await proxy.request('/api/access/viewer/redeem',{cookie:'',body:{code:'bad'},extra:{'x-real-ip':'192.0.2.1'}})).status,400);
  assert.equal((await proxy.request('/api/access/viewer/redeem',{cookie:'',body:{code:'bad'},extra:{'x-real-ip':'192.0.2.1'}})).status,429);
  assert.equal((await proxy.request('/api/access/viewer/redeem',{cookie:'',body:{code:'bad'},extra:{'x-real-ip':'192.0.2.2'}})).status,400);
  for(let i=0;i<10;i++)assert.equal((await safe.request('/api/access/viewer/redeem',{cookie:'',body:{code:'bad'},extra:{'x-real-ip':'192.0.2.'+(i+1)}})).status,400);
  assert.equal((await safe.request('/api/access/viewer/redeem',{cookie:'',body:{code:'bad'},extra:{'x-real-ip':'192.0.2.100'}})).status,429);
});

test('unknown access routes do not create attacker-selected rate-limit buckets',async t=>{
  const f=await accessFixture(t);
  for(let i=0;i<3;i++)assert.equal((await f.request('/api/access/unknown-'+i,{cookie:'',body:{}})).status,404);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM access_rate_limits').get().n,0);
});

test('peer-rejected attempts cannot exhaust the authentication budget of other peers',async t=>{
  const f=await accessFixture(t,{trustLoopbackProxy:true});
  for(let i=0;i<101;i++)await f.request('/api/access/login/options',{cookie:'',body:{},extra:{'x-real-ip':'192.0.2.1'}});
  assert.equal((await f.request('/api/access/login/options',{cookie:'',body:{},extra:{'x-real-ip':'192.0.2.2'}})).status,200);
  assert.equal(f.store.db.prepare("SELECT count FROM access_rate_limits WHERE bucket='global:/api/access/login/options'").get().count,11);
});

test('owner mode continues to allow the existing owner and PIA cookie never authorizes private MCP tools',async t=>{
  const previous={mode:process.env.JUGEST_PIA_ACCESS_MODE,ids:process.env.JUGEST_PIA_OWNER_CHANNEL_IDS};
  t.after(()=>{for(const [key,value] of [['JUGEST_PIA_ACCESS_MODE',previous.mode],['JUGEST_PIA_OWNER_CHANNEL_IDS',previous.ids]]){if(value===undefined)delete process.env[key];else process.env[key]=value}});
  const f=await accessFixture(t);process.env.JUGEST_PIA_ACCESS_MODE='owner';process.env.JUGEST_PIA_OWNER_CHANNEL_IDS=f.owner['x-jugest-channel-id'];
  assert.equal((await fetch(f.base+'/api/vps/stores/pia:35/days',{headers:f.owner})).status,200);
  process.env.JUGEST_PIA_OWNER_CHANNEL_IDS='different-owner';assert.equal((await fetch(f.base+'/api/vps/stores/pia:35/days',{headers:f.owner})).status,403);
  const invite=f.store.issueInvite({createdBy:f.admin.id}),session=f.store.redeemInvite(invite.code),cookie='__Host-jugest_pia='+session.token;
  assert.equal((await f.request('/api/vps/stores/pia:35/days',{cookie})).status,200);
  const tools=['list_stores','get_store_days','get_store_day','get_store_analysis','get_store_status','get_store_analysis_history','get_store_prediction','get_store_comparison'];
  for(const name of tools){
    const result=await (await f.request('/mcp',{cookie,origin:'',body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{storeId:'pia:35',date:'2026-10-05'}}}})).json();
    assert.equal(result.result.isError,true,name);assert.ok(!JSON.stringify(result).includes('3090'));
  }
  const publicJudge=await (await f.request('/mcp',{cookie,origin:'',body:{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'judge_machines',arguments:{machines:[]}}}})).json();assert.equal(publicJudge.result.isError,false);assert.equal(publicJudge.result.structuredContent.ok,true);
});
