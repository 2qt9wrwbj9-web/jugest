import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {boot,memoryStorage,plain} from './helpers/runtime.mjs';

const UI_KEY='jugest:v510:ui';
const sample={machine:'my',tableNo:'102',games:5000,bb:20,rb:20,diff:-500};
const rows=[sample,{...sample,tableNo:'101',bb:25,rb:25,diff:''}];
async function ready(options={}){
 const runtime=await boot(options);
 assert.ok(runtime.ctx.JUGESTGroupJudge,'the shared runtime loads the group engine');
 assert.ok(runtime.ctx.JUGESTGroupJudgeView,'the shared runtime loads the pure display');
 return runtime;
}
function control(attribute,value,checked){return {value,checked,closest:s=>s===`[${attribute}]`?{value,checked}:null};}
function edit(app,row,key,value){const node={dataset:{observedField:key},value,closest:s=>s==='[data-observed-row]'?{dataset:{observedRow:row.id}}:null};app.editObservedField(node);return node;}
function change(app,attribute,value,checked){app.onChange({target:control(attribute,value,checked)});}

test('versioned input drafts survive reload, retain explicit zero and never restore results',async()=>{
 const {app,storage}=await ready();
 app.acceptMachineRows([{...sample,bb:0,rb:0,diff:0},rows[1]]);
 change(app,'data-observed-group-toggle',null,true);
 app.handleObservedAction('judge-all');
 assert.equal(app.observed.groupReport.ok,true);
 const before=plain(app.observed.rows.map(r=>r.input));
 const saved=JSON.parse(storage.getItem(UI_KEY));
 assert.equal(saved.observedDrafts.version,1);
 assert.ok(!JSON.stringify(saved.observedDrafts).includes('diagnostics'));
 assert.ok(!JSON.stringify(saved.observedDrafts).includes('result'));
 const reload=await ready({storage});
 assert.deepEqual(plain(reload.app.observed.rows.map(r=>r.input)),before);
 assert.equal(reload.app.observed.rows[0].input.bb,'0');
 assert.equal(reload.app.observed.rows[0].input.diff,'0');
 assert.ok(reload.app.observed.rows.every(r=>r.result===null));
 assert.equal(reload.app.observed.groupEnabled,true);
 assert.equal(reload.app.observed.groupReport,null);
 assert.equal(reload.app.observed.selectedId,null);
 reload.app.render();assert.doesNotMatch(reload.app.mount.innerHTML,/data-observed-group-report/);
});

test('single drafts and every edit, add, duplicate and delete mutation persist',async()=>{
 const {app,storage}=await ready();app.acceptMachineRows([sample]);
 edit(app,app.observed.single,'diff','0');
 assert.equal(JSON.parse(storage.getItem(UI_KEY)).observedDrafts.single.diff,'0');
 app.acceptMachineRows(rows);app.handleObservedAction('judge-all');
 const first=app.observed.rows[0];app.handleObservedAction('duplicate',first.id);
 assert.equal(app.observed.rows.length,3);
 const copy=app.observed.rows[1];assert.notEqual(copy.id,first.id);
 assert.equal(copy.input.tableNo,'');
 assert.deepEqual(plain({...copy.input,tableNo:first.input.tableNo}),plain(first.input));
 assert.equal(copy.result,null);assert.deepEqual(plain(copy.errors),{});
 assert.equal(JSON.parse(storage.getItem(UI_KEY)).observedDrafts.rows.length,3);
 app.handleObservedAction('add');assert.equal(JSON.parse(storage.getItem(UI_KEY)).observedDrafts.rows.length,4);
 app.handleObservedAction('delete',copy.id);assert.equal(JSON.parse(storage.getItem(UI_KEY)).observedDrafts.rows.length,3);
});

test('a real storage failure keeps the editor usable and reports only the unsaved state',async()=>{
 const {app,storage}=await ready();app.acceptMachineRows(rows);
 const save=storage.setItem;storage.setItem=()=>{throw Error('quota exceeded')};
 edit(app,app.observed.rows[0],'bb','21');
 assert.equal(app.observed.rows[0].input.bb,'21');assert.equal(app.observed.persistenceFailed,true);
 app.render();assert.match(app.mount.innerHTML,/入力を端末に保存できませんでした/);
 assert.doesNotMatch(app.mount.innerHTML,/data-observed-persistence-status hidden/);
 storage.setItem=save;app.persist();assert.equal(app.observed.persistenceFailed,false);
 app.render();assert.match(app.mount.innerHTML,/data-observed-persistence-status hidden/);
});

