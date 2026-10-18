import test from 'node:test';
import assert from 'node:assert/strict';
import {createVpsAnalyticsClient} from '../vps-browser-analytics.mjs';
const response=payload=>new Response(JSON.stringify(payload),{status:200});
test('allocation cookie transport permits only the exact read endpoint and passes cancellation',async()=>{
  const calls=[],controller=new AbortController();
  const client=createVpsAnalyticsClient({piaOnly:true,storage:null,fetchFn:async(url,options)=>{calls.push({url,options});return response(url.endsWith('/stores')?{ok:true,stores:[{id:'pia:35',name:'店舗'}]}:{ok:true,date:'2026-10-16',groups:[]})}});
  const r=await client.getAllocation('店舗','2026-10-16',{machine:'my',band:'6',kind:'exact',count:0,detail:true,signal:controller.signal});
  assert.equal(r.date,'2026-10-16');
  assert.equal(calls[0].url,'/api/vps/allocation/stores');
  const url=new URL(calls[1].url,'http://local');
  assert.equal(url.pathname,'/api/vps/stores/pia%3A35/days/2026-10-16/allocation');
  assert.equal(url.searchParams.get('count'),'0');assert.equal(url.searchParams.get('kind'),'exact');
  for(const call of calls){assert.equal(call.options.signal,controller.signal);assert.equal(call.options.credentials,'same-origin');assert.equal(call.options.method,'GET');assert.equal(call.options.headers.authorization,undefined)}
  await assert.rejects(client.getDefaultAnalysis('店舗'),error=>error.code==='vps_credentials_unavailable');
});
test('allocation rejects impossible dates and ambiguous store names without selecting another store/day',async()=>{
  let calls=0;
  const client=createVpsAnalyticsClient({piaOnly:true,storage:null,fetchFn:async()=>{calls++;return response({ok:true,stores:[{id:'a',name:'同名'},{id:'b',name:'同名'}]})}});
  await assert.rejects(client.getAllocation('同名','2026-02-30'),error=>error.code==='bad_date');assert.equal(calls,0);
  await assert.rejects(client.getAllocation('同名','2026-10-16'),error=>error.code==='vps_store_ambiguous');assert.equal(calls,1);
});
test('an aborted allocation request preserves AbortError instead of becoming a network result',async()=>{
  const controller=new AbortController();controller.abort();
  const client=createVpsAnalyticsClient({piaOnly:true,storage:null,fetchFn:async(url,options)=>{options.signal.throwIfAborted()}});
  await assert.rejects(client.getAllocationById('pia:35','2026-10-16',{signal:controller.signal}),error=>error.name==='AbortError');
});
test('allocation prefers a linked owner over a sharing cookie so that owner computation stays available',async()=>{
  const calls=[],storage={getItem:()=>JSON.stringify({linked:true,channelId:'owner_channel_123',receiverToken:'owner-secret'})};
  const client=createVpsAnalyticsClient({piaOnly:true,storage,fetchFn:async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/allocation/stores'))return response({ok:true,stores:[{id:'owned',name:'所有店舗'}]});
    if(!options.headers.authorization)return new Response(JSON.stringify({ok:false,code:'allocation_result_not_ready'}),{status:409});
    return response({ok:true,access:{canCompute:true},date:'2026-10-16'});
  }});
  assert.equal((await client.getAllocation('所有店舗','2026-10-16')).access.canCompute,true);
  assert.equal(calls.length,2);for(const call of calls)assert.equal(call.options.headers.authorization,'Bearer owner-secret');
});
test('an unrelated linked owner does not hide a separately authorized PIA sharing store',async()=>{
  const calls=[],storage={getItem:()=>JSON.stringify({linked:true,channelId:'other_channel_123',receiverToken:'other-secret'})};
  const client=createVpsAnalyticsClient({piaOnly:true,storage,fetchFn:async(url,options)=>{
    calls.push({url,owner:!!options.headers.authorization});
    if(url.endsWith('/allocation/stores'))return response({ok:true,stores:options.headers.authorization?[{id:'other',name:'別の店舗'}]:[{id:'pia:35',name:'PIA共有店'}]});
    return response({ok:true,date:'2026-10-16'});
  }});
  assert.equal((await client.getAllocation('PIA共有店','2026-10-16')).ok,true);
  assert.deepEqual(calls.map(x=>x.owner),[true,false,false]);
});
