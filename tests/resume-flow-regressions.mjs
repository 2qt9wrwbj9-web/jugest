import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {boot,button} from './helpers/runtime.mjs';
import {relayHarness} from './helpers/relay.mjs';

test('Fresh Launcher setup exposes the existing loader using this JUGEST origin',async()=>{
 const r=await boot();
 const html=r.app.renderCollectorScreen();
 assert.match(html,/Launcherの初回設定/);
 const encoded=html.match(/aria-label="Launcherブックマークレット">([^<]+)<\/textarea>/)?.[1];
 assert.ok(encoded,'manual loader copy remains available without clipboard');
 const loader=encoded.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
 let script;vm.runInNewContext(loader.slice('javascript:'.length),{document:{createElement:()=>({}),documentElement:{appendChild:s=>script=s}},Date,alert(){}});
 assert.equal(new URL(script.src).origin,r.ctx.location.origin);assert.equal(new URL(script.src).pathname,'/ana-launcher.js');
 assert.doesNotMatch(loader,/netlify/i);
});
test('History navigation cannot hide recovery after a partial Device Sync apply',async()=>{
 const r=await boot();r.app.state.workspace='data';r.app.state.screen='sync';r.app.state.syncReloadRequired=true;
 r.app.onPopState({state:{jugestV510:true,workspace:'home',screen:'hub'}});
 assert.equal(r.app.state.screen,'sync');r.app.render();assert.match(r.app.mount.innerHTML,/data-sync-reload/);
 r.app.onClick({target:button('data-sync-reload')});assert.equal(r.ctx.reloads,1);
});
test('Automatic Collector refresh clears a recovered transient error',async()=>{
 const server=relayHarness();let fail=false;
 const r=await boot({fetch:(...args)=>fail?Promise.reject(Error('temporary offline')):server.fetch(...args)});
 await r.bridge.createCollectorPair();fail=true;await r.app.refreshCollectorStatus();assert.match(r.app.state.collectorMessage,/temporary offline/);
 fail=false;await r.app.refreshCollectorStatus();assert.doesNotMatch(r.app.state.collectorMessage,/temporary offline/);
});
test('Backup undo explains its partial scope before the user presses it',async()=>{
 const r=await boot();assert.match(r.app.renderBackupScreen(),/店舗データと解析履歴は戻りません/);
});
test('Production FOUC gate waits for CSS load/error and has a 2-second fallback',async()=>{
 for(const cause of ['load','error','timeout']){
  const r=await boot();assert.equal(r.app.mount.style.visibility,'hidden');r.app.render();assert.equal(r.app.mount.style.visibility,'hidden');
  if(cause==='timeout')await r.tick(2000);else r.app.shadowRoot.children[0].listeners.get(cause)();
  assert.equal(r.app.mount.style.visibility,'');
 }
});
test('Partial backup restore exposes reload recovery and blocks stale in-memory edits',async()=>{
 const r=await boot();const backup=await r.bridge.saveBackup();
 r.storage.failIdbWrite=true;r.app.state.workspace='data';r.app.state.screen='backup';
 await r.app.restoreBackupFile({text:async()=>backup.text});
 assert.equal(r.app.state.syncReloadRequired,true);
 assert.match(r.app.mount.innerHTML,/data-sync-reload/);
});
test('Backup restore refuses to overwrite when the pre-restore safety copy cannot be saved',async()=>{
 const r=await boot();const backup=await r.bridge.saveBackup();
 r.bridge.prepareJudge('my');r.bridge.setJudgeG('4567');r.emit('pagehide');
 const before=r.storage.getItem('juggler_tool_state_v33');const original=r.storage.setItem;
 // Resolve the existing key from source so this test follows its real version.
 const fs=await import('node:fs');const key=fs.readFileSync('index.html','utf8').match(/PRE_RESTORE_KEY="([^"]+)"/)[1];
 r.storage.setItem=(k,v)=>{if(k===key)throw Error('quota');original(k,v)};
 await assert.rejects(r.bridge.restoreBackup({text:async()=>backup.text}),/退避/);
 assert.equal(JSON.parse(r.storage.getItem('juggler_tool_state_v33')).data.my.G,JSON.parse(before).data.my.G);
});