test('one overlong field among 200 drafts preserves the last reloadable save and recovers without truncation',async()=>{
 const {app,storage}=await ready();
 const many=Array.from({length:200},(_,i)=>({...sample,tableNo:String(i)}));app.acceptMachineRows(many);
 const saved=storage.getItem(UI_KEY),before=plain(app.observed.rows.map(row=>row.input));
 const bad=app.observed.rows[199];edit(app,bad,'tableNo','x'.repeat(2049));
 assert.equal(app.observed.persistenceFailed,true);
 assert.equal(storage.getItem(UI_KEY),saved,'an unreloadable payload cannot overwrite the last valid save');
 assert.equal(bad.input.tableNo.length,2049,'the live draft is never truncated');
 app.render();assert.match(app.mount.innerHTML,/台番.*2,048|台番.*2048/);
 assert.equal(storage.getItem(UI_KEY),saved,'a render-time save cannot bypass the same validation');
 const reload=await ready({storage:memoryStorage({[UI_KEY]:saved})});
 assert.deepEqual(plain(reload.app.observed.rows.map(row=>row.input)),before);
 edit(app,app.observed.rows[0],'bb','21');assert.equal(storage.getItem(UI_KEY),saved);
 edit(app,bad,'tableNo','199');assert.equal(app.observed.persistenceFailed,false);
 const recovered=await ready({storage:memoryStorage({[UI_KEY]:storage.getItem(UI_KEY)})});
 assert.equal(recovered.app.observed.rows.length,200);assert.equal(recovered.app.observed.rows[0].input.bb,'21');
 assert.equal(recovered.app.observed.rows[199].input.tableNo,'199');
});

test('1001 drafts cannot overwrite a valid save; returning to the row limit saves every row',async()=>{
 const {app,storage}=await ready();
 app.acceptMachineRows(Array.from({length:1000},(_,i)=>({...sample,tableNo:String(i)})));
 const saved=storage.getItem(UI_KEY);assert.equal(app.observed.persistenceFailed,false);
 app.handleObservedAction('add');assert.equal(app.observed.rows.length,1001);
 assert.equal(app.observed.persistenceFailed,true);assert.equal(storage.getItem(UI_KEY),saved);
 assert.match(app.mount.innerHTML,/1,000.*行|1000.*行/);
 const reload=await ready({storage:memoryStorage({[UI_KEY]:saved})});assert.equal(reload.app.observed.rows.length,1000);
 app.handleObservedAction('delete',app.observed.rows.at(-1).id);
 assert.equal(app.observed.persistenceFailed,false);assert.equal(app.observed.rows.length,1000);
 const recovered=await ready({storage:memoryStorage({[UI_KEY]:storage.getItem(UI_KEY)})});
 assert.deepEqual(plain(recovered.app.observed.rows.map(row=>row.input)),plain(app.observed.rows.map(row=>row.input)));
});

test('unsupported, malformed and oversized stored drafts are ignored; 200 valid drafts retain unique ids',async()=>{
 for(const value of [
  {version:99,rows:[sample]},
  {version:1,rows:[{...sample,games:{bad:true}}]},
  {version:1,rows:'bad'},
  {version:1,rows:[{...sample,tableNo:'x'.repeat(2049)}]},
 ]){
  const storage=memoryStorage({[UI_KEY]:JSON.stringify({observedMode:'parallel',observedDebug:true,observedDrafts:value})});
  const {app}=await ready({storage});assert.equal(app.observed.rows.length,0);assert.equal(app.observed.debug,true);
 }
 const many=Array.from({length:200},(_,i)=>({...sample,tableNo:String(i),bb:'0',diff:''}));
 const storage=memoryStorage({[UI_KEY]:JSON.stringify({observedMode:'parallel',observedDrafts:{version:1,single:null,rows:many}})});
 const {app}=await ready({storage});assert.equal(app.observed.rows.length,200);
 assert.equal(new Set(app.observed.rows.map(r=>r.id)).size,200);
 app.handleObservedAction('add');assert.equal(new Set(app.observed.rows.map(r=>r.id)).size,201);
 const huge=memoryStorage({[UI_KEY]:JSON.stringify({observedDrafts:{version:1,rows:[]},unused:'x'.repeat(2*1024*1024)})});
 const result=await ready({storage:huge});assert.equal(result.app.observed.rows.length,0);
});

