import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createWebServer} from '../src/web-server.mjs';
import {createRelayStore} from '../src/relay-store.mjs';
import {openDatabase} from '../src/db.mjs';

const CHANNEL='channel_backfill_api_123';
const TOKEN='receiver-token-backfill-api-test-1234567890';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');

function localDay({date='2026-08-01',shop='認証店舗',games=5000}={}){
  return {date,shop,source:'ana-slo',sourceUrl:`https://ana-slo.com/${date}-shop-data/`,capturedAt:'2026-08-02T00:00:00.000Z',machines:[
    {machine:'my',category:'juggler',sourceMachineName:'マイジャグラーV',tableNo:'101',games,bb:20,rb:18,diff:900}
  ]};
}

async function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-backfill-api-'));
  const root=join(dir,'web');mkdirSync(root,{recursive:true});writeFileSync(join(root,'index.html'),'<title>backfill</title>');
  const relayDbPath=join(dir,'relay.sqlite'),canonicalDbPath=join(dir,'jugest.sqlite'),rawRoot=join(dir,'raw');
  const relay=createRelayStore('juggler-relay-v1',{dbPath:relayDbPath,root:'jugest'});
  await relay.setJSON(`channel/${CHANNEL}`,{version:1,createdAt:1,claimedAt:1,revokedAt:0,receiverHash:digest(TOKEN),senderHash:'sender'});
  await relay.setJSON(`ios-collector-config/${CHANNEL}`,{version:1,channelId:CHANNEL,stores:[{sourceStoreId:'store-a',shop:'認証店舗',url:'https://ana-slo.com/2026-09-01-shop-data/',enabled:true,priority:2}]});
  const server=createWebServer({rootDir:root,relayDbPath,canonicalDbPath,rawRoot});server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`,auth={'authorization':`Bearer ${TOKEN}`,'x-jugest-channel-id':CHANNEL,'content-type':'application/json'};
  return {base,auth,canonicalDbPath,async close(){server.closeAllConnections?.();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true})}};
}

async function post(f,days,headers=f.auth){
  const response=await fetch(`${f.base}/api/vps/backfill`,{method:'POST',headers,body:JSON.stringify({days})});
  return {status:response.status,body:await response.json()};
}

test('device backfill endpoint requires existing receiver authentication',async()=>{
  const f=await fixture();try{
    assert.equal((await post(f,[localDay()],{'content-type':'application/json'})).status,401);
    assert.equal((await post(f,[localDay()],{...f.auth,authorization:'Bearer wrong'})).status,401);
  }finally{await f.close()}
});

test('device backfill inserts configured local days and is idempotent',async()=>{
  const f=await fixture();try{
    const first=await post(f,[localDay()]);
    assert.equal(first.status,200);assert.equal(first.body.ok,true);assert.equal(first.body.inserted,1);assert.equal(first.body.duplicates,0);
    const again=await post(f,[localDay()]);
    assert.equal(again.status,200);assert.equal(again.body.inserted,0);assert.equal(again.body.duplicates,1);
    const db=openDatabase(f.canonicalDbPath);try{
      const day=db.prepare('SELECT parser_version FROM store_days WHERE store_id=? AND business_date=?').get('store-a','2026-08-01');
      assert.equal(day.parser_version,'device-indexeddb-backfill-v1');
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM machine_day_data WHERE store_id=?').get('store-a').n,1);
    }finally{db.close()}
  }finally{await f.close()}
});

test('device backfill skips unconfigured shops and rejects oversized batches',async()=>{
  const f=await fixture();try{
    const mixed=await post(f,[localDay(),localDay({date:'2026-08-02',shop:'別店舗'})]);
    assert.equal(mixed.status,200);assert.equal(mixed.body.inserted,1);assert.equal(mixed.body.skipped,1);assert.equal(mixed.body.results[1].code,'store_not_configured');
    const tooMany=await post(f,Array.from({length:31},(_,i)=>localDay({date:`2026-07-${String(i+1).padStart(2,'0')}`})));
    assert.equal(tooMany.status,400);assert.equal(tooMany.body.code,'batch_too_large');
  }finally{await f.close()}
});
