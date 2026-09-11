import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,button,memoryStorage} from './helpers/runtime.mjs';
import vm from 'node:vm';

test('home summary reports unsaved play and stops resuming unchanged saved input',async()=>{
 const {bridge}=await boot();bridge.setJudgeG(500);
 assert.equal(bridge.getSummary().activePlay?.action,'live-judge');
 const draft=bridge.getCurrentRunDraft('judge');bridge.saveRunRecord(draft);
 assert.equal(bridge.getSummary().activePlay,null);
 bridge.setJudgeG(600);assert.equal(bridge.getSummary().activePlay?.action,'live-judge');
});
test('returning Home reads fresh play input, not a stale summary',async()=>{
 const {app,bridge}=await boot();app.refreshFromBridge();bridge.setJudgeG(900);app.navigate('home');
 assert.match(app.mount.innerHTML,/実戦判別を続ける/);
});
test('malformed persisted unread ledger cannot break rendering',async()=>{
 const {app}=await boot({storage:memoryStorage({'jugest:v510:ui':JSON.stringify({noticeLedger:{read:'bad',active:null}})})});
 assert.doesNotThrow(()=>app.render());
});
test('core orchestration reports progress without replacing the analysis engine',async()=>{
 const runtime=await boot(),{bridge}=runtime;const seen=[];
 // Stop at the deliberate insufficient-data error, after judgement preparation.
 const run=bridge.runStoreAnalysis('A',{},(p,stage)=>seen.push([p,stage]));const rejected=assert.rejects(run,/日数が足りない/);await runtime.tick(0);await runtime.tick(0);await rejected;
 assert.ok(seen.length>0);assert.ok(seen[0][0]>=0&&seen[0][0]<1);
 assert.equal(typeof bridge.getAllStoreAnalysisHistory,'function');
});