test('group mode uses cached complete results and preserves all ordinary individual distributions',async()=>{
 const {app,ctx,bridge}=await ready();app.acceptMachineRows(rows);
 let judgeCalls=0,groupCalls=0;const oldJudge=bridge.judgeObservedMachine,oldGroup=ctx.JUGESTGroupJudge;
 ctx.JUGEST_CORE_BRIDGE={...bridge,judgeObservedMachine:x=>{judgeCalls++;return oldJudge(x)}};
 ctx.JUGESTGroupJudge={...oldGroup,analyze:entries=>{groupCalls++;return oldGroup.analyze(entries)}};
 app.handleObservedAction('judge-all');assert.equal(judgeCalls,2);assert.equal(groupCalls,0);
 const q=plain(app.observed.rows.map(r=>r.result.q)),ids=app.observed.rows.map(r=>r.id);
 change(app,'data-observed-group-toggle',null,true);assert.equal(groupCalls,1);
 assert.equal(app.observed.groupReport.ok,true);
 for(const key of ['tableNo','expectedSetting','p4','p5','p6','input'])change(app,'data-observed-sort',key);
 for(const key of ['all56','all6','all456'])change(app,'data-observed-allocation',key);
 app.handleObservedAction('detail',ids[0]);app.handleObservedAction('close-detail');
 assert.equal(judgeCalls,2);assert.equal(groupCalls,1,'display controls never recompute');
 change(app,'data-observed-group-toggle',null,false);assert.equal(app.observed.groupReport,null);
 change(app,'data-observed-group-toggle',null,true);assert.equal(judgeCalls,2);assert.equal(groupCalls,2);
 assert.deepEqual(plain(app.observed.rows.map(r=>r.result.q)),q);
 assert.deepEqual(app.observed.rows.map(r=>r.id),ids);
});

test('unnumbered group rows use current editor ordinals after single mode, skipped blanks, duplication and deletion',async()=>{
 const {app,ctx}=await ready();app.navigate('judgement');
 assert.equal(app.observed.single.id,'1');app.handleObservedAction('parallel');
 const weak=app.observed.rows[0];assert.equal(weak.id,'2');
 const fill=(row,values)=>{for(const [key,value] of Object.entries(values))edit(app,row,key,String(value));};
 fill(weak,{machine:'mr',tableNo:'',games:8000,bb:4,rb:1,diff:''});
 app.handleObservedAction('add');const strong=app.observed.rows[1];assert.equal(strong.id,'3');
 fill(strong,{machine:'mr',tableNo:'',games:8000,bb:40,rb:44,diff:''});
 change(app,'data-observed-group-toggle',null,true);
 const check=(weakRow,weakOrdinal,strongOrdinal)=>{
  app.handleObservedAction('judge-all');assert.equal(app.observed.groupReport.ok,true);
  assert.equal(app.observed.groupReport.n,2);
  for(const h of app.observed.groupReport.hypotheses){assert.equal(h.worstRow.id,weakRow.id);assert.equal(h.refutation.weakestRow.id,weakRow.id);}
  const html=app.mount.innerHTML.match(/<section class="panel observed-group-report"[\s\S]*?<\/section>/)?.[0];assert.ok(html);
  const label=`台番なし（${weakOrdinal}行目）`;
  assert.ok(html.includes(`最も整合しない台 <b>${label}</b>`),'the main warning identifies the actual editor row');
  assert.ok(html.includes(`<dt>最も下振れした台</dt><dd>${label}</dd>`),'weakest row agrees with the main warning');
  for(const ordinal of [weakOrdinal,strongOrdinal]){
   const current=`台番なし（${ordinal}行目）`;
   assert.ok(html.includes(`<div class="observed-group-conditional-row"><b>${current}</b>`),'conditional rows retain editor positions');
   assert.ok(html.includes(`<div class="observed-group-p-row"><b>${current}</b>`),'p-value rows retain editor positions');
  }
 };
 check(weak,1,2);const originalQ=plain(weak.result.q);
 app.handleObservedAction('duplicate',weak.id);const copy=app.observed.rows[1];
 for(const key of ctx.JUGESTJudgement.FIELDS)edit(app,weak,key,'');
 check(copy,2,3);assert.deepEqual(plain(copy.result.q),originalQ,'display numbering never changes ordinary judgement');
 app.handleObservedAction('duplicate',weak.id);const blankCopy=app.observed.rows[1];
 check(copy,3,4);
 app.handleObservedAction('delete',weak.id);check(copy,2,3);
 app.handleObservedAction('delete',blankCopy.id);check(copy,1,2);
});

