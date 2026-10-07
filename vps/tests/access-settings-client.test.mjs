import test from 'node:test';
import assert from 'node:assert/strict';
import {createVpsAnalyticsClient} from '../../vps-browser-analytics.mjs';
import {createRemoteStoreCache} from '../../vps-ui-remote-stores.mjs';
import {accessFixture,CHANNEL,TOKEN} from './helpers/access-fixture.mjs';
import {createRelayStore} from '../src/relay-store.mjs';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';

test('normal PIA client uses the viewer grant even with a valid unrelated Receiver, and honors stop',async t=>{
  const f=await accessFixture(t);
  const relay=createRelayStore('juggler-relay-v1',{dbPath:join(dirname(f.dbPath),'relay.sqlite'),root:'jugest'});
  await relay.setJSON('channel/unrelated-receiver',{receiverHash:createHash('sha256').update('unrelated-test-token').digest('hex'),revokedAt:0});
  const invite=f.store.issueInvite({createdBy:f.admin.id,viewerHours:null}),viewer=f.store.redeemInvite(invite.code);
  const storage={getItem(){return JSON.stringify({linked:true,channelId:'unrelated-receiver',receiverToken:'unrelated-test-token'})}};
  const client=createVpsAnalyticsClient({piaOnly:true,storage,baseUrl:f.base+'/api/vps',fetchFn:(url,options)=>fetch(url,{...options,headers:{...options.headers,cookie:'__Host-jugest_pia='+viewer.token}})});
  assert.deepEqual((await client.listStores()).map(s=>s.id),['pia:35']);
  assert.deepEqual((await client.getStoreDaysById('pia:35')).days.map(d=>d.date),['2026-10-05']);
  assert.equal((await client.getStoreDayById('pia:35','2026-10-05')).day.machines[0].tableNo,'3090');
  await assert.rejects(client.getStoreDayById('private','2026-10-05'),e=>e.status===403);
  assert.equal((await f.request('/api/access/admin/state',{cookie:'__Host-jugest_pia='+viewer.token})).status,403);
  f.store.revokeViewerSession(viewer.id,f.admin.id);
  assert.deepEqual(await client.listStores(),[]);
  await assert.rejects(client.getStoreDayById('pia:35','2026-10-05'),e=>e.status===403);
});

test('normal PIA client preserves an existing owner without an access cookie',async t=>{
  const f=await accessFixture(t);
  const storage={getItem(){return JSON.stringify({linked:true,channelId:CHANNEL,receiverToken:TOKEN})}};
  const client=createVpsAnalyticsClient({piaOnly:true,storage,baseUrl:f.base+'/api/vps'});
  assert.ok((await client.listStores()).some(s=>s.id==='pia:35'));
  assert.equal((await client.getStoreDayById('pia:35','2026-10-05')).day.machines[0].tableNo,'3090');
});

test('PIA-only browser client reads through HttpOnly cookies without Collector credentials',async()=>{
  const calls=[];
  const client=createVpsAnalyticsClient({piaOnly:true,storage:{getItem(){return null}},fetchFn:async(url,options)=>{
    calls.push({url,options});return new Response(JSON.stringify({ok:true,stores:[{id:'pia:35',name:'PIA'}],days:[],day:{machines:[]}}));
  }});
  await client.listStores();await client.getStoreDaysById('pia:35');await client.getStoreDayById('pia:35','2026-10-05');
  assert.equal(calls.length,3);
  assert.ok(calls.every(c=>c.options.credentials==='same-origin'&&!c.options.headers.authorization));
  await assert.rejects(()=>client.getDefaultAnalysis('PIA'),e=>e.code==='vps_credentials_unavailable');
});

test('PIA sharing remains usable with a stale Receiver without sending its rejected credentials',async()=>{
  let count=0;
  const storage={getItem(){return JSON.stringify({linked:true,channelId:'owner',receiverToken:'stale'})}};
  const client=createVpsAnalyticsClient({piaOnly:true,storage,fetchFn:async(url,options)=>{
    count++;
    if(options.headers.authorization)return new Response(JSON.stringify({ok:false,code:'receiver_unauthorized'}),{status:401});
    return new Response(JSON.stringify({ok:true,stores:[{id:'pia:35'}]}));
  }});
  assert.deepEqual(await client.listStores(),[{id:'pia:35'}]);assert.equal(count,1);
});

test('remote PIA cache clears acquired data after lost permission and rejects an in-flight stale response',async()=>{
  let fail=false,release;
  const listed=[{id:'pia:35',name:'PIA',source:'pia-public-ranking-top',visibility:'public',latestDate:'2026-10-05'}];
  const client={async listStores(){if(fail){const e=new Error('denied');e.status=401;throw e}return listed},async getStoreDaysById(){return {days:[{date:'2026-10-05'}]}},async getStoreDayById(){return {day:{date:'2026-10-05',machines:[{tableNo:'3090'}]}}}};
  const cache=createRemoteStoreCache({client,eventTarget:new EventTarget()});await cache.refresh();
  assert.equal(cache.getDay('PIA','2026-10-05').rows.length,1);
  fail=true;await assert.rejects(cache.refresh());assert.deepEqual(cache.getStores(),[]);assert.equal(cache.getDay('PIA','2026-10-05'),null);
  fail=false;client.getStoreDayById=()=>new Promise(r=>{release=r});
  const pending=cache.refresh();while(!release)await new Promise(r=>setImmediate(r));
  cache.clear();release({day:{date:'2026-10-05',machines:[{tableNo:'stale'}]}});await pending;
  assert.deepEqual(cache.getStores(),[]);assert.equal(cache.getDay('PIA','2026-10-05'),null);
});
