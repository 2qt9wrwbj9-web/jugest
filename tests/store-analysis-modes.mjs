import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {boot} from './helpers/runtime.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const result={shop:'A',days:30,rowCount:120,meanES:3.42,usableCount:12,conditionCount:30,independentCount:3,rawUsableCount:12,
  positive:[{label:'週末×角台',days:6,rows:25,confidence:76,practicalEffect:.216}],
  negative:[{label:'平日',practicalEffect:-.18,confidence:58}],
  machines:[{machine:'my',machineName:'マイジャグラーV',n:60,meanES:3.5}],
  patterns:[{label:'角台',grade:'A',confidence:76,forecastEffect:.18}],machinePatterns:[]};
function modeButton(mode){return {closest(selector){return selector.includes('[data-analysis-mode]')?{dataset:{analysisMode:mode},hasAttribute:()=>false}:null}}}

test('opening the page runs only the new entry; tapping legacy runs only the frozen entry',async()=>{
  const {app}=await boot({appFile:'public/app-v510.js'}),calls=[];
  app.state.activeStore='A';
  app.runNewStoreAnalysis=async(_bridge,shop,options)=>{calls.push(['new',shop,options.period]);return result};
  app.runLegacyStoreAnalysis=async(_bridge,shop,options)=>{calls.push(['legacy',shop,options.period]);return result};
  app.handleAction('store-analysis');await tick();
  assert.deepEqual(calls,[['new','A','180']]);
  assert.match(app.mount.innerHTML,/data-analysis-mode="new" class="selected" aria-pressed="true">新版解析/);
  assert.match(app.mount.innerHTML,/解析方式：新版/);
  assert.doesNotMatch(app.mount.innerHTML,/解析履歴/,'saved snapshots belong to the legacy mode');
  app.onClick({target:modeButton('legacy')});await tick();
  assert.deepEqual(calls,[['new','A','180'],['legacy','A','180']]);
  assert.match(app.mount.innerHTML,/data-analysis-mode="legacy" class="selected" aria-pressed="true">旧版解析/);
  assert.match(app.mount.innerHTML,/解析方式：旧版/);
  assert.match(app.mount.innerHTML,/解析履歴/);
  app.state.analysisOpts.period='30';
  await app.runStoreAnalysis();
  assert.deepEqual(calls.at(-1),['legacy','A','30']);
  assert.equal(calls.filter(([mode])=>mode==='new').length,1,'a filter change never starts the inactive mode');
  app.onClick({target:modeButton('new')});await tick();
  assert.equal(calls.filter(([mode])=>mode==='legacy').length,2);
});

test('the legacy screen retains the pre-change result markup after removing mode controls',async()=>{
  const {app}=await boot();app.state.activeStore='A';app.state.analysisMode='legacy';app.state.analysisResult=result;
  const rendered=app.renderStoreAnalysisScreen();
  const beforeModeChrome=rendered.replace(/<div class="analysis-mode-switch".*?<\/div>/,'').replace('<p class="analysis-mode-label">解析方式：旧版</p>','');
  assert.equal(createHash('sha256').update(beforeModeChrome).digest('hex'),'478ed5deb8176645b450b06c30f3ef684c139fc3a7f1d8023eb0588a575b672f',
    'representative result, ranks, contract, and history markup must match deploy/vps before this change');
  app.state.analysisHistoryOpen={shop:'A',source:{days:30},summary:{meanES:3.42},positive:[]};
  assert.match(app.renderStoreAnalysisScreen(),/解析方式：旧版[\s\S]*解析履歴[\s\S]*解析方式：旧版/);
});

test('switching while the other mode runs serializes work and never shows its stale result',async()=>{
  const {app}=await boot({appFile:'public/app-v510.js'});app.state.activeStore='A';
  let finishNew,inFlight=0,maxInFlight=0,legacyCalls=0;
  app.runNewStoreAnalysis=()=>{inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);return new Promise(resolve=>{finishNew=()=>{inFlight--;resolve({...result,positive:[{label:'NEW ONLY',practicalEffect:1}]})}})};
  app.runLegacyStoreAnalysis=async()=>{legacyCalls++;inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);await tick();inFlight--;return {...result,positive:[{label:'LEGACY ONLY',practicalEffect:1}]}};
  app.handleAction('store-analysis');assert.equal(typeof finishNew,'function');
  app.selectStoreAnalysisMode('legacy');assert.equal(legacyCalls,0);
  finishNew();await tick();await tick();
  assert.equal(legacyCalls,1);assert.equal(maxInFlight,1);
  assert.match(app.mount.innerHTML,/LEGACY ONLY/);
  assert.doesNotMatch(app.mount.innerHTML,/NEW ONLY/);
});

test('legacy analysis primitives preserve a representative numerical baseline',async()=>{
  const {ctx}=await boot({loadApp:false});
  const days=Array.from({length:14},(_,i)=>({id:`fixture-${i}`,shop:'基準店',date:`2026-09-${String(i+1).padStart(2,'0')}`,
    machines:Array.from({length:4},(_,j)=>{const high=(i+j)%3===0,q=high?[.03,.04,.08,.25,.3,.3]:[.5,.18,.12,.1,.07,.03];
      return{machine:'my',machineName:'マイジャグラーV',tableNo:String(101+j),games:4000+(i%2)*800,bb:high?20:12,rb:high?18:9,diff:high?1000:-700,q,
        expectedSetting:high?4.92:2.31,p4:high?.85:.2,p5:high?.6:.1,p6:high?.3:.03,judgeMethod:'fixture'};})}));
  const prep=ctx.V4_TEST.brutePrepare('基準店','30',2000,days);
  const evidence=ctx.V4_TEST.singleGenerate(prep,4);
  assert.equal(prep.days.length,14);assert.equal(prep.rows.length,56);
  assert.equal(prep.overall.meanES,3.1955357142857146);
  assert.equal(evidence.usableCount,236);assert.equal(evidence.conditionCount,152);
});

test('build copies the mode UI into public and keeps the mobile buttons tappable',()=>{
  const source=fs.readFileSync('app-v510.js','utf8'),built=fs.readFileSync('public/app-v510.js','utf8'),css=fs.readFileSync('public/app-v510.css','utf8');
  for(const marker of ['STORE_ANALYSIS_MODES','data-analysis-mode','解析方式：'])assert.ok(source.includes(marker)&&built.includes(marker));
  assert.match(css,/\.analysis-mode-switch\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.analysis-mode-switch button\{[^}]*min-height:48px/);
});
