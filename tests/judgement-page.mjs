import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {boot,plain,memoryStorage} from './helpers/runtime.mjs';
import {patchJugestIndexSource} from '../vps/src/ui-source-patch.mjs';

const input={machine:'my',tableNo:'3064',games:5278,bb:19,rb:22,diff:830};
const state=ctx=>ctx.JudgementProbe.snapshot();
async function observedBoot(options={}){
 const html=options.htmlSource??fs.readFileSync('index.html','utf8');
 const probe=`window.JudgementProbe={snapshot:()=>JSON.stringify({liveSessions,sessions,data,shops,v4Context,cmpData,hana:v510HanaStateData}),confidence:trendConfidence,
 seed:()=>{shops.push({id:"shop-test",name:"既存店"});v4Context.shopId="shop-test";v4Context.tableNo="999";},
 instrument:()=>{window.observedCalls={judge:0,reverse:0};const originalJudge=externalJudge,originalReverse=reverseCore;externalJudge=function(...a){observedCalls.judge++;return originalJudge(...a)};reverseCore=function(...a){observedCalls.reverse++;return originalReverse(...a)};}};
`;
 return boot({...options,htmlSource:html.replace('window.V4_TEST=',probe+'window.V4_TEST=')});
}

test('all eight machines match externalJudge and the existing summaries exactly',async()=>{
 const {ctx,bridge}=await observedBoot({loadApp:false});
 for(const machine of ctx.JUGESTJudgement.MACHINE_KEYS)for(const diff of [undefined,null,0,-830,830]){
  const x={...input,machine,diff},actual=bridge.judgeObservedMachine(x);
  const expected=ctx.V4_TEST.externalJudge(machine,x.games,x.bb,x.rb,diff??null);
  assert.equal(actual.ok,true);
  for(const key of ['q','method','reverseWarn','estimatedGrape','estimatedGrapeCount','grapeCountLo','grapeCountHi'])assert.deepEqual(actual[key],expected[key],`${machine}/${diff}/${key}`);
  const summary=ctx.JUGESTJudgement.posteriorSummary(expected.q);
  for(const key of ['expectedSetting','p4','p5','p6'])assert.equal(actual[key],summary[key]);
  assert.equal(actual.distributionConcentration,ctx.JudgementProbe.confidence(actual.q));
 }
});

test('input validation preserves explicit zero and rejects missing or malformed observations',async()=>{
 const {bridge}=await observedBoot({loadApp:false});
 for(const x of [{...input,bb:0},{...input,rb:0},{...input,diff:0},{...input,diff:''}])assert.equal(bridge.judgeObservedMachine(x).ok,true);
 for(const patch of [{bb:''},{rb:''},{bb:null},{games:''},{games:0},{games:-1},{games:'1.5'},{games:'5,278'},{games:true},{bb:'O'},{diff:'?'},{machine:'houou'},{machine:'unknown'},{bb:6000}])assert.equal(bridge.judgeObservedMachine({...input,...patch}).ok,false,JSON.stringify(patch));
 assert.equal(bridge.judgeObservedMachine(null).ok,false);
 assert.equal(bridge.judgeObservedMachine({...input,diff:''}).method,'bonus-only');
 assert.equal(bridge.judgeObservedMachine({...input,diff:0}).method,'reverse-diff');
});

test('diagnostics come from one execution and judgement has no session, store, storage or autosave side effects',async()=>{
 const {ctx,bridge,storage,timers}=await observedBoot({loadApp:false});
 ctx.JudgementProbe.seed();ctx.JudgementProbe.instrument();
 const before=state(ctx),saved=[...storage.map],scheduled=[...timers.keys()];
 const r=bridge.judgeObservedMachine(input);
 assert.deepEqual(plain(ctx.observedCalls),{judge:1,reverse:1});
 assert.deepEqual(r.diagnostics.logs,r.diagnostics.reverse.Ls);
 assert.deepEqual(r.q,r.diagnostics.reverse.q);
 ctx.JUGESTJudgementView.result(r);ctx.JUGESTJudgementView.summary(r);
 assert.deepEqual(plain(ctx.observedCalls),{judge:1,reverse:1},'rendering must not judge again');
 assert.equal(state(ctx),before);assert.deepEqual([...storage.map],saved);assert.deepEqual([...timers.keys()],scheduled);
 r.engine.table.settings[0].b=1;r.engine.table.revch[0]=1;
 assert.equal(bridge.judgeObservedMachine(input).engine.table.settings[0].b,273.07,'metadata must not expose a mutable engine table');
});

