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
test('analysis captures store/options, survives every workspace and returns to its completed result',async()=>{
 const {app,bridge,ctx}=await boot();const b={...bridge};ctx.JUGEST_CORE_BRIDGE=b;let resolve,calls=0;
 b.runStoreAnalysis=(shop,opts,progress)=>{calls++;assert.equal(shop,'A');assert.equal(opts.period,'180');progress?.(.42,'条件を検証中');return new Promise(r=>resolve=r)};
 b.getStoreAnalysisHistory=async()=>[];
 app.state.activeStore='A';app.navigate('store','analysis');const pending=app.runStoreAnalysis();
 await Promise.resolve();assert.equal(app.state.analysisLoading,true);
 assert.doesNotMatch(app.mount.innerHTML,/class="analysis-chip/);
 for(const tab of ['live','home','records','data']){app.navigate(tab);assert.equal(app.state.analysisLoading,true);assert.match(app.mount.innerHTML,/class="analysis-chip/)}
 app.state.activeStore='B';app.navigate('store','analysis');assert.doesNotMatch(app.mount.innerHTML,/class="analysis-chip/,'inline progress must not be duplicated even after selecting another store');
 app.state.activeStore='B';app.state.analysisOpts.period='30';app.runStoreAnalysis();assert.equal(calls,1);
 resolve({shop:'A',days:30,positive:[],negative:[]});await pending;
 app.handleAction('analysis-return');assert.equal(app.state.activeStore,'A');assert.equal(app.state.screen,'analysis');assert.equal(app.state.analysisResult.shop,'A');
 app.navigate('home');app.handleAction('store-analysis');assert.equal(app.state.analysisResult.shop,'A');
});
test('failed analysis remains reachable without presenting completion',async()=>{
 const {app,bridge,ctx}=await boot();ctx.JUGEST_CORE_BRIDGE={...bridge,runStoreAnalysis:async()=>{throw Error('offline')}};app.state.activeStore='A';
 await app.runStoreAnalysis();app.navigate('home');assert.match(app.mount.innerHTML,/解析を完了できませんでした/);
 app.handleAction('analysis-return');assert.match(app.mount.innerHTML,/offline/);
});
