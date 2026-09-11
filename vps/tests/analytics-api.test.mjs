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
import {canonicalJson,hashCanonical} from '../src/canonical-json.mjs';

const CHANNEL='channel_api_test_123';
const TOKEN='receiver-token-api-test-1234567890';
const VERSION='vps-runtime-v1';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');

async function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-analytics-api-'));
  const root=join(dir,'web');
  const relayDbPath=join(dir,'relay.sqlite');
  const canonicalDbPath=join(dir,'jugest.sqlite');
  const rawRoot=join(dir,'raw');
  await import('node:fs/promises').then(fs=>fs.mkdir(root,{recursive:true}));
  writeFileSync(join(root,'index.html'),'<title>JUGEST API TEST</title>');
  const relay=createRelayStore('juggler-relay-v1',{dbPath:relayDbPath,root:'jugest'});
  await relay.setJSON(`channel/${CHANNEL}`,{version:1,createdAt:1,claimedAt:1,revokedAt:0,receiverHash:digest(TOKEN),senderHash:'sender'});

  const db=openDatabase(canonicalDbPath);migrate(db);
  const now='2026-09-11T09:00:00.000Z';
  const seedStore=(id,name,channel)=>db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,name,canonicalJson({collectorChannelId:channel,source:'ana-slo-ios-relay'}),now,now);
  seedStore('store-a','認証店舗',CHANNEL);
  seedStore('store-b','他人店舗','another-channel');
  for(const [i,date] of ['2026-09-01','2026-09-02'].entries()){
    db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at)
      VALUES(?,?,?,?,?,'valid',?,?,?)`).run('store-a',date,'fixture','raw-secret-'+i,'norm-'+i,join(rawRoot,date+'.html.gz'),now,now);
    db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)').run('store-a',date,'000000',canonicalJson({machine:'my',tableNo:'101',games:5000+i*100,bb:20,rb:18,diff:100}));
  }
  const analysis={shop:'認証店舗',from:'2026-09-01',latest:'2026-09-02',days:2,rowCount:2,machines:[],positive:[],negative:[],patterns:[],machinePatterns:[]};
  db.prepare(`INSERT INTO client_snapshots(store_id,snapshot_type,version,business_date,payload_json,payload_hash,updated_at) VALUES(?,?,?,?,?,?,?)`).run('store-a','store-analysis-default',VERSION,'2026-09-02',canonicalJson(analysis),hashCanonical(analysis),now);
  const status={status:'analyzed',generation:2,completedGeneration:2,businessDate:'2026-09-02'};
  db.prepare(`INSERT INTO client_snapshots(store_id,snapshot_type,version,business_date,payload_json,payload_hash,updated_at) VALUES(?,?,?,?,?,?,?)`).run('store-a','store-latest-status',VERSION,'2026-09-02',canonicalJson(status),hashCanonical(status),now);
  db.prepare(`INSERT INTO analysis_receipts(store_id,target_date,component,version,input_hash,output_hash,created_at) VALUES(?,?,?,?,?,?,?)`).run('store-a','2026-09-02','store-analysis-default',VERSION,'i'.repeat(64),'o'.repeat(64),now);
  db.close();

  const server=createWebServer({rootDir:root,relayDbPath,canonicalDbPath,rawRoot});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const auth={'authorization':`Bearer ${TOKEN}`,'x-jugest-channel-id':CHANNEL};
  return {base,auth,async close(){server.closeAllConnections?.();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true})}};
}

test('analytics API rejects missing and invalid receiver credentials',async()=>{
  const f=await fixture();
  try{
    assert.equal((await fetch(`${f.base}/api/vps/stores`)).status,401);
    assert.equal((await fetch(`${f.base}/api/vps/stores`,{headers:{...f.auth,authorization:'Bearer wrong-token'}})).status,401);
  }finally{await f.close()}
});

test('store enumeration is restricted to the authenticated Collector channel',async()=>{
  const f=await fixture();
  try{
    const response=await fetch(`${f.base}/api/vps/stores`,{headers:f.auth});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.ok,true);
    assert.deepEqual(body.stores.map(x=>x.id),['store-a']);
    assert.equal(body.stores[0].name,'認証店舗');
    assert.doesNotMatch(JSON.stringify(body),/receiver-token|raw-secret|rawRoot|artifact/i);
  }finally{await f.close()}
});

test('authorized browser can read compact days, one day, analysis, history and status without raw paths',async()=>{
  const f=await fixture();
  try{
    const days=await (await fetch(`${f.base}/api/vps/stores/store-a/days?limit=1`,{headers:f.auth})).json();
    assert.deepEqual(days.days.map(x=>x.date),['2026-09-02']);
    assert.equal(days.days[0].machineCount,1);
    assert.doesNotMatch(JSON.stringify(days),/raw-secret|html\.gz/);

    const day=await (await fetch(`${f.base}/api/vps/stores/store-a/days/2026-09-01`,{headers:f.auth})).json();
    assert.equal(day.day.date,'2026-09-01');
    assert.equal(day.day.machines[0].tableNo,'101');
    assert.doesNotMatch(JSON.stringify(day),/raw-secret|html\.gz/);

    const analysis=await (await fetch(`${f.base}/api/vps/stores/store-a/analysis/default`,{headers:f.auth})).json();
    assert.equal(analysis.analysis.shop,'認証店舗');
    assert.equal(analysis.analysis.rowCount,2);

    const history=await (await fetch(`${f.base}/api/vps/stores/store-a/analysis/history`,{headers:f.auth})).json();
    assert.equal(history.history.length,1);
    assert.equal(history.history[0].targetDate,'2026-09-02');

    const status=await (await fetch(`${f.base}/api/vps/stores/store-a/status`,{headers:f.auth})).json();
    assert.equal(status.status.status,'analyzed');
  }finally{await f.close()}
});

test('cross-channel store reads are forbidden and analytics API is read-only',async()=>{
  const f=await fixture();
  try{
    assert.equal((await fetch(`${f.base}/api/vps/stores/store-b/status`,{headers:f.auth})).status,403);
    const post=await fetch(`${f.base}/api/vps/stores`,{method:'POST',headers:f.auth});
    assert.equal(post.status,405);
    assert.equal(post.headers.get('allow'),'GET, HEAD');
  }finally{await f.close()}
});
