import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {boot,memoryStorage,button} from './helpers/runtime.mjs';
import {relayHarness,payload} from './helpers/relay.mjs';
const KEY='jugglerRelayReceiver:v1',STATE='juggler_tool_state_v33';
test('Unlinked UI exposes pairing through the actual bridge and existing createPair API',async()=>{
 const server=relayHarness(),r=await boot({fetch:server.fetch});
 assert.match(r.app.renderCollectorScreen(),/data-collector-pair/);
 await r.app.runCollectorAction('pair');
 assert.ok(server.calls.some(x=>x.action==='createPair'));
 assert.match(r.app.renderCollectorScreen(),/入力待ち/);
 const pair=JSON.parse(r.storage.getItem(KEY));assert.match(pair.code,/^\d{6}$/);
 const before=server.calls.length;const again=await r.bridge.createCollectorPair();assert.equal(server.calls.length,before,'reuse pending code');
 assert.equal(again.code,pair.code);
 await server.call({action:'claimPair',code:pair.code});
 await r.bridge.refreshCollector();assert.equal(r.bridge.getDataStatus().linked,true);
 assert.match(r.app.renderCollectorScreen(),/連携済み/);
 const reboot=await boot({fetch:server.fetch,storage:r.storage});assert.equal(reboot.bridge.getDataStatus().linked,true);
});
test('Pending pair survives reload, polls to linked, and resumes on pageshow',async()=>{
 const server=relayHarness(),r=await boot({fetch:server.fetch});await r.bridge.createCollectorPair();
 const next=await boot({fetch:server.fetch,storage:r.storage});next.app.connectedCallback();await new Promise(r=>setImmediate(r));
 assert.match(next.app.renderCollectorScreen(),/入力待ち/);
 const pair=JSON.parse(r.storage.getItem(KEY));await server.call({action:'claimPair',code:pair.code});
 await next.tick(3000);assert.equal(next.bridge.getDataStatus().linked,true);
 const count=server.calls.filter(x=>x.action==='pairStatus').length;next.emit('pageshow');await new Promise(r=>setImmediate(r));assert.ok(server.calls.filter(x=>x.action==='pairStatus').length>count);
 next.app.disconnectedCallback();assert.equal([...next.timers.values()].filter(x=>x.ms===3000).length,0);
});
test('Pair expiry and network failure keep retry available; linked channel is never replaced',async()=>{
 const server=relayHarness(),r=await boot({fetch:server.fetch});await r.bridge.createCollectorPair();const pair=JSON.parse(r.storage.getItem(KEY));
 pair.codeExpiresAt=Date.now()-1;r.storage.setItem(KEY,JSON.stringify(pair));const next=await boot({storage:r.storage,fetch:server.fetch});
 assert.equal(next.bridge.getDataStatus().pairState,'expired');await next.bridge.createCollectorPair();assert.notEqual(JSON.parse(r.storage.getItem(KEY)).channelId,pair.channelId);
 const saved=r.storage.getItem(KEY);const bad=await boot({storage:r.storage,fetch:async()=>{throw Error('offline')}});await bad.app.runCollectorAction('refresh');assert.equal(bad.app.state.dataBusy,false);assert.match(bad.app.mount.innerHTML,/offline/);assert.equal(r.storage.getItem(KEY),saved);
 const p=JSON.parse(saved);await server.call({action:'claimPair',code:p.code});await next.bridge.refreshCollector();await assert.rejects(next.bridge.createCollectorPair(),/解除/);
});
test('Unlink revokes only the Collector channel and keeps acquired data and Device Sync identity',async()=>{
 const server=relayHarness(),r=await boot({fetch:server.fetch});await r.bridge.createCollectorPair();const pair=JSON.parse(r.storage.getItem(KEY));await server.call({action:'claimPair',code:pair.code});await r.bridge.refreshCollector();
 r.storage.setItem('jugglerDeviceSync:v1','{"link":{"id":"keep-device-sync"}}');const raw=r.storage.getItem(STATE);
 await r.bridge.unlinkCollector();assert.equal(r.bridge.getDataStatus().linked,false);assert.equal(r.storage.getItem(KEY),null);assert.equal(r.storage.getItem(STATE),raw);assert.match(r.storage.getItem('jugglerDeviceSync:v1'),/keep-device-sync/);
 assert.equal((await server.call({action:'pairStatus',channelId:pair.channelId,receiverToken:pair.receiverToken})).ok,false);
 await r.bridge.createCollectorPair();assert.notEqual(JSON.parse(r.storage.getItem(KEY)).channelId,pair.channelId);
});
test('iPhone Shortcut creation/key rotation has its own existing API and survives reload',async()=>{
 const server=relayHarness(),r=await boot({fetch:server.fetch});assert.match(r.app.renderCollectorScreen(),/data-collector-ios/);await r.app.runCollectorAction('ios');
 const pair=JSON.parse(r.storage.getItem(KEY));assert.equal(pair.mode,'ios-shortcut');assert.ok(pair.collectorKey);assert.match(r.app.renderCollectorScreen(),/collectorKey|iPhoneキー/);
 const next=await boot({storage:r.storage,fetch:server.fetch});assert.equal(next.bridge.getCollectorKey(),pair.collectorKey);await next.bridge.createIosCollector();assert.notEqual(next.bridge.getCollectorKey(),pair.collectorKey);assert.equal(JSON.parse(r.storage.getItem(KEY)).channelId,pair.channelId);
});
test('Launcher queue is counted and imported through receive -> durable save -> ack',async()=>{
 const server=relayHarness(),pair=await server.call({action:'createPair'}),sender=await server.call({action:'claimPair',code:pair.code});
 const storage=memoryStorage({[KEY]:JSON.stringify({...pair,linked:true})}),r=await boot({storage,fetch:server.fetch});
 await server.call({action:'send',channelId:pair.channelId,senderToken:sender.senderToken,payload});await r.bridge.refreshCollector();assert.equal(r.bridge.getDataStatus().launcherPending,1);assert.doesNotMatch(r.app.renderCollectorScreen(),/data-collector-receive disabled/);
 const result=await r.bridge.receiveCollector();assert.equal(result.days,1);assert.equal(r.bridge.getSummary().externalDayCount,1);assert.equal((await server.call({action:'receive',channelId:pair.channelId,receiverToken:pair.receiverToken})).count,0);
 const reload=await boot({storage,fetch:server.fetch});assert.equal(reload.bridge.getSummary().externalDayCount,1);
});
test('CollectorPull still imports days; a failed local save must never ACK Launcher data',async()=>{
 const server=relayHarness(),pair=await server.call({action:'createPair'}),sender=await server.call({action:'claimPair',code:pair.code});
 const r=await boot({storage:memoryStorage({[KEY]:JSON.stringify({...pair,linked:true})}),fetch:server.fetch});
 await server.call({action:'collectorPush',channelId:pair.channelId,senderToken:sender.senderToken,payload});assert.equal((await r.bridge.receiveCollector()).days,1);
 await server.call({action:'send',channelId:pair.channelId,senderToken:sender.senderToken,payload});
 r.storage.setItem=()=>{throw Error('quota exceeded')};await assert.rejects(r.bridge.receiveCollector());assert.equal((await server.call({action:'receive',channelId:pair.channelId,receiverToken:pair.receiverToken})).count,1);assert.ok(!server.calls.some(x=>x.action==='ack'));
});
test('Device Sync flushes current edits and pagehide cannot overwrite applied remote records',async()=>{
 const storage=memoryStorage();let atSync;
 const r=await boot({storage,sync:{getStatus:()=>({}),syncNow:async()=>{atSync=JSON.parse(storage.getItem(STATE));storage.setItem(STATE,JSON.stringify({...atSync,sessions:[{id:81,memo:'remote-record'}]}));return {sessions:1}}}});
 r.bridge.prepareJudge('my');r.bridge.setJudgeG('3210');await r.bridge.runDeviceSync();assert.equal(+atSync.data.my.G,3210);
 r.emit('pagehide');r.emit('beforeunload');await r.tick(450);assert.equal(JSON.parse(storage.getItem(STATE)).sessions[0]?.memo,'remote-record');
});
test('Backup undo reaches the bridge and reloads; failure unlocks retry',async()=>{
 const storage=memoryStorage(),r=await boot({storage});r.bridge.prepareJudge('my');r.bridge.setJudgeG('1234');r.emit('pagehide');
 
 // Use the actual runtime backup key, not a fabricated version.
 const html=fs.readFileSync('index.html','utf8'),key=html.match(/PRE_RESTORE_KEY="([^"]+)"/)[1];storage.setItem(key,JSON.stringify({version:47,sessions:[{id:92}]}));
 await r.app.runBackup('undo');assert.equal(r.ctx.reloads,1);assert.equal(JSON.parse(storage.getItem(STATE)).sessions[0]?.id,92);
});
test('Store save and backup restore errors clear busy state before final render',async()=>{
 const r=await boot();r.app.state.workspace='data';r.app.state.screen='stores';r.app.openStoreEditor('未登録店');await r.app.saveStoreEditor();assert.equal(r.app.state.dataBusy,false);assert.match(r.app.mount.innerHTML,/data-store-save/);assert.doesNotMatch(r.app.mount.innerHTML,/data-store-save disabled/);assert.doesNotMatch(r.app.mount.innerHTML,/保存中/);
 r.app.state.screen='backup';await r.app.restoreBackupFile({text:async()=>{throw Error('read failed')}});assert.equal(r.app.state.dataBusy,false);assert.match(r.app.mount.innerHTML,/data-backup-restore/);assert.doesNotMatch(r.app.mount.innerHTML,/data-backup-restore disabled/);
});
test('Missing clipboard API never reports a successful Device Sync copy',async()=>{
 const r=await boot();r.app.state.syncCode='manual-copy-code';await r.app.copySyncCode();assert.doesNotMatch(r.app.state.syncMessage,/コピーした/);assert.match(r.app.state.syncMessage,/長押し/);
});
test('First Collector store can be added from an empty store-management screen',async()=>{
 const server=relayHarness(),r=await boot({fetch:server.fetch});
 assert.match(r.app.renderStoreManagementScreen(),/data-store-add/);
 await r.bridge.createIosCollector();r.app.onClick({target:button('data-store-add')});
 assert.ok(r.app.state.storeEditor);assert.equal(r.app.state.storeEditor.isNew,true);
 Object.assign(r.app.state.storeEditor,{name:'初回店舗',url:'https://ana-slo.com/2026-09-01-test-data/',startDate:'2026-09-01'});
 await r.app.saveStoreEditor();assert.equal(r.bridge.getCollectorStores()[0]?.name,'初回店舗');assert.equal(r.bridge.getCollectorStores()[0]?.enabled,false);
});
test('Global operation errors keep the current screen and retry controls visible',async()=>{
 const r=await boot();r.app.state.workspace='data';r.app.state.screen='collector';await r.app.runCollectorAction('receive');
 assert.match(r.app.mount.innerHTML,/未連携/);assert.match(r.app.mount.innerHTML,/data-collector-pair/);
 r.app.navigate('records');assert.match(r.app.mount.innerHTML,/稼働記録/);
});
test('Sync failure before apply releases the save gate; partial apply requires reload',async()=>{
 const storage=memoryStorage();let phase='network';const r=await boot({storage,sync:{getStatus:()=>({}),syncNow:async(progress,hooks)=>{if(phase==='apply'){hooks.beforeApply();storage.setItem(STATE,JSON.stringify({sessions:[{id:101}]}))}throw Error('sync-failed')}}});
 r.bridge.prepareJudge('my');r.bridge.setJudgeG('1000');await assert.rejects(r.bridge.runDeviceSync(),/sync-failed/);r.bridge.setJudgeG('1100');r.emit('pagehide');assert.equal(+JSON.parse(storage.getItem(STATE)).data.my.G,1100);
 phase='apply';await assert.rejects(r.bridge.runDeviceSync(),e=>e.reloadRequired===true);r.emit('pagehide');assert.equal(JSON.parse(storage.getItem(STATE)).sessions[0]?.id,101);
});
