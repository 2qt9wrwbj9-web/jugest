import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,memoryStorage} from './helpers/runtime.mjs';
import {syncHarness} from './helpers/sync-server.mjs';
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
