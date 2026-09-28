import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {boot} from './helpers/runtime.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const result=label=>({shop:'PIA大船1',date:'2026-09-29',available:true,score:73.4,go:true,tier:'validated',quality:88,
  championLabel:'Champion A',regime:'強め',candidates:[{tableNo:'412',machineName:'マイジャグラーV',aimScore:84,
    predP4:.62,predES:4.7,rootFamilyCount:3,rootConfidence:.71,evidence:[{label,confidence:68}]}]});
const modeButton=mode=>({closest(selector){return selector.includes('[data-plan-mode]')?{dataset:{planMode:mode},hasAttribute:()=>false}:null}});

test('prediction starts with the new mode; each mode runs only when selected and reuses its own result',async()=>{
  const {app}=await boot();app.state.activeStore='PIA大船1';app.state.planDate='2026-09-29';
  const calls=[];
  app.runNewTodayPlan=async(_bridge,shop,date,options)=>{calls.push(['new',shop,date,options.lottery]);return result('新版だけ')};
  app.runLegacyTodayPlan=async(_bridge,shop,date,options)=>{calls.push(['legacy',shop,date,options.lottery]);return result('旧版だけ')};
  app.handleAction('store-plan');
  assert.deepEqual(calls,[],'opening the prediction screen must not calculate either mode');
  assert.match(app.mount.innerHTML,/data-plan-mode="new" class="selected" aria-pressed="true">新版解析/);
  assert.match(app.mount.innerHTML,/新版の学習済み予測が利用できない場合は、旧版の結果を表示します/);
  await app.runTodayPlan();
  assert.deepEqual(calls,[['new','PIA大船1','2026-09-29','']]);
  assert.match(app.mount.innerHTML,/新版だけ/);
  app.onClick({target:modeButton('legacy')});await tick();
  assert.deepEqual(calls.map(([mode])=>mode),['new','legacy']);
  assert.match(app.mount.innerHTML,/data-plan-mode="legacy" class="selected" aria-pressed="true">旧版解析/);
  assert.match(app.mount.innerHTML,/予測方式：旧版[\s\S]*旧版だけ/);
  assert.doesNotMatch(app.mount.innerHTML,/新版だけ/);
  app.onClick({target:modeButton('new')});await tick();
  assert.deepEqual(calls.map(([mode])=>mode),['new','legacy'],'returning to the same inputs reuses the new result');
  assert.match(app.mount.innerHTML,/予測方式：新版[\s\S]*新版だけ/);
});

test('date and lottery changes invalidate cached predictions without calculating the inactive mode',async()=>{
  const {app}=await boot();app.state.activeStore='PIA大船1';app.state.planDate='2026-09-29';
  const calls=[];
  app.runNewTodayPlan=async()=>{calls.push('new');return result('新版')};
  app.runLegacyTodayPlan=async()=>{calls.push('legacy');return result('旧版')};
  app.handleAction('store-plan');await app.runTodayPlan();app.selectPlanMode('legacy');await tick();
  const date={value:'2026-09-30',closest:selector=>selector.includes('[data-plan-date]')?date:null};
  app.onChange({target:date});
  assert.match(app.mount.innerHTML,/まだ計算していない/);
  await app.runTodayPlan();
  const lottery={value:'17',hasAttribute:name=>name==='data-plan-lottery',closest:selector=>selector.includes('[data-plan-lottery]')?lottery:null};
  app.onInput({target:lottery});await app.runTodayPlan();
  assert.deepEqual(calls,['new','legacy','legacy','legacy']);
  app.selectPlanMode('new');await tick();
  assert.deepEqual(calls,['new','legacy','legacy','legacy','new']);
});

