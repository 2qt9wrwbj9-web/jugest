// Keep the original protected hashes. Undo only the explicitly authorized
// judgement UI additions / diagnostic taps before checking the old baseline.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Reverse only reviewed machine-name edits before enforcing original protected hashes.
const APPROVED_NAME_EDITS=JSON.parse(readFileSync(new URL('./approved-machine-name-changes.json',import.meta.url),'utf8'));
function restoreReviewedMachineNames(file,source){
 for(const [updated,original] of APPROVED_NAME_EDITS[file]||[]){
  assert.equal(source.split(updated).length-1,1,`unreviewed machine-name change: ${file}`);
  source=source.replace(updated,original);
 }
 return source;
}

// Pin only reviewed additions; original production hash fixtures stay unchanged.
const APPROVED_BLOCKS=Object.freeze({
 '  // BEGIN independent judgement UI\n':'237c72d031d53f67b15651b5fd70b30010f0ed88d15fbc7e5dffb2e032014117',
 '/* BEGIN independent judgement styles */\n':'df15e1246ed3b28a7d16b0522c361aeaf9cc494cd56f023b1d5af9a8b01d2729',
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
// Undo ONLY explicitly reviewed My Juggler VI additions before comparing the
// legacy production snapshots. This keeps every existing model/table guarded.
function withoutMy6Additions(file,source){
 const aliases="['my6',['マイジャグラーⅥ','マイジャグラーVI','マイジャグラー6','マイジャグⅥ','マイジャグVI','マイジャグ6']],\n ";
 if(file==='ana-launcher.js'||file==='ana-single-day.js'){
  source=replace(source,aliases);
  if(file==='ana-single-day.js')source=replace(source,"my6:'マイジャグⅥ',");
 }
 if(file==='index.html'){
  const entry='// The My Juggler VI alias intentionally uses the same judgement parameters as V.\nM.my6={...M.my,name:"マイジャグⅥ",defs:M.my.defs.map(row=>[...row]),T:M.my.T.map(row=>({...row})),simple:M.my.simple.map(row=>({...row})),revch:[...M.my.revch],note:"マイジャグⅥ：マイジャグⅤと同一の判別用スペックを使用。"};\n';
  source=replace(source,entry);
  const approved=[
   ['"my","my6","im"','"my","im"',1],
   ['my6:[97.0,98.0,99.9,102.8,105.3,109.4],','',1],
   ['my6:{G:"",v:{},on:{}},','',1],
   ['my6:[],','',1],
   ['my6:"random",','',1],
   ['my6:null,','',1],
   ['my6:"マイⅥ",','',2],
   ['if(key==="my"||key==="my6")return','if(key==="my")return',1],
   ['if(key==="my"||key==="my6"||key==="fk"||key==="hp")','if(key==="my"||key==="fk"||key==="hp")',2],
   ['if(cur==="my"||cur==="my6"||cur==="fk"||cur==="hp")','if(cur==="my"||cur==="fk"||cur==="hp")',1]
  ];
  for(const [from,to,count] of approved)source=replace(source,from,to,count);
 }
 return source;
}
export function withoutJudgementAdditions(file,source){
 // The approved name manifest covers the whole head. Remove our independently
 // reviewed script insertion first, so that exact-name checks still see it.
 if(file==='index.html')source=replace(source,'<script src="./group-judge.js"></script><script src="./group-judge-view.js"></script>');
 if(file==='build.mjs'||file==='tests/helpers/runtime.mjs')source=replace(source,"'group-judge.js','group-judge-view.js',");
 source=restoreReviewedMachineNames(file,source);
 source=withoutMy6Additions(file,source);
 if(file==='app-v510.js'){
  // Exact source restoration for the bounded draft-storage additions only.
  source=replace(source,"function loadUIState(){try{const raw=global.localStorage?.getItem?.(UI_KEY);return typeof raw==='string'&&raw.length<=2*1024*1024?safeJSON(raw,{}):{}}catch(_){return {}}}\n","function loadUIState(){try{return safeJSON(global.localStorage?.getItem?.(UI_KEY),{})}catch(_){return {}}}\n");
  source=replace(source,"  persist(){let reason='端末の保存領域に書き込めません。空き容量やブラウザの保存設定を確認してください。';try{const drafts=this.observedDrafts();reason=this.observedDraftError(drafts);if(reason)throw Error('保存できない入力');const value=JSON.stringify({workspace:this.state.workspace,activeStore:this.state.activeStore,noticeLedger:this.noticeLedger,observedMode:this.observed.mode,observedDebug:this.observed.debug,observedGroup:this.observed.groupEnabled,observedSort:this.observed.sort,observedAllocation:this.observed.allocation,observedDrafts:drafts});if(value.length>2*1024*1024){reason='保存データのサイズが上限を超えています。';throw Error('保存データの上限超過')}reason='端末の保存領域に書き込めません。空き容量やブラウザの保存設定を確認してください。';if(typeof global.localStorage?.setItem!=='function')throw Error('UI保存を利用できません');global.localStorage.setItem(UI_KEY,value);this.observed.persistenceFailed=false;this.observed.persistenceReason=''}catch(_){this.observed.persistenceFailed=true;this.observed.persistenceReason=reason}this.patchObservedPersistenceNotice()}\n","  persist(){try{global.localStorage?.setItem?.(UI_KEY,JSON.stringify({workspace:this.state.workspace,activeStore:this.state.activeStore,noticeLedger:this.noticeLedger,observedMode:this.observed.mode,observedDebug:this.observed.debug}))}catch(_){}}\n");
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
   ["    this.observed={mode:saved.observedMode==='parallel'?'parallel':'single',single:null,rows:[],seq:0,selectedId:null,debug:saved.observedDebug===true,groupEnabled:saved.observedGroup===true,groupReport:null,sort:['input','tableNo','expectedSetting','p4','p5','p6'].includes(saved.observedSort)?saved.observedSort:'input',allocation:['all456','all56','all6'].includes(saved.observedAllocation)?saved.observedAllocation:'all456'};\n",''],
   ["    this.restoreObservedDrafts(saved.observedDrafts);\n",''],
   ["    if(this.handleObservedControl(event.target))return;\n",''],
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
  source=replace(source," for(const [file,sha] of Object.entries(baseline.public))if(file!=='app-v510.css'){const data=fs.readFileSync(`public/${file}`);assert.equal(hash(['ana-launcher.js','ana-single-day.js'].includes(file)?withoutJudgementAdditions(file,data.toString('utf8')):data),sha,file);}"," for(const [file,sha] of Object.entries(baseline.public))if(file!=='app-v510.css')assert.equal(hash(fs.readFileSync(`public/${file}`)),sha,file);");
  source=replace(source,"import {withoutJudgementAdditions} from './helpers/judgement-preservation.mjs';\n");
  source=replace(source,"let html=withoutJudgementAdditions('index.html',fs.readFileSync('index.html','utf8'));","let html=fs.readFileSync('index.html','utf8');");
 }
 return source;
}
