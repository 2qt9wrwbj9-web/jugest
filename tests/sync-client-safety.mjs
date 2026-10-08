import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,memoryStorage} from './helpers/runtime.mjs';
import {syncHarness} from './helpers/sync-server.mjs';
import {readFileSync} from 'node:fs';
import {patchJugestIndexSource} from '../vps/src/ui-source-patch.mjs';
const STATE='juggler_tool_state_v33';

test('HTTP 200 without a verified JSON success cannot complete client sync',async()=>{
 const server=syncHarness();let corrupt=false;
 const fetch=async(url,opts)=>corrupt?new Response('gateway error',{status:200}):server.fetch(url,opts);
 const a=await boot({fetch,storage:memoryStorage({[STATE]:JSON.stringify({sessions:[{id:1,memo:'keep'}]})})});
 await a.bridge.createSyncShare();corrupt=true;
 await assert.rejects(a.bridge.runDeviceSync());
 assert.equal(a.ctx.JUGESTDeviceSync.getStatus().lastSyncAt,0);
});
test('corrupt local JSON blocks sync without replacing stored data',async()=>{
 const server=syncHarness(),a=await boot({fetch:server.fetch});await a.bridge.createSyncShare();
 a.storage.setItem('hanaJudgeStateV3','corrupt-json');
 await assert.rejects(a.ctx.JUGESTDeviceSync.syncNow());assert.equal(a.storage.getItem('hanaJudgeStateV3'),'corrupt-json');
 assert.equal(server.calls.filter(x=>x.action==='push').length,0);
});
test('incomplete local analysis record blocks sync instead of dropping the analysis index',async()=>{
 const data=new Map([['storeAnalysisHistoryIndexV1',[{id:'missing-snapshot'}]]]);
 const storage=memoryStorage();storage.idb=data;
 const server=syncHarness(),a=await boot({fetch:server.fetch,storage});await a.bridge.createSyncShare();
 await assert.rejects(a.ctx.JUGESTDeviceSync.syncNow());
 assert.deepEqual(data.get('storeAnalysisHistoryIndexV1'),[{id:'missing-snapshot'}]);
});
test('chunk commit must confirm precisely the next revision before marking sync complete',async()=>{
 const server=syncHarness();const fetch=async(url,opts)=>JSON.parse(opts.body).action==='pushCommit'?Response.json({ok:true,revision:0}):server.fetch(url,opts);
 const a=await boot({fetch,storage:memoryStorage({[STATE]:JSON.stringify({sessions:[{id:1,memo:'x'.repeat(2_000_000)}]})})});await a.bridge.createSyncShare();
 await assert.rejects(a.ctx.JUGESTDeviceSync.syncNow());assert.equal(a.ctx.JUGESTDeviceSync.getStatus().lastSyncAt,0);
 assert.equal(JSON.parse(a.storage.getItem(STATE)).sessions[0].memo.length,2_000_000);
});
test('non-array persisted external data is not interpreted as an empty package',async()=>{
 const server=syncHarness(),storage=memoryStorage();storage.idb=new Map([['externalDays',{damaged:true}]]);
 const a=await boot({fetch:server.fetch,storage});await a.bridge.createSyncShare();
 await assert.rejects(a.ctx.JUGESTDeviceSync.syncNow());assert.deepEqual(storage.idb.get('externalDays'),{damaged:true});assert.equal(server.calls.filter(x=>x.action==='push').length,0);
});
test('valid JSON with invalid STATE shape is not replaced during sync',async()=>{
 const server=syncHarness(),a=await boot({fetch:server.fetch});await a.bridge.createSyncShare();a.storage.setItem(STATE,'[]');
 await assert.rejects(a.ctx.JUGESTDeviceSync.syncNow());assert.equal(a.storage.getItem(STATE),'[]');
});
test('served UI protects corrupt initial STATE from autosave and bridge sync',async()=>{
 const server=syncHarness(),storage=memoryStorage(),htmlSource=patchJugestIndexSource(readFileSync('index.html','utf8'));
 const first=await boot({fetch:server.fetch,storage,htmlSource});await first.bridge.createSyncShare();storage.setItem(STATE,'{broken-existing-state');
 const next=await boot({fetch:server.fetch,storage,htmlSource});await next.tick(150);
 await assert.rejects(next.bridge.runDeviceSync());assert.equal(storage.getItem(STATE),'{broken-existing-state');assert.equal(next.ctx.JUGESTDeviceSync.getStatus().lastSyncAt,0);
 assert.equal(server.calls.filter(x=>x.action==='push').length,0);
});
