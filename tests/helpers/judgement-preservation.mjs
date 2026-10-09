// Keep the original protected hashes. Undo only the explicitly authorized
// judgement UI additions / diagnostic taps before checking the old baseline.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Pin only reviewed additions; original production hash fixtures stay unchanged.
const APPROVED_BLOCKS=Object.freeze({
 '  // BEGIN independent judgement UI\n':'efa1c27d4a3c0a14dbc7c95143b018a9c8289e150a1f76ab175929e6f25da75d',
 '/* BEGIN independent judgement styles */\n':'962b94a63ae73dc83ae4bc756154f70af0bf02a5a29da2f2c6f1f8714c2e7862',
 '// Independent observed-data judgement: no session, context or persistence writes.\n':'8bcf1c9f5394ea7b75c960c7df3ef064273942555543d03a6f12c6992b57a5c4'
});
const REVIEWED_LIVE_REVERSE=Object.freeze({
 helpers:'a712f70308d5aa9888fa73ff4f1941b9d58f4c2e7de303f26fda032dce301e0c',
 styles:'094ce8598a31be72a2055aef8b7dd196a2b9451a4db6369196b6b1d77e5d7cd0',
 methods:Object.freeze({renderReverseScreen:'1f438de9b5ae66485f7cf6aacf334fcce8ff458d8fc54119e269f3d792b1d734',patchReverseResult:'11ea50b69944a4bcf4c17a2007b08f3c53a1ed65306524be0a0969e2b4e48f92'})
});
const LIVE_REVERSE_BASELINE=JSON.parse(readFileSync(new URL('./live-reverse-baseline.json',import.meta.url),'utf8'));
function restoreLiveReverseMethod(source,name){
 const anchor='  '+name+'(';
 assert.equal(source.split(anchor).length-1,1,'reviewed reverse method exists exactly once: '+name);
 const at=source.indexOf(anchor),end=source.indexOf('\n',at);
 assert.ok(end>at,'reviewed reverse method has a line end');
 const current=source.slice(at,end+1);
 assert.equal(createHash('sha256').update(current).digest('hex'),REVIEWED_LIVE_REVERSE.methods[name],'unreviewed reverse method modification: '+name);
 assert.ok(LIVE_REVERSE_BASELINE[name]?.startsWith(anchor),'original reverse method fixture: '+name);
 return source.slice(0,at)+LIVE_REVERSE_BASELINE[name]+source.slice(end+1);
}
function stripLiveReverseBlock(source,start,end,expected){
 const at=source.indexOf(start),finish=source.indexOf(end,at);
 assert.ok(at>=0&&finish>at,'approved reverse block boundaries');
 assert.equal(source.split(start).length-1,1,'unique reverse block start');
 assert.equal(source.split(end).length-1,1,'unique reverse block end');
 const stop=finish+end.length;
 assert.equal(createHash('sha256').update(source.slice(at,stop)).digest('hex'),expected,'unreviewed reverse UI addition');
 return source.slice(0,at)+source.slice(stop);
}
const REVIEWED_LIVE_JUDGE_COMPACT=Object.freeze({
 jsHelpers:'018fc4573198a3c45ac56f07cde68dea92f3ef0c080880873206441aba6f34ae',
 cssStyles:'167d19b1c1cb89676963cfa6f7611d1ab72147fbdc03fa5ffb6555663153cce9',
 methods:Object.freeze({"renderJudgeScreen": "bb7a72f01a0e6168b12c383a93f434894b928cea2e332dcbbfb8ef361c51e02d", "patchJudgeResult": "36cf395e91dbafa099c13b969a928a8c6bedbe0ce3b7a55f1ef2c15eb57b6ea9", "hanaResultPanel": "705c5e43f95aea751aa69a633518bb10af6b2ce3f10bf5ad25a688f8202366d0", "patchHanaResult": "04148def61d690f6d6c3e72924ebe9319b7f1824340720cdb671873ffa595593", "renderHanaJudgeScreen": "5a447f3d28c67acf941187126286d9ee9a1cde0b5dda47ad0010cb24b26cd4f2"})
});
const LIVE_JUDGE_COMPACT_BASELINE=JSON.parse(readFileSync(new URL('./live-judge-compact-baseline.json',import.meta.url),'utf8'));
function restoreCompactJudgementMethod(source,name){
 const anchor='  '+name+'(';
 assert.equal(source.split(anchor).length-1,1,'compact live method occurrence: '+name);
 const a=source.indexOf(anchor),b=source.indexOf('\n  ',a+3);
 assert.ok(b>a,'compact live method boundary: '+name);
 const actual=source.slice(a,b);
 assert.equal(createHash('sha256').update(actual).digest('hex'),REVIEWED_LIVE_JUDGE_COMPACT.methods[name],'unreviewed live judgement change: '+name);
 const prior=LIVE_JUDGE_COMPACT_BASELINE[name];
 assert.ok(typeof prior==='string'&&prior.startsWith(anchor),'live compact baseline: '+name);
 return source.slice(0,a)+prior+source.slice(b);
}
function replace(source,from,to='',count=1){
 assert.equal(source.split(from).length-1,count,`approved judgement anchor count: ${from.slice(0,65)}`);
 return source.replaceAll(from,to);
}
function block(source,start,end,replacement=''){
 assert.equal(source.split(start).length-1,1,'approved judgement start boundary count');
 assert.equal(source.split(end).length-1,1,'approved judgement end boundary count');
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert.ok(a>=0&&b>a,'approved judgement block markers missing');
 assert.equal(createHash('sha256').update(source.slice(a,b+end.length)).digest('hex'),APPROVED_BLOCKS[start],'Unreviewed judgement addition inside protected block');
 return source.slice(0,a)+replacement+source.slice(b+end.length);
}
export function withoutJudgementAdditions(file,source){
 if(file==='app-v510.js'){
  source=stripLiveReverseBlock(source,'\n// BEGIN reviewed live judgement compact helpers\n','// END reviewed live judgement compact helpers\n',REVIEWED_LIVE_JUDGE_COMPACT.jsHelpers);
  for(const name of Object.keys(REVIEWED_LIVE_JUDGE_COMPACT.methods))source=restoreCompactJudgementMethod(source,name);
  source=stripLiveReverseBlock(source,'// BEGIN reviewed live reverse display helpers\n','// END reviewed live reverse display helpers\n',REVIEWED_LIVE_REVERSE.helpers);
  source=replace(source,'\n\n\nclass JugestApp extends HTMLElement{','\n\nclass JugestApp extends HTMLElement{');
  for(const name of ['renderReverseScreen','patchReverseResult'])source=restoreLiveReverseMethod(source,name);
  source=block(source,'  // BEGIN independent judgement UI\n','  // END independent judgement UI\n');
  for(const [from,to] of [
   ["['home','judgement','live','store','records','data']","['home','live','store','records','data']"],
   ["home:'ホーム',judgement:'判別',live:","home:'ホーム',live:"],
   ["home:'⌂',judgement:'▥',live:","home:'⌂',live:"],
   ["    this.observed={mode:saved.observedMode==='parallel'?'parallel':'single',single:null,rows:[],seq:0,selectedId:null,debug:saved.observedDebug===true};\n",''],
   [',observedDebug:this.observed.debug',''],
   [',observedMode:this.observed.mode',''],
   ['${this.renderObservedSettingsButton()}',''],
   ["    const observedDebug=event.target.closest?.('[data-observed-debug-toggle]');if(observedDebug){this.setObservedDebug(observedDebug.checked);return}\n",''],
   ["    const observedAction=event.target.closest?.('[data-observed-action]');if(observedAction){this.handleObservedAction(observedAction.dataset.observedAction,observedAction.dataset.rowId);return}\n",''],
   ['judgement:()=>this.renderObservedPage(),',''],
   ["if(this.state.workspace==='judgement')return this.renderObservedPage();",''],
   [",...(next==='judgement'?{observedMode:this.observed.mode,observedRowId:this.observed.selectedId}:{})",''],
   ["if(this.state.workspace==='judgement')this.restoreObservedHistory(s);",'']
  ])source=replace(source,from,to);
  const field="    const observedField=event.target.closest?.('[data-observed-field]');if(observedField){this.editObservedField(observedField);return}\n";
  source=replace(source,field,'',2);
 }else if(file==='app-v510.css'){
  source=stripLiveReverseBlock(source,'\n/* BEGIN reviewed live judgement compact styles */\n','/* END reviewed live judgement compact styles */\n',REVIEWED_LIVE_JUDGE_COMPACT.cssStyles);
  source=stripLiveReverseBlock(source,'/* BEGIN reviewed live reverse compact styles */\n','/* END reviewed live reverse compact styles */\n',REVIEWED_LIVE_REVERSE.styles);
  source=block(source,'/* BEGIN independent judgement styles */\n','\n/* END independent judgement styles */\n');
  source=replace(source,'grid-template-columns:repeat(6,1fr)','grid-template-columns:repeat(5,1fr)');
 }else if(file==='index.html'){
  source=replace(source,'Independent judgement page v1 — 2026-10-02:\n- Added a second-position judgement workspace with single/parallel observed-data inputs and shared detailed results.\n- Reused externalJudge and the existing MCP summaries; diagnostic taps expose values from the same invocation.\n- Added distribution concentration, setting probability bars and an explicit structured-row draft interface.\n- Judgment math, MCP result schemas, PRE/store analysis, sessions and run-record persistence are unchanged.\n\n');
  source=replace(source,'<script src="./judgement-model.js"></script><script src="./judgement-view.js"></script>');
  source=replace(source,'function externalBonusJudgeQ(key,g,bb,rb,capture){','function externalBonusJudgeQ(key,g,bb,rb){');
  source=replace(source,'function externalJudge(key,g,bb,rb,diff,capture){','function externalJudge(key,g,bb,rb,diff){');
  source=replace(source,' if(capture)capture({logs:L.slice(),style:"unknown"});\n');
  source=replace(source,'   if(capture){const captured={...z,q:z.q.slice(),Ls:z.Ls.slice(),rows:z.rows.map(row=>({...row}))};capture({logs:captured.Ls,reverse:captured,style:"unknown"});}\n');
  source=replace(source,'externalBonusJudgeQ(key,g,bb,rb,capture);','externalBonusJudgeQ(key,g,bb,rb);');
  source=block(source,'// Independent observed-data judgement: no session, context or persistence writes.\n','function rejudgeExternalMachine(r){','function rejudgeExternalMachine(r){');
  source=replace(source,' getObservedJudgeMachines:()=>JUGGLER_MACHINE_KEYS.map(key=>({key,name:M[key].name})),\n judgeObservedMachine:(input)=>v510JudgeObservedMachine(input||{}),\n');
 }else if(file==='build.mjs'){
  source=replace(source,"'judgement-model.js','judgement-view.js',");
 }else if(file==='tests/helpers/runtime.mjs'){
  source=replace(source,",htmlSource=null",'');
  source=replace(source,"'judgement-model.js','judgement-view.js',",'');
  source=replace(source,"htmlSource??fs.readFileSync('index.html','utf8')","fs.readFileSync('index.html','utf8')");
 }else if(file==='tests/production-preservation.mjs'){
  source=replace(source,"import {withoutJudgementAdditions} from './helpers/judgement-preservation.mjs';\n");
  source=replace(source,"let html=withoutJudgementAdditions('index.html',fs.readFileSync('index.html','utf8'));","let html=fs.readFileSync('index.html','utf8');");
 }
 return source;
}