test('next action uses actual state in priority order, including empty stores',async()=>{
 const {ctx}=await boot(),pick=ctx.JugestAppV510Test.nextHomeAction;
 assert.equal(typeof pick,'function');
 const s={storeCount:1,activePlay:{action:'live-judge'},draft:true,todayAnalysis:true};
 assert.equal(pick(s).action,'live-judge');
 delete s.activePlay;assert.equal(pick(s).action,'resume-record');
 delete s.draft;assert.equal(pick(s).action,'analysis-return');
 delete s.todayAnalysis;assert.equal(pick(s).action,'store-analysis');
 s.storeCount=0;assert.equal(pick(s).action,'register-store');
 assert.equal(pick({storeCount:1,job:{status:'running'}}).action,'analysis-return');
});
test('missing URL never creates warning/count; success is not unread',async()=>{
 const {ctx}=await boot(),s=ctx.JugestAppV510Test.buildHomeStatus({linked:true,collectorCheckedAt:1,enabledTargets:1,unregistered:4});
 assert.equal(s.notificationCount,0);assert.equal(s.statusLabel,'正常');
 assert.doesNotMatch(JSON.stringify(s.notifications),/URL未登録/);
});
test('opening notifications reads current occurrences; new occurrences alone become unread and persist',async()=>{
 const storage=memoryStorage(),{app}=await boot({storage});
 app.state.summary={linked:true,collectorCheckedAt:1,enabledTargets:1,errorTargets:1};app.render();
 assert.match(app.mount.innerHTML,/notification-badge/);
 app.onClick({target:button('data-notification-toggle')});
 assert.doesNotMatch(app.mount.innerHTML,/class="notification-badge"/);
 app.onClick({target:button('data-notification-toggle')});app.render();
 assert.doesNotMatch(app.mount.innerHTML,/class="notification-badge"/);
 const restored=(await boot({storage})).app;restored.state.summary=app.state.summary;restored.render();
 assert.doesNotMatch(restored.mount.innerHTML,/class="notification-badge"/);
 app.state.summary.pending=2;app.render();assert.match(app.mount.innerHTML,/class="notification-badge">1</);
 app.onClick({target:button('data-notification-toggle')});
 app.state.summary.pending=0;app.render();app.state.summary.pending=2;app.render();
 assert.match(app.mount.innerHTML,/class="notification-badge">1</);
});
test('VPS analysis captures the selected store, survives every workspace and returns to its completed result',async()=>{
 const {app,bridge,ctx}=await boot();const b={...bridge};ctx.JUGEST_CORE_BRIDGE=b;let resolve,calls=0,localCalls=0;
 ctx.JUGEST_VPS_ANALYTICS_CLIENT={
  getDefaultAnalysis:(shop)=>{calls++;assert.equal(shop,'A');return new Promise(r=>resolve=r)},
  getStatus:async()=>({status:{status:'analyzed'}})
 };
 b.runStoreAnalysis=async()=>{localCalls++;throw Error('local analysis must not run on the canonical VPS path')};
 b.getStoreAnalysisHistory=async()=>[];
 app.state.activeStore='A';app.navigate('store','analysis');const pending=app.runStoreAnalysis();
 await Promise.resolve();assert.equal(app.state.analysisLoading,true);
 assert.doesNotMatch(app.mount.innerHTML,/class="analysis-chip/);
 for(const tab of ['live','home','records','data']){app.navigate(tab);assert.equal(app.state.analysisLoading,true);assert.match(app.mount.innerHTML,/class="analysis-chip/)}
 app.state.activeStore='B';app.navigate('store','analysis');assert.doesNotMatch(app.mount.innerHTML,/class="analysis-chip/,'inline progress must not be duplicated even after selecting another store');
 app.state.activeStore='B';app.state.analysisOpts.period='30';app.runStoreAnalysis();assert.equal(calls,1);
 resolve({analysis:{shop:'A',days:30,positive:[],negative:[]}});await pending;
 assert.equal(localCalls,0);
 app.handleAction('analysis-return');assert.equal(app.state.activeStore,'A');assert.equal(app.state.screen,'analysis');assert.equal(app.state.analysisResult.shop,'A');
 ctx.JUGEST_VPS_ANALYTICS_CLIENT.getDefaultAnalysis=async()=>({analysis:{shop:'A',days:30,positive:[],negative:[]}});
 app.navigate('home');app.handleAction('store-analysis');assert.equal(app.state.analysisResult.shop,'A');
});
test('failed VPS analysis remains reachable without silently invoking local analysis',async()=>{
 const {app,bridge,ctx}=await boot();let localCalls=0;ctx.JUGEST_VPS_ANALYTICS_CLIENT={getDefaultAnalysis:async()=>{throw Error('offline')}};ctx.JUGEST_CORE_BRIDGE={...bridge,runStoreAnalysis:async()=>{localCalls++;throw Error('local should stay disabled')}};app.state.activeStore='A';
 await app.runStoreAnalysis();assert.equal(localCalls,0);app.navigate('home');assert.match(app.mount.innerHTML,/解析を完了できませんでした/);
 app.handleAction('analysis-return');assert.match(app.mount.innerHTML,/offline/);
});
test('explicit local-analysis fallback preserves progress updates without rebuilding the whole app',async()=>{
 const {app,bridge,ctx}=await boot({appFile:'public/app-v510.js'});const b={...bridge};ctx.JUGEST_CORE_BRIDGE=b;ctx.JUGEST_LOCAL_ANALYSIS_FALLBACK=true;ctx.JUGEST_VPS_ANALYTICS_CLIENT={getDefaultAnalysis:async()=>{throw Error('vps offline')}};let progress,finish;
 b.runStoreAnalysis=(shop,opts,onProgress)=>{progress=onProgress;return new Promise(r=>finish=r)};
 b.getStoreAnalysisHistory=async()=>[];
 app.state.activeStore='A';app.navigate('home');
 const original=app.render.bind(app);let renders=0;app.render=(...args)=>{renders++;return original(...args)};
 const pending=app.runStoreAnalysis();await Promise.resolve();await Promise.resolve();
 const afterStart=renders;
 progress(.11,'候補を抽出中');progress(.22,'候補を採点中');progress(.33,'根拠を整理中');
 assert.equal(renders,afterStart,'progress-only ticks must patch the visible progress UI without full mount.innerHTML replacement');
 finish({shop:'A',days:30,positive:[],negative:[]});await pending;
 assert.ok(renders>afterStart,'completion still needs a full render to publish the result state');
});
