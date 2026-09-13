import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createWebServer} from '../src/web-server.mjs';
import {createRelayStore} from '../src/relay-store.mjs';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {canonicalJson} from '../src/canonical-json.mjs';
import {persistLivePrediction,scoreLiveComparisonDay} from '../src/research/live-comparison.mjs';

const CHANNEL='channel_comparison_api_123';
const OTHER='channel_comparison_other';
const TOKEN='receiver-token-comparison-api-1234567890';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const NOW='2026-09-15T09:00:00.000Z';

async function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-comparison-api-')),root=join(dir,'web'),relayDbPath=join(dir,'relay.sqlite'),canonicalDbPath=join(dir,'jugest.sqlite'),rawRoot=join(dir,'raw');
  await import('node:fs/promises').then(fs=>fs.mkdir(root,{recursive:true}));writeFileSync(join(root,'index.html'),'<title>JUGEST COMPARISON API</title>');
  const relay=createRelayStore('juggler-relay-v1',{dbPath:relayDbPath,root:'jugest'});
  await relay.setJSON(`channel/${CHANNEL}`,{version:1,createdAt:1,claimedAt:1,revokedAt:0,receiverHash:digest(TOKEN),senderHash:'sender'});
  const db=openDatabase(canonicalDbPath);migrate(db);
  const seed=(id,name,channel)=>db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,name,canonicalJson({collectorChannelId:channel}),NOW,NOW);
  seed('store-a','比較店舗',CHANNEL);seed('store-b','他人店舗',OTHER);
  const shared={storeId:'store-a',targetDate:'2026-09-14',sourceFrontierDate:'2026-09-13',createdAt:'2026-09-13T12:00:00.000Z'};
  persistLivePrediction(db,{...shared,engine:'pre_research',engineVersion:'store-read-v1',modelFingerprint:'fp-pre',featureVersion:'store-features-v1',inputHash:'pre-input',rankings:[{machineKey:'101',tableNo:'101',machineName:'my',rank:1,score:.9},{machineKey:'102',tableNo:'102',machineName:'my',rank:2,score:.2}]});
  persistLivePrediction(db,{...shared,engine:'current_shadow',engineVersion:'current-v5',modelFingerprint:'',featureVersion:null,inputHash:'shadow-input',rankings:[{machineKey:'102',tableNo:'102',machineName:'my',rank:1,score:90},{machineKey:'101',tableNo:'101',machineName:'my',rank:2,score:20}]});
  scoreLiveComparisonDay(db,{storeId:'store-a',targetDate:'2026-09-14',outcomeRows:[{machineKey:'101',outcomeScore:1000},{machineKey:'102',outcomeScore:-500}],outcomeInputHash:'outcome-hash-1',nowIso:NOW});
  db.close();
  const server=createWebServer({rootDir:root,relayDbPath,canonicalDbPath,rawRoot});server.listen(0,'127.0.0.1');await once(server,'listening');
  return {base:`http://127.0.0.1:${server.address().port}`,auth:{authorization:`Bearer ${TOKEN}`,'x-jugest-channel-id':CHANNEL},async close(){server.closeAllConnections?.();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true})}};
}

test('PRE shadow comparison endpoint is authenticated, store-scoped and bounded',async()=>{
  const f=await fixture();
  try{
    const path='/api/vps/stores/store-a/research/comparison?limit=9999';
    assert.equal((await fetch(`${f.base}${path}`)).status,401);
    assert.equal((await fetch(`${f.base}/api/vps/stores/store-b/research/comparison`,{headers:f.auth})).status,403);
    const response=await fetch(`${f.base}${path}`,{headers:f.auth});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.ok,true);
    assert.equal(body.store.id,'store-a');
    assert.equal(body.comparison.live.days,1);
    assert.equal(body.comparison.live.newWins,1);
    assert.equal(body.comparison.historical,null);
    assert.equal(body.limit,366);
    assert.equal(body.comparison.live.rows[0].predictions.pre_research.modelFingerprint,'fp-pre');
    assert.equal(body.comparison.live.rows[0].predictions.current_shadow.engineVersion,'current-v5');
    assert.doesNotMatch(JSON.stringify(body),/receiver-token|payload_json|model_json/i);
  }finally{await f.close()}
});