test('standalone group labels use target ordinals instead of internal ids, and optional editor metadata stays pure',async()=>{
 const {ctx,bridge}=await ready({loadApp:false});
 const report=ctx.JUGESTGroupJudge.analyze([
  {id:'9001',result:bridge.judgeObservedMachine({machine:'mr',tableNo:'',games:8000,bb:4,rb:1,diff:''})},
  {id:'9002',result:bridge.judgeObservedMachine({machine:'mr',tableNo:'',games:8000,bb:40,rb:44,diff:''})},
 ]);assert.equal(report.ok,true);
 const before=structuredClone(report),rowNumbers=Object.freeze({'9001':4,'9002':7});
 const view=ctx.JUGESTGroupJudgeView;
 const fallback=view.render(report);
 assert.ok(fallback.includes('最も整合しない台 <b>台番なし（対象1台目）</b>'));
 assert.ok(fallback.includes('<dt>最も下振れした台</dt><dd>台番なし（対象1台目）</dd>'));
 assert.ok(fallback.includes('<div class="observed-group-conditional-row"><b>台番なし（対象2台目）</b>'));
 assert.ok(fallback.includes('<div class="observed-group-p-row"><b>台番なし（対象2台目）</b>'));
 assert.doesNotMatch(fallback,/行900[12]|900[12]行目/);
 for(const hypothesis of ['all456','all56','all6']){
  const html=view.render(report,{hypothesis,rowNumbers});
  assert.ok(html.includes('最も整合しない台 <b>台番なし（4行目）</b>'));
  assert.ok(html.includes('<dt>最も下振れした台</dt><dd>台番なし（4行目）</dd>'));
  assert.ok(html.includes('<div class="observed-group-conditional-row"><b>台番なし（7行目）</b>'));
  assert.ok(html.includes('<div class="observed-group-p-row"><b>台番なし（7行目）</b>'));
 }
 assert.deepEqual(structuredClone(report),before);assert.deepEqual(rowNumbers,{'9001':4,'9002':7});
});

test('parallel result rows retain compact most-likely text, including every tied setting',async()=>{
 const {ctx,bridge}=await ready({loadApp:false});const view=ctx.JUGESTJudgementView;
 const result=bridge.judgeObservedMachine(sample),before=structuredClone(result);
 const html=view.parallelResults([{id:'1',result}]);
 assert.ok(html.includes(`最有力 <b>${result.mostLikelySettings.map(s=>`設定${s}`).join(' / ')}</b>`));
 for(const label of ['期待設定','P4+','P5+','P6','推定ブドウ','observed-result-band'])assert.ok(html.includes(label),label);
 const tied=view.parallelResults([{id:'2',result:{...result,mostLikelySettings:[2,4]}}]);
 assert.ok(tied.includes('最有力 <b>設定2 / 設定4</b>'));
 assert.deepEqual(structuredClone(result),before);
});

test('reverse warnings identify the current editor row even when its internal id collides with a real table number',async()=>{
 const {app}=await ready();
 app.acceptMachineRows([{...sample,tableNo:'',diff:50000},{...sample,tableNo:'2',diff:''}]);
 const [warned,normal]=app.observed.rows;
 assert.equal(warned.id,normal.input.tableNo,'reproduces the ambiguous raw warning label');
 change(app,'data-observed-group-toggle',null,true);app.handleObservedAction('judge-all');
 const check=ordinal=>{
  assert.equal(app.observed.groupReport.ok,true);
  assert.match(app.mount.innerHTML,new RegExp(`台番なし（${ordinal}行目）：差枚の逆算に警告があります。`));
  assert.doesNotMatch(app.mount.innerHTML,/台2：差枚の逆算に警告があります。/,'the normal table2 must never be blamed');
 };
 check(1);app.handleObservedAction('duplicate',warned.id);
 for(const key of ['machine','tableNo','games','bb','rb','diff'])edit(app,warned,key,'');
 app.handleObservedAction('judge-all');check(2);
 app.handleObservedAction('delete',warned.id);app.handleObservedAction('judge-all');check(1);
});

