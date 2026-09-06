import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,memoryStorage} from './helpers/runtime.mjs';
import {syncHarness} from './helpers/sync-server.mjs';
const STATE='juggler_tool_state_v33';
test('Two real sync-core clients encrypt, merge, persist, and reload without losing either device records',async()=>{
 const server=syncHarness();
 const a=await boot({fetch:server.fetch,storage:memoryStorage({[STATE]:JSON.stringify({sessions:[{id:1,date:'2026-09-01',memo:'device-a'}]})})});
 const share=await a.bridge.createSyncShare();a.bridge.prepareJudge('my');a.bridge.setJudgeG('3210');
 await a.bridge.runDeviceSync();a.emit('pagehide');
 assert.equal(+JSON.parse(a.storage.getItem(STATE)).data.my.G,3210);
 const b=await boot({fetch:server.fetch,storage:memoryStorage({[STATE]:JSON.stringify({sessions:[{id:1,date:'2026-09-02',memo:'device-b'}]})})});
 await b.bridge.joinSyncShare(share.code);await b.bridge.runDeviceSync();b.emit('pagehide');b.emit('beforeunload');
 assert.deepEqual(JSON.parse(b.storage.getItem(STATE)).sessions.map(s=>s.memo).sort(),['device-a','device-b']);
 const fresh=await boot({fetch:server.fetch,storage:a.storage});await fresh.bridge.runDeviceSync();fresh.emit('pagehide');
 assert.deepEqual(JSON.parse(a.storage.getItem(STATE)).sessions.map(s=>s.memo).sort(),['device-a','device-b']);
 assert.equal((await boot({fetch:server.fetch,storage:a.storage})).bridge.getSummary().runCount,2);
 for(const call of server.calls.filter(x=>x.action==='push')){assert.ok(call.payload.iv&&call.payload.ct);assert.doesNotMatch(JSON.stringify(call.payload),/device-a|device-b/)}
 assert.ok([...server.db.keys()].every(k=>k.startsWith('jugest/juggler-device-sync-v1/')));
});
