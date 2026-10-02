// Keep the original protected hashes. Undo only the explicitly authorized
// judgement UI additions / diagnostic taps before checking the old baseline.
import assert from 'node:assert/strict';

function replace(source,from,to=''){
 assert.ok(source.includes(from),`approved judgement transform missing: ${from.slice(0,65)}`);
 return source.replace(from,to);
}
function block(source,start,end,replacement=''){
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert.ok(a>=0&&b>a,'approved judgement block markers missing');
 return source.slice(0,a)+replacement+source.slice(b+end.length);
}
export function withoutJudgementAdditions(file,source){
 if(file==='app-v510.js'){
  source=block(source,'  // BEGIN independent judgement UI\n','  // END independent judgement UI\n');
  for(const [from,to] of [
   ["['home','judgement','live','store','records','data']","['home','live','store','records','data']"],
   ["home:'ホーム',judgement:'判別',live:","home:'ホーム',live:"],
   ["home:'⌂',judgement:'▥',live:","home:'⌂',live:"],
   ["    this.observed={mode:saved.observedMode==='parallel'?'parallel':'single',single:null,rows:[],seq:0,selectedId:null};\n",''],
   [',observedMode:this.observed.mode',''],
   ["    const observedAction=event.target.closest?.('[data-observed-action]');if(observedAction){this.handleObservedAction(observedAction.dataset.observedAction,observedAction.dataset.rowId);return}\n",''],
   ['judgement:()=>this.renderObservedPage(),',''],
   ["if(this.state.workspace==='judgement')return this.renderObservedPage();",'']
  ])source=replace(source,from,to);
  const field="    const observedField=event.target.closest?.('[data-observed-field]');if(observedField){this.editObservedField(observedField);return}\n";
  source=replace(replace(source,field),field);
 }else if(file==='app-v510.css'){
  source=block(source,'/* BEGIN independent judgement styles */\n','\n/* END independent judgement styles */\n');
  source=replace(source,'grid-template-columns:repeat(6,1fr)','grid-template-columns:repeat(5,1fr)');
 }else if(file==='index.html'){
  source=replace(source,'Independent judgement page v1 — 2026-10-02:\n- Added a second-position judgement workspace with single/parallel observed-data inputs and shared detailed results.\n- Reused externalJudge and the existing MCP summaries; diagnostic taps expose values from the same invocation.\n- Added distribution concentration, setting probability bars and an explicit structured-row draft interface.\n- Judgment math, MCP result schemas, PRE/store analysis, sessions and run-record persistence are unchanged.\n\n');
  source=replace(source,'<script src="./judgement-model.js"></script><script src="./judgement-view.js"></script>');
  source=replace(source,'function externalBonusJudgeQ(key,g,bb,rb,capture){','function externalBonusJudgeQ(key,g,bb,rb){');
  source=replace(source,'function externalJudge(key,g,bb,rb,diff,capture){','function externalJudge(key,g,bb,rb,diff){');
  source=replace(source,' if(capture)capture({logs:L,style:"unknown"});\n');
  source=replace(source,'   if(capture)capture({logs:z.Ls,reverse:z,style:"unknown"});\n');
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
