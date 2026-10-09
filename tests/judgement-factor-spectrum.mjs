import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,plain} from './helpers/runtime.mjs';

const sample={machine:'my',tableNo:'307',games:4778,bb:14,rb:20,diff:-450};

test('factor spectrum respects probability interpolation, endpoint caps and equal-setting plateaus',async()=>{
 const {ctx}=await boot({loadApp:false});
 const equivalent=ctx.JUGESTJudgementView.equivalentSetting;
 const denominators=[300,280,260,240,220,200];
 const mid=(1/260+1/240)/2;
 const x=equivalent(mid,denominators);
 assert.equal(x.kind,'point');assert.ok(Math.abs(x.value-3.5)<1e-10);
 assert.equal(equivalent(0,denominators).label,'1未満');
 assert.equal(equivalent(1/180,denominators).label,'6超');
 assert.equal(equivalent(1/300,denominators).label,'1');
 assert.equal(equivalent(1/200,denominators).label,'6');
 const plateau=equivalent(1/6.02,[6.02,6.02,6.02,6.02,6.02,5.78]);
 assert.equal(plateau.kind,'range');assert.equal(plateau.label,'1〜5');
 assert.equal(equivalent(1/6.1,[6,6,6,6,6,6]).label,'設定差なし');
 assert.equal(equivalent(NaN,denominators).kind,'missing');
 assert.equal(equivalent(NaN,[6,6,6,6,6,6]).kind,'missing');
 assert.equal(equivalent(mid,[0,280,260,240,220,200]).kind,'missing');
});

test('each machine uses its exact existing result spec; render has no judgement side effects',async()=>{
 const {ctx,bridge}=await boot({loadApp:false});
 const view=ctx.JUGESTJudgementView;
 for(const machine of ctx.JUGESTJudgement.MACHINE_KEYS){
  const r=bridge.judgeObservedMachine({...sample,machine});
  const previous=plain(r);
  const html=view.result(r);
  const spec=r.engine.table.settings;
  assert.equal(spec.length,6);
  assert.ok(html.includes('判別要素別の設定相当値'));
  assert.ok(html.includes('機種スペック表'));
  assert.equal((html.match(/class="observed-factor-row"/g)||[]).length,4);
  assert.equal((html.match(/<tr><th scope="row">/g)||[]).length,6);
  assert.match(html,/--factor-color:#ef4444/);
  assert.match(html,/--factor-color:#3b82f6/);
  assert.match(html,/--factor-color:#8b5cf6/);
  assert.match(html,/--factor-color:#22c55e/);
  const first=Number(spec[0].b).toLocaleString('ja-JP',{maximumFractionDigits:2});
  assert.ok(html.includes('1/'+first),machine+' spec mismatch');
  assert.deepEqual(plain(r),previous);
 }
});

test('grape remains optional without a coin difference, while other factors still render',async()=>{
 const {ctx,bridge}=await boot({loadApp:false});
 const noDiff=bridge.judgeObservedMachine({...sample,diff:null});
 const html=ctx.JUGESTJudgementView.result(noDiff);
 assert.ok(html.includes('未推定'));
 assert.ok(html.includes('算出不可'));
 assert.ok(html.includes('機種スペック表'));
 assert.ok(html.includes('未使用'));
 assert.doesNotMatch(html,/>NaN<|>Infinity<|left:NaN|width:NaN/);
});