test('standalone reverse warnings use target positions, preserve named escaping and never leak internal ids',async()=>{
 const {ctx,bridge}=await ready({loadApp:false});
 const report=ctx.JUGESTGroupJudge.analyze([
  {id:'9001',result:bridge.judgeObservedMachine({...sample,tableNo:'',diff:50000})},
  {id:'9002',result:bridge.judgeObservedMachine({...sample,tableNo:'<台2>',diff:50000})},
 ]);assert.equal(report.ok,true);
 const before=structuredClone(report),html=ctx.JUGESTGroupJudgeView.render(report);
 assert.match(html,/台番なし（対象1台目）：差枚の逆算に警告があります。/);
 assert.match(html,/&lt;台2&gt;：差枚の逆算に警告があります。/);
 assert.doesNotMatch(html,/台900[12]：差枚の逆算|<台2>/);
 const mapped=ctx.JUGESTGroupJudgeView.render(report,{rowNumbers:{'9001':4,'9002':7}});
 assert.match(mapped,/台番なし（4行目）：差枚の逆算に警告があります。/);
 assert.deepEqual(structuredClone(report),before,'warning display never mutates evidence or reports');
});

test('warning identity metadata leaves every saved group calculation and legacy report field exactly unchanged',async()=>{
 const {ctx,bridge}=await ready({loadApp:false});
 const saved={};
 vm.runInNewContext(execFileSync('git',['show','a563a04e4771420ef8689593e90cf6aa97e36c3d:group-judge.js']).toString(),saved);
 const cases=[
  [{...sample,tableNo:'',diff:50000},{...sample,tableNo:'2',diff:''}],
  [{...sample,diff:0},{...sample,tableNo:'103',diff:-500}],
  [{...sample,games:100,bb:0,rb:0,diff:''},{...sample,tableNo:'103',games:100,bb:0,rb:0,diff:''}],
  [{...sample,machine:'mr',games:8000,bb:40,rb:44,diff:''},{...sample,tableNo:'103',machine:'go',games:8000,bb:40,rb:44,diff:''}],
  [{...sample,games:10000000,bb:1,rb:0,diff:''},{...sample,tableNo:'103',games:10000000,bb:0,rb:1,diff:''}],
  [{...sample,games:10000001,diff:''},{...sample,tableNo:'103',diff:''}],
 ];
 for(const inputs of cases){
  const entries=inputs.map((input,i)=>({id:String(9001+i),result:bridge.judgeObservedMachine(input)}));
  const current=structuredClone(ctx.JUGESTGroupJudge.analyze(entries));
  const {reverseWarningRows,...legacyFields}=current;
  assert.deepEqual(legacyFields,structuredClone(saved.JUGESTGroupJudge.analyze(entries)),'preserve logs, ratios, p-values, distributions, totals, errors and original warnings exactly');
 }
});

test('unnumbered sorted results keep editor identities after editing and rejudging',async()=>{
 const {app}=await ready();
 app.acceptMachineRows([{...sample,tableNo:'',bb:4,rb:1,diff:''},{...sample,tableNo:'',bb:35,rb:40,diff:''}]);
 const [weak,strong]=app.observed.rows;
 change(app,'data-observed-group-toggle',null,true);app.handleObservedAction('judge-all');
 change(app,'data-observed-sort','p4');
 const labels=()=>[...app.mount.innerHTML.matchAll(/data-observed-result-row="([^"]+)"[\s\S]*?<b>([^<]+)<\/b>/g)].map(m=>[m[1],m[2]]);
 assert.deepEqual(labels(),[[strong.id,'台番なし（2行目）'],[weak.id,'台番なし（1行目）']]);
 const oldResult=weak.result;edit(app,weak,'rb','20');
 assert.equal(weak.result,null);assert.equal(app.observed.groupReport,null);
 app.render();assert.deepEqual(labels(),[[strong.id,'台番なし（2行目）']]);
 app.handleObservedAction('judge-all');assert.notEqual(weak.result,oldResult);assert.equal(weak.result.input.rb,20);
 assert.deepEqual(app.observed.rows.map(r=>r.id),[weak.id,strong.id]);
 assert.ok(app.mount.innerHTML.includes('最も整合しない台 <b>台番なし（1行目）</b>'));
 change(app,'data-observed-sort','input');
 assert.deepEqual(labels(),[[weak.id,'台番なし（1行目）'],[strong.id,'台番なし（2行目）']]);
});