test('an in-flight new prediction finishes before legacy starts and never appears in its view',async()=>{
  const {app}=await boot();app.state.activeStore='PIA大船1';app.state.planDate='2026-09-29';
  let finishNew,legacyCalls=0,inFlight=0,maxInFlight=0;
  app.runNewTodayPlan=()=>{inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);return new Promise(resolve=>{finishNew=()=>{inFlight--;resolve(result('新版だけ'))}})};
  app.runLegacyTodayPlan=async()=>{legacyCalls++;inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);await tick();inFlight--;return result('旧版だけ')};
  app.handleAction('store-plan');const current=app.runTodayPlan();
  app.selectPlanMode('legacy');assert.equal(legacyCalls,0);
  finishNew();await current;await tick();await tick();
  assert.equal(legacyCalls,1);assert.equal(maxInFlight,1);
  assert.match(app.mount.innerHTML,/旧版だけ/);assert.doesNotMatch(app.mount.innerHTML,/新版だけ/);
});

test('switching from an externally requested new prediction to legacy starts the legacy result',async()=>{
  const {app}=await boot();app.state.activeStore='PIA大船1';app.state.planDate='2026-09-29';
  const calls=[];
  app.runNewTodayPlan=async()=>{calls.push('new');return result('新版')};
  app.runLegacyTodayPlan=async()=>{calls.push('legacy');return result('旧版')};
  app.handleAction('store-plan');
  app._planRequestedKey=app.planKey();
  app.selectPlanMode('legacy');
  await tick();
  assert.deepEqual(calls,['legacy']);
  assert.match(app.mount.innerHTML,/旧版だけ|予測方式：旧版/);
});

test('switching back to new hands its result to the PRE prediction runner',async()=>{
  const {app}=await boot();app.state.activeStore='PIA大船1';app.state.planDate='2026-09-29';app.state.planMode='legacy';app.state.planResult=result('旧版');
  const key=app.planKey(),calls=[];
  app._planRequestedKey=key;app._runExternalNewPlan=requested=>calls.push(requested);
  app.selectPlanMode('new');
  assert.deepEqual(calls,[key]);
  assert.equal(app.state.planResult,null,'the cached legacy output must not remain visible in new mode');
});

test('the legacy prediction retains its original display and core entry',async()=>{
  const {app,bridge}=await boot();app.state.activeStore='PIA大船1';app.state.planDate='2026-09-29';app.state.planMode='legacy';app.state.planResult=result('末尾2');
  const html=app.renderTodayPlanScreen().replace(/<div class="plan-mode-switch".*?<\/div>/,'').replace('<p class="plan-mode-label">予測方式：旧版</p>','');
  assert.equal(createHash('sha256').update(html).digest('hex'),'387f208097dcf47b5456bcb9a41a65d3e1a7c2b4042bd07ac693b3dda15fbb93');
  const seen=[];app.bridge=()=>({...bridge,
    getTodayPlan:(...args)=>{seen.push(['legacy',...args]);return result('旧版')},
    getNewTodayPlan:(...args)=>{seen.push(['new',...args]);return result('新版')}});
  await app.runTodayPlan();app.selectPlanMode('new');await tick();
  assert.deepEqual(seen.map(([mode])=>mode),['legacy','new'],'a future new bridge leaves the legacy entry untouched');
  const source=fs.readFileSync('index.html','utf8');
  for(const [name,expected] of [
    ['v510PlanCandidate','8d86b8c4bc13b9bff2d30d88d6f520c4de85068e50ee3d8772345948337a6ba7'],
    ['v510GetTodayPlan','c1ca201534b0844d394ad9ff0b8a7d966819a8aa428cbc96da7d4ab0c9f0b13f'],
    ['v5StoreRankForPlan','3a07f90c780a012f43cf00eaf7291f07dba1637f9c466ad46f0101653cb1d74f']]){
    const line=source.split('\n').find(value=>value.startsWith(`function ${name}(`));
    assert.equal(createHash('sha256').update(line).digest('hex'),expected,`existing ${name} prediction math must stay unchanged`);
  }
});

test('the built prediction switch preserves two full-width mobile targets',()=>{
  const app=fs.readFileSync('public/app-v510.js','utf8'),css=fs.readFileSync('public/app-v510.css','utf8');
  assert.match(app,/data-plan-mode/);assert.match(app,/予測方式：/);
  assert.match(css,/\.plan-mode-switch\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.plan-mode-switch button\{[^}]*min-height:48px/);
});
