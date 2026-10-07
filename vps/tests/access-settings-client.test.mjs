import test from 'node:test';
import assert from 'node:assert/strict';
import {createVpsAnalyticsClient} from '../../vps-browser-analytics.mjs';
import {createRemoteStoreCache} from '../../vps-ui-remote-stores.mjs';

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

test('PIA cookie fallback does not replace an existing owner but permits a stale Receiver browser to use its viewer cookie',async()=>{
  let count=0;
  const storage={getItem(){return JSON.stringify({linked:true,channelId:'owner',receiverToken:'stale'})}};
  const client=createVpsAnalyticsClient({piaOnly:true,storage,fetchFn:async(url,options)=>{
    count++;
    if(count===1){assert.equal(options.headers.authorization,'Bearer stale');return new Response(JSON.stringify({ok:false,code:'receiver_unauthorized'}),{status:401})}
    assert.equal(options.headers.authorization,undefined);return new Response(JSON.stringify({ok:true,stores:[]}));
  }});
  await client.listStores();assert.equal(count,2);
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
