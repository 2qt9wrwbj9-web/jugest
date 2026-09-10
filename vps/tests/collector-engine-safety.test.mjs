import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {addCollectorStore,setCollectorStoreEnabled,ensureCollectorTargets,getCollectorDay,resetCollectorDay} from '../src/collector/repository.mjs';
import {persistCollectedDay} from '../src/collector/persist.mjs';
import {runCollectorOnce} from '../src/collector/engine.mjs';

const NOW='2026-09-09T19:00:00.000Z';
const HTML='<html><body><table><tr><th>台番</th><th>機種名</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr><tr><td>1</td><td>マイジャグラーV</td><td>6000</td><td>300</td><td>22</td><td>20</td></tr></table></body></html>';
function fixture(){const dir=mkdtempSync(join(tmpdir(),'jugest-engine-safe-'));const db=openDatabase(join(dir,'db.sqlite'));migrate(db);return{db,dir,cleanup(){try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}}}
function seed(db,start='2026-09-08'){addCollectorStore(db,{storeId:'abc',slug:'abc',name:'ABC',historyStart:start,nowIso:NOW});setCollectorStoreEnabled(db,{storeId:'abc',enabled:true,nowIso:NOW});ensureCollectorTargets(db,{now:new Date(NOW),historyBackfill:true})}
function day(date='2026-09-09'){return{date,sourceUrl:`https://ana-slo.com/${date}-abc-data/`,machines:[{machine:'my',category:'juggler',sourceMachineName:'マイジャグラーV',tableNo:'1',games:6000,diff:300,bb:22,rb:20}],quality:{score:100,grade:'A',warnings:[],totalMachines:1}}}
function transport(){return async url=>({ok:true,status:200,statusText:'OK',url,text:async()=>HTML})}
function archive(){return async({root,storeId,date,html})=>({path:`${root}/${storeId}/${date}.html.gz`,sha256:'d'.repeat(64),bytes:Buffer.byteLength(html)})}

test('quality D response remains pending and is retried later',async()=>{
  const f=fixture();try{seed(f.db,'2026-09-09');
    await runCollectorOnce({db:f.db,rawRoot:f.dir,clock:()=>new Date(NOW),transport:transport(),archive:archive(),parser:({date,sourceUrl})=>({...day(date),sourceUrl,quality:{score:40,grade:'D',warnings:['bad'],totalMachines:1}}),sleep:async()=>{},maxRequests:1});
    const state=getCollectorDay(f.db,'abc','2026-09-09');assert.equal(state.state,'pending');assert.equal(state.retryAfter,'2026-09-09T19:45:00.000Z');assert.match(state.lastErrorClass,/quality/i);
  }finally{f.cleanup()}}
);

test('archive failure does not destroy prior canonical data during manual reacquisition',async()=>{
  const f=fixture();try{seed(f.db,'2026-09-09');
    persistCollectedDay(f.db,{store:{storeId:'abc',name:'ABC',slug:'abc'},day:day(),rawArtifact:{path:'/raw/old.gz',sha256:'a'.repeat(64)},nowIso:NOW});
    const old=f.db.prepare('SELECT normalized_payload_hash FROM store_days WHERE store_id=? AND business_date=?').get('abc','2026-09-09').normalized_payload_hash;
    resetCollectorDay(f.db,{storeId:'abc',businessDate:'2026-09-09',nowIso:NOW});
    await runCollectorOnce({db:f.db,rawRoot:f.dir,clock:()=>new Date(NOW),transport:transport(),archive:async()=>{throw new Error('disk full')},sleep:async()=>{},maxRequests:1});
    assert.equal(getCollectorDay(f.db,'abc','2026-09-09').state,'pending');
    assert.equal(f.db.prepare('SELECT normalized_payload_hash FROM store_days WHERE store_id=? AND business_date=?').get('abc','2026-09-09').normalized_payload_hash,old);
  }finally{f.cleanup()}}
);

test('two collector invocations cannot overlap source requests',async()=>{
  const f=fixture();try{seed(f.db);
    let active=0,maxActive=0,releaseFirst;const gate=new Promise(r=>{releaseFirst=r});let calls=0;
    const slowTransport=async url=>{calls++;active++;maxActive=Math.max(maxActive,active);if(calls===1)await gate;active--;return{ok:true,status:200,statusText:'OK',url,text:async()=>HTML}};
    const common={db:f.db,rawRoot:f.dir,clock:()=>new Date(NOW),transport:slowTransport,archive:archive(),sleep:async()=>{},maxRequests:1};
    const first=runCollectorOnce({...common,owner:'collector-one'});
    await new Promise(r=>setTimeout(r,10));
    const second=await runCollectorOnce({...common,owner:'collector-two'});
    releaseFirst();await first;
    assert.equal(maxActive,1);assert.equal(second.result,'already_running');assert.equal(calls,1);
  }finally{f.cleanup()}}
);