test('group row labels reject inherited or invalid editor numbers without inventing positions',async()=>{
 const {ctx,bridge}=await ready({loadApp:false});
 const report=ctx.JUGESTGroupJudge.analyze([
  {id:'9001',result:bridge.judgeObservedMachine({machine:'mr',tableNo:'',games:8000,bb:4,rb:1,diff:''})},
  {id:'9002',result:bridge.judgeObservedMachine({machine:'mr',tableNo:'007',games:8000,bb:40,rb:44,diff:''})}
 ]);
 const view=ctx.JUGESTGroupJudgeView;
 for(const rowNumbers of [Object.create({'9001':99}),null,...[0,-1,2.5,Infinity,'7',true].map(n=>({'9001':n}))]){
  const html=view.render(report,{rowNumbers});
  assert.ok(html.includes('最も整合しない台 <b>台番なし（対象1台目）</b>'));
  assert.ok(html.includes('<div class="observed-group-conditional-row"><b>007</b>'));
  assert.doesNotMatch(html,/台番なし（(?:99|9001)行目）/);
 }
});

test('group overview warns that low-setting mixtures can escape refutation despite a large ratio',async()=>{
 const {ctx,bridge}=await ready({loadApp:false});
 const report=ctx.JUGESTGroupJudge.analyze(rows.map((input,i)=>({id:String(i),result:bridge.judgeObservedMachine(input)})));
 assert.equal(report.ok,true);const html=ctx.JUGESTGroupJudgeView.render(report);
 assert.ok(html.includes('低設定が混じっていても反証できない場合があります。'));
 assert.ok(html.includes('大きい根拠比も全台系の確定ではありません。'));
});