test('single and parallel share the same adapter, imports only fill drafts, and edits invalidate results',async()=>{
 const {ctx,app}=await observedBoot();const before=state(ctx);
 app.acceptMachineRows([input]);app.judgeObservedRow(app.observed.single);
 const single=plain(app.observed.single.result);
 const ids=app.acceptMachineRows([input,{...input,tableNo:'3065',diff:null}]);
 assert.equal(app.observed.mode,'parallel');assert.equal(app.observed.rows[0].result,null);
 app.handleObservedAction('judge-all');assert.deepEqual(plain(app.observed.rows[0].result),single);
 app.handleObservedAction('detail',ids[0]);assert.match(app.mount.innerHTML,/設定1〜6の確率/);
 const element={value:'20',dataset:{observedField:'bb'},closest:s=>s==='[data-observed-row]'?{dataset:{observedRow:ids[0]}}:null};
 app.editObservedField(element);assert.equal(app.observed.rows[0].result,null);assert.equal(app.observed.selectedId,null);
 app.handleObservedAction('delete',ids[0]);assert.equal(app.observed.rows.length,1);
 assert.equal(state(ctx),before);
});

test('all maximum-probability settings are retained and detailed output is escaped',async()=>{
 const {ctx,bridge}=await observedBoot({loadApp:false});
 assert.deepEqual(plain(ctx.JUGESTJudgement.mostLikelySettings([.1,.1,.1,.3,.3,.1])),[4,5]);
 const r=bridge.judgeObservedMachine({...input,tableNo:'<img src=x onerror=alert(1)>'});
 const html=ctx.JUGESTJudgementView.result(r);
 assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);
 for(const label of ['分布集中度','ログ尤度','既存の設定別逆算行','技術情報','MCP判別識別子'])assert.ok(html.includes(label));
 assert.ok(html.indexOf('設定1〜6の確率')<html.indexOf('入力データ'));
 assert.ok(html.indexOf('入力データ')<html.indexOf('詳細分析'));
});

test('six tabs preserve old workspace keys, navigation history and safe UI restoration',async()=>{
 const storage=memoryStorage({'jugest:v510:ui':JSON.stringify({workspace:'judgement',observedMode:'parallel'})});
 const {ctx,app}=await observedBoot({storage});
 assert.deepEqual(plain(ctx.JugestAppV510Test.WORKSPACES),['home','judgement','live','store','records','data']);
 assert.equal(app.state.workspace,'judgement');assert.equal(app.observed.mode,'parallel');
 const history=[];ctx.history.pushState=s=>history.push(s);app.navigate('judgement');app.navigate('live','rev');
 app.onPopState({state:history[0]});assert.equal(app.state.workspace,'judgement');
 app.onPopState({state:history[1]});assert.equal(app.state.screen,'rev');
 assert.match(app.renderBottomNav(),/data-workspace="home"[\s\S]*data-workspace="judgement"[\s\S]*data-workspace="live"/);
 for(const key of ['home','live','store','records','data'])assert.equal(ctx.JugestAppV510Test.validWorkspace(key),key);
});

test('built and VPS-patched sources retain the page, bridge and existing shop fixes',async()=>{
 const built=fs.readFileSync('public/index.html','utf8'),source=fs.readFileSync('index.html','utf8'),patched=patchJugestIndexSource(source);
 assert.equal(patchJugestIndexSource(patched),patched);
 for(const html of [built,patched]){
  assert.match(html,/judgeObservedMachine:/);assert.match(html,/function v510ResolveRecordShop/);
  assert.match(html,/judgement-model\.js/);assert.match(html,/judgement-view\.js/);
 }
 assert.match(patched,/function vpsSetActiveStore/);
 assert.match(fs.readFileSync('public/app-v510.css','utf8'),/repeat\(6,1fr\)/);
 for(const file of ['judgement-model.js','judgement-view.js'])assert.equal(fs.readFileSync(`public/${file}`,'utf8'),fs.readFileSync(file,'utf8'));
 const {bridge}=await observedBoot({loadApp:false,htmlSource:patched});assert.equal(bridge.judgeObservedMachine(input).ok,true);
});
