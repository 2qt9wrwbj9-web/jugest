import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createWebServer} from '../src/web-server.mjs';
import {createRelayStore} from '../src/relay-store.mjs';
import {rotateAssistantReadKey} from '../src/assistant-read-key.mjs';
import {OAUTH_ISSUER,OAUTH_RESOURCE,OAUTH_SCOPE} from '../src/oauth-handler.mjs';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {migrateAccessDatabase,createAccessStore} from '../src/access/store.mjs';
import {createVpsAnalyticsClient} from '../../vps-browser-analytics.mjs';
const rootDir=path.resolve(import.meta.dirname,'../..'),channel='allocation_channel_123',token='allocation-receiver-secret';
const digest=v=>createHash('sha256').update(v).digest('hex');
async function fixture(){
  const dir=mkdtempSync(path.join(tmpdir(),'allocation-api-')),relayDbPath=path.join(dir,'relay.sqlite'),canonicalDbPath=path.join(dir,'canonical.sqlite'),accessDb=path.join(dir,'access.sqlite');
  const relay=createRelayStore('juggler-relay-v1',{dbPath:relayDbPath});
  await relay.setJSON('channel/'+channel,{receiverHash:digest(token),revokedAt:0});
  const key=await rotateAssistantReadKey(relayDbPath,channel);
  const oauth=createRelayStore('jugest-oauth-v1',{dbPath:relayDbPath}),oauthToken='allocation-oauth-token';
  const oauthRecord={type:'access',issuer:OAUTH_ISSUER,resource:OAUTH_RESOURCE,scope:OAUTH_SCOPE,expiresAt:Date.now()+3600000,channelId:channel,clientId:'allocation-client'};
  await oauth.setJSON('access/'+digest(oauthToken),oauthRecord);
  const db=openDatabase(canonicalDbPath);migrate(db);
  for(const [id,metadata] of [['own',{collectorChannelId:channel,source:'ana-slo-ios-relay'}],['other',{collectorChannelId:'other',source:'ana-slo-ios-relay'}],['pia:35',{source:'pia-public-ranking-top',visibility:'public'}]]){
    db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,JSON.stringify(metadata),'a','a');
    db.prepare('INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,'2026-10-16','fixture','raw','norm','valid',path.join(dir,'raw','missing.gz'),'a','a');
    db.prepare('INSERT INTO machine_day_data VALUES(?,?,?,?)').run(id,'2026-10-16','0000',JSON.stringify({machine:'my',tableNo:'1',games:5000,bb:20,rb:20,diff:100}));
  }
  const snapshot=()=>JSON.stringify(db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all())+JSON.stringify(db.prepare('SELECT * FROM store_days ORDER BY store_id').all())+JSON.stringify(db.prepare('SELECT * FROM machine_day_data ORDER BY store_id').all())+JSON.stringify(db.prepare('SELECT * FROM jobs').all());
  const before=snapshot();
  migrateAccessDatabase(accessDb);const access=createAccessStore({dbPath:accessDb});
  const enrollment=access.issueEnrollment({kind:'bootstrap'});
  const credential=access.registerCredential({enrollmentId:enrollment.id,credential:{webauthnId:'test',publicKey:Buffer.from([1]),counter:0}});
  const admin=access.issueAdminSession(credential.id),invite=access.issueInvite({createdBy:credential.id,label:'test',redeemMinutes:10,viewerHours:24});
  const viewer=access.redeemInvite(invite.code);
  const lastBefore=access.db.prepare('SELECT last_used_at FROM pia_viewer_sessions').get().last_used_at;
  const priorOwner=process.env.JUGEST_PIA_OWNER_CHANNEL_IDS,priorMode=process.env.JUGEST_PIA_ACCESS_MODE;process.env.JUGEST_PIA_OWNER_CHANNEL_IDS=channel;process.env.JUGEST_PIA_ACCESS_MODE='owner';
  const server=createWebServer({rootDir,relayDbPath,canonicalDbPath,rawRoot:path.join(dir,'raw'),accessConfig:{dbPath:accessDb,origin:'http://localhost',rpID:'localhost',allowLocalhost:true}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port,auth={authorization:'Bearer '+token,'x-jugest-channel-id':channel};
  return {base,auth,key:key.key,viewer,admin,access,db,lastBefore,before,snapshot,dir,oauth,oauthToken,oauthRecord,relay,async close(){server.closeAllConnections?.();await new Promise(r=>server.close(r));db.close();access.close();if(priorOwner===undefined)delete process.env.JUGEST_PIA_OWNER_CHANNEL_IDS;else process.env.JUGEST_PIA_OWNER_CHANNEL_IDS=priorOwner;if(priorMode===undefined)delete process.env.JUGEST_PIA_ACCESS_MODE;else process.env.JUGEST_PIA_ACCESS_MODE=priorMode;rmSync(dir,{recursive:true,force:true})}};
}
const route='/api/vps/stores/own/days/2026-10-16/allocation';
test('exact read route authenticates owner/read key, keeps held data and does not mutate canonical',async()=>{
  const f=await fixture();try{
    assert.equal((await fetch(f.base+route)).status,401);
    for(const headers of [f.auth,{authorization:'Bearer '+f.key},{authorization:'Bearer '+f.oauthToken}]){
      const response=await fetch(f.base+route,{headers});assert.equal(response.status,200);
      const body=await response.json();assert.equal(body.ok,true);assert.equal(body.date,'2026-10-16');assert.equal(body.strongEnabled,false);
      assert.equal(body.groups[0].eligible,false);assert.equal(body.groups[0].nInstalled,null);
      assert.equal(body.access.canCompute,headers===f.auth);
      assert.ok(!JSON.stringify(body).includes(f.dir));
      assert.equal((await fetch(f.base+route.replace('/own/','/other/'),{headers})).status,403);
    }
    assert.equal(f.snapshot(),f.before);
    assert.equal((await fetch(f.base+route,{method:'HEAD',headers:f.auth})).status,200);
    assert.equal((await fetch(f.base+route.replace('2026-10-16','2026-10-15'),{headers:f.auth})).status,404);
  }finally{await f.close()}
});
test('OAuth reads enforce scope, resource, expiry and channel revocation without deleting expired records',async()=>{
  const f=await fixture();try{
    const headers={authorization:'Bearer '+f.oauthToken},key='access/'+digest(f.oauthToken);
    for(const patch of [{scope:'other:read'},{resource:'https://other.example/mcp'},{issuer:'https://other.example'},{expiresAt:Date.now()-100},{expiresAt:null}]){
      const record={...f.oauthRecord,...patch};await f.oauth.setJSON(key,record);
      assert.equal((await fetch(f.base+route,{headers})).status,401,JSON.stringify(patch));
      assert.deepEqual(await f.oauth.get(key,{type:'json'}),record);
    }
    await f.oauth.setJSON(key,f.oauthRecord);
    await f.relay.setJSON('channel/'+channel,{receiverHash:digest(token),revokedAt:Date.now()});
    assert.equal((await fetch(f.base+route,{headers})).status,401);
  }finally{await f.close()}
});
test('PIA sharing is bounded and read-only including authentication timestamps; revoked sessions fail',async()=>{
  const f=await fixture();try{
    const headers={cookie:'__Host-jugest_pia='+f.viewer.token};
    assert.equal((await fetch(f.base+route.replace('/own/','/pia%3A35/'),{headers})).status,200);
    assert.equal((await fetch(f.base+route,{headers})).status,403);
    assert.equal(f.access.db.prepare('SELECT last_used_at FROM pia_viewer_sessions').get().last_used_at,f.lastBefore);
    assert.equal((await fetch(f.base+route.replace('/own/','/pia%3A35/'),{headers:{...headers,'sec-fetch-site':'cross-site'}})).status,401);
    f.access.revokeViewerSession(f.viewer.id,'test');
    assert.equal((await fetch(f.base+route.replace('/own/','/pia%3A35/'),{headers})).status,401);
  }finally{await f.close()}
});
test('the genuine allocation client resolves names through readonly storage and authentication',async()=>{
  const f=await fixture();try{
    const beforeTables=JSON.stringify(f.db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all()),requests=[];
    const client=createVpsAnalyticsClient({piaOnly:true,storage:null,fetchFn:(url,options)=>{requests.push(url);return fetch(f.base+url,{...options,headers:{...options.headers,cookie:'__Host-jugest_pia='+f.viewer.token}})}});
    const report=await client.getAllocation('pia:35','2026-10-16');assert.equal(report.ok,true);
    assert.equal(requests[0],'/api/vps/allocation/stores');
    assert.equal(requests.length,2);
    assert.equal(f.snapshot(),f.before);assert.equal(JSON.stringify(f.db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all()),beforeTables);
    assert.equal(f.access.db.prepare('SELECT last_used_at FROM pia_viewer_sessions').get().last_used_at,f.lastBefore);
    assert.equal((await fetch(f.base+'/api/vps/allocation/stores')).status,401);
    const list=await (await fetch(f.base+'/api/vps/allocation/stores',{headers:f.auth})).json();
    assert.deepEqual(list.stores.map(s=>s.id),['own','pia:35']);assert.doesNotMatch(JSON.stringify(list),/collectorChannelId|metadata|secret|sqlite/);
  }finally{await f.close()}
});
test('route rejects mutation, unknown/duplicate query and impossible date without creating data',async()=>{
  const f=await fixture();try{
    assert.equal((await fetch(f.base+route,{method:'POST',headers:f.auth})).status,405);
    for(const tail of ['?prior=high','?machine=my&machine=im','?detail=1','?machine=unknown&detail=1','?machine=my&detail=1&kind=rounded','?machine=my&detail=1&count=-1'])assert.equal((await fetch(f.base+route+tail,{headers:f.auth})).status,400,tail);
    assert.equal((await fetch(f.base+route.replace('2026-10-16','2026-02-30'),{headers:f.auth})).status,400);
    assert.equal(f.snapshot(),f.before);assert.equal(existsSync(path.join(f.dir,'raw')),false);
  }finally{await f.close()}
});