test('sorting changes only result order with stable ties, while labels and input order remain intact',async()=>{
 const {app,ctx}=await ready();app.acceptMachineRows([...rows,{...sample,tableNo:'101'}]);app.handleObservedAction('judge-all');
 const inputs=plain(app.observed.rows.map(r=>({id:r.id,input:r.input})));
 const html=ctx.JUGESTJudgementView.parallelResults(app.observed.rows,{sort:'tableNo'});
 const ids=[...html.matchAll(/data-observed-result-row="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(ids,[app.observed.rows[1].id,app.observed.rows[2].id,app.observed.rows[0].id]);
 for(const key of ['expectedSetting','p4','p5','p6']){
  const rendered=ctx.JUGESTJudgementView.parallelResults(app.observed.rows,{sort:key});
  const sorted=[...rendered.matchAll(/data-observed-result-row="([^"]+)"/g)].map(m=>app.observed.rows.find(r=>r.id===m[1]).result[key]);
  assert.ok(sorted.every((n,i)=>!i||sorted[i-1]>=n));
 }
 assert.deepEqual(plain(app.observed.rows.map(r=>({id:r.id,input:r.input}))),inputs);
 assert.match(html,/設定4以上/);assert.match(html,/推定ブドウ/);assert.match(html,/設定1/);
});

test('invalid, incomplete and unjudged nonempty rows block the group while empty rows are skipped',async()=>{
 const {app}=await ready();change(app,'data-observed-group-toggle',null,true);
 app.acceptMachineRows([...rows,{machine:'',games:'',bb:'',rb:'',diff:'',tableNo:''}]);app.handleObservedAction('judge-all');
 assert.equal(app.observed.groupReport.ok,true);assert.equal(app.observed.groupReport.n,2);
 app.handleObservedAction('add');const partial=app.observed.rows.at(-1);edit(app,partial,'machine','my');edit(app,partial,'games','5000');app.handleObservedAction('judge-all');
 assert.equal(app.observed.groupReport.ok,false);assert.match(app.mount.innerHTML,/data-observed-group-report/);
 assert.match(app.mount.innerHTML,/入力|未判別|確認/);assert.equal(app.observed.rows.filter(r=>r.result).length,2);
 app.handleObservedAction('delete',partial.id);app.handleObservedAction('judge-all');
 app.handleObservedAction('duplicate',app.observed.rows[0].id);
 change(app,'data-observed-group-toggle',null,false);change(app,'data-observed-group-toggle',null,true);
 assert.equal(app.observed.groupReport.ok,false,'unjudged duplicated draft cannot disappear from group');
 edit(app,app.observed.rows[1],'tableNo',sample.tableNo);app.handleObservedAction('judge-all');
 assert.equal(app.observed.groupReport.ok,false);assert.match(app.observed.groupReport.errors.join(' '),/重複|同じ台番/);
});

test('editing immediately removes only its row and the group, without rerendering input DOM',async()=>{
 const {app}=await ready();app.acceptMachineRows(rows);change(app,'data-observed-group-toggle',null,true);app.handleObservedAction('judge-all');
 const keep=app.observed.rows[1].result,first=app.observed.rows[0],removed=[];
 app.shadowRoot.querySelector=s=>['[data-observed-group-report]',`[data-observed-result-row="${first.id}"]`].includes(s)?{remove:()=>removed.push(s)}:null;
 const before=app.mount.innerHTML;app.render=()=>{throw Error('typing rerendered input DOM')};
 edit(app,first,'rb','21');assert.equal(app.observed.groupReport,null);assert.equal(first.result,null);
 assert.equal(app.observed.rows[1].result,keep);assert.equal(app.mount.innerHTML,before);
 assert.ok(removed.includes('[data-observed-group-report]'));
 assert.ok(removed.includes(`[data-observed-result-row="${first.id}"]`));
});

test('group display is pure, escaped, explanatory and separates ratios from conditional percentages',async()=>{
 const {ctx,bridge}=await ready({loadApp:false});const report=ctx.JUGESTGroupJudge.analyze(rows.map((r,i)=>({id:String(i),result:bridge.judgeObservedMachine({...r,tableNo:i?'<img src=x onerror=alert(1)>':r.tableNo})})));
 const before=plain(report),view=ctx.JUGESTGroupJudgeView;
 for(const hypothesis of ['all456','all56','all6']){
  const html=view.render(report,{hypothesis});
  for(const label of ['全456','非全456','既存モデルの根拠比','ボーナスだけの根拠比','仮説成立時・等重み','成立確率','根拠比の重み感度','最も整合しない台','条件付き','同じ設定'])assert.ok(html.includes(label),label);
  assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x|NaN|Infinity/);
  assert.match(html,/data-observed-allocation/);
  assert.match(html,/入力済み.*1\/2/);
 }
 assert.deepEqual(plain(report),before);
});

test('extreme ratios and tiny refutation p use their logs and impossible conditional output stays unavailable',async()=>{
 const {ctx,bridge}=await ready({loadApp:false});
 const report=ctx.JUGESTGroupJudge.analyze(rows.map((r,i)=>({id:String(i),result:bridge.judgeObservedMachine(r)})));
 report.hypotheses[0].logEvidenceRatio=1200;report.hypotheses[0].bonusLogEvidenceRatio=-1200;
 report.hypotheses[0].refutation.familyP=0;report.hypotheses[0].refutation.logFamilyP=-1200;
 report.hypotheses[0].conditional={available:false,reason:'許容設定の支持がありません',rows:[],topAllocations:[],expectedCounts:[],mapAssignment:[]};
 const html=ctx.JUGESTGroupJudgeView.render(report);
 assert.doesNotMatch(html,/NaN|Infinity|p\s*=\s*0(?:[^.\d]|$)/);
 assert.match(html,/10|対数/);assert.match(html,/反証あり/);assert.match(html,/許容設定の支持がありません/);
 assert.doesNotMatch(html,/data-observed-count-profile/);
});

test('60-row profiles stay compact and all input controls meet the stable mobile contract',async()=>{
 const {ctx,bridge,app}=await ready();
 const report=ctx.JUGESTGroupJudge.analyze(Array.from({length:60},(_,i)=>({id:String(i),result:bridge.judgeObservedMachine({...sample,tableNo:String(i)})})));
 const html=ctx.JUGESTGroupJudgeView.render(report);
 assert.match(html,/設定4.*台/);assert.doesNotMatch(html,/>[456]{30,}</);
 app.acceptMachineRows(rows);app.handleObservedAction('judge-all');app.render();
 for(const attr of ['data-observed-group-toggle','role="switch"','data-observed-sort','data-observed-action="duplicate"'])assert.ok(app.mount.innerHTML.includes(attr),attr);
 const css=fs.readFileSync('app-v510.css','utf8');assert.match(css,/observed-table-row/);assert.match(css,/font-size:16px/);
});
