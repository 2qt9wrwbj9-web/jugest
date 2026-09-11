import test from 'node:test';
import assert from 'node:assert/strict';

import {createVpsAnalyticsClient,readRelayReceiver} from '../vps-browser-analytics.mjs';

function storageWith(value){
  return {getItem(key){return key==='jugglerRelayReceiver:v1'?JSON.stringify(value):null}};
}

function jsonResponse(payload,status=200){
  return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json'}});
}

test('readRelayReceiver only accepts a linked channel with browser receiver credentials',()=>{
  assert.equal(readRelayReceiver(storageWith(null)),null);
  assert.equal(readRelayReceiver(storageWith({channelId:'abc',receiverToken:'secret',linked:false})),null);
  assert.deepEqual(readRelayReceiver(storageWith({channelId:'channel_123456789',receiverToken:'secret-token',linked:true,collectorKey:'never-send'})),{
    channelId:'channel_123456789',receiverToken:'secret-token'
  });
});

test('VPS browser client resolves a store then reads the precomputed default analysis with auth headers',async()=>{
  const calls=[];
  const fetchFn=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url)==='/api/vps/stores')return jsonResponse({ok:true,stores:[{id:'store-1',name:'グリーン'}]});
    if(String(url)==='/api/vps/stores/store-1/analysis/default')return jsonResponse({ok:true,analysis:{shop:'グリーン',days:180},businessDate:'2026-09-11',updatedAt:'2026-09-11T08:00:00Z'});
    throw new Error(`unexpected URL ${url}`);
  };
  const client=createVpsAnalyticsClient({fetchFn,storage:storageWith({channelId:'channel_123456789',receiverToken:'secret-token',linked:true})});
  const result=await client.getDefaultAnalysis('グリーン');
  assert.equal(result.analysis.shop,'グリーン');
  assert.equal(result.businessDate,'2026-09-11');
  assert.equal(calls.length,2);
  for(const call of calls){
    assert.equal(call.options.headers['x-jugest-channel-id'],'channel_123456789');
    assert.equal(call.options.headers.authorization,'Bearer secret-token');
    assert.equal(call.options.method,'GET');
  }
});

test('VPS browser client never falls through to local data when the canonical API has no snapshot',async()=>{
  const fetchFn=async(url)=>String(url)==='/api/vps/stores'
    ?jsonResponse({ok:true,stores:[{id:'store-1',name:'グリーン'}]})
    :jsonResponse({ok:true,analysis:null,businessDate:null,updatedAt:null});
  const client=createVpsAnalyticsClient({fetchFn,storage:storageWith({channelId:'channel_123456789',receiverToken:'secret-token',linked:true})});
  const result=await client.getDefaultAnalysis('グリーン');
  assert.equal(result.analysis,null);
});

test('VPS browser client reports unavailable credentials without sending a request',async()=>{
  let calls=0;
  const client=createVpsAnalyticsClient({fetchFn:async()=>{calls++;return jsonResponse({ok:true})},storage:storageWith(null)});
  await assert.rejects(()=>client.getDefaultAnalysis('グリーン'),error=>error?.code==='vps_credentials_unavailable');
  assert.equal(calls,0);
});
