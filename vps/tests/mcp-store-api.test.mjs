import test from 'node:test';
import assert from 'node:assert/strict';
import {createJugestStoreApiClient} from '../src/mcp/store-api.mjs';

const BASE='http://127.0.0.1:3000';
const CHANNEL='channel_mcp_test_123';
const TOKEN='receiver-token-mcp-test-123456';

function fakeFetch(log,responses={}){
  return async(url,options={})=>{
    const href=String(url);
    log.push({href,options});
    const pathname=new URL(href).pathname+new URL(href).search;
    const entry=responses[pathname]??{status:200,body:{ok:true}};
    return new Response(JSON.stringify(entry.body),{status:entry.status,headers:{'content-type':'application/json'}});
  };
}

test('store API client always reuses existing receiver credentials and only allowlisted read endpoints',async()=>{
  const calls=[];
  const client=createJugestStoreApiClient({baseUrl:BASE,channelId:CHANNEL,receiverToken:TOKEN,fetchImpl:fakeFetch(calls,{
    '/api/vps/stores':{status:200,body:{ok:true,stores:[{id:'store-a',name:'A'}]}},
    '/api/vps/stores/store-a/days/2026-09-19':{status:200,body:{ok:true,day:{date:'2026-09-19',machines:[]}}},
    '/api/vps/stores/store-a/research/store-read':{status:200,body:{ok:true,storeRead:{status:'ready'}}},
    '/api/vps/stores/store-a/research/comparison?limit=90':{status:200,body:{ok:true,comparison:{}}}
  })});

  assert.equal((await client.listStores()).stores[0].id,'store-a');
  assert.equal((await client.getStoreDay('store-a','2026-09-19')).day.date,'2026-09-19');
  assert.equal((await client.getStoreRead('store-a')).storeRead.status,'ready');
  assert.equal((await client.getStoreComparison('store-a',90)).ok,true);

  assert.equal(calls.length,4);
  for(const call of calls){
    assert.equal(call.options.method,'GET');
    assert.equal(call.options.headers.authorization,`Bearer ${TOKEN}`);
    assert.equal(call.options.headers['x-jugest-channel-id'],CHANNEL);
  }
});

test('store API client rejects malformed identifiers before any request',async()=>{
  const calls=[];
  const client=createJugestStoreApiClient({baseUrl:BASE,channelId:CHANNEL,receiverToken:TOKEN,fetchImpl:fakeFetch(calls)});
  await assert.rejects(client.getStoreDay('../secret','2026-09-19'),/storeId/i);
  await assert.rejects(client.getStoreDay('store-a','19-09-2026'),/date/i);
  await assert.rejects(client.getStoreComparison('store-a',1000),/limit/i);
  assert.equal(calls.length,0);
});

test('store API client surfaces existing authorization failures without leaking receiver token',async()=>{
  const client=createJugestStoreApiClient({
    baseUrl:BASE,channelId:CHANNEL,receiverToken:TOKEN,
    fetchImpl:fakeFetch([],{'/api/vps/stores/store-b/research/store-read':{status:403,body:{ok:false,code:'forbidden'}}})
  });
  await assert.rejects(client.getStoreRead('store-b'),error=>{
    assert.equal(error.status,403);
    assert.match(error.message,/forbidden/i);
    assert.doesNotMatch(error.message,new RegExp(TOKEN));
    return true;
  });
});
