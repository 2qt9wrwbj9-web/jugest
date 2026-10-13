import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './helpers/runtime.mjs';

test('current My Juggler VI inputs remain valid in the group engine with V-identical mathematical outputs',async()=>{
 const {ctx,bridge}=await boot({loadApp:false});
 for(const diff of ['',0,-1200,1800]){
  const inputs=[{machine:'my',tableNo:'101',games:8000,bb:32,rb:30,diff},{machine:'my6',tableNo:'102',games:5000,bb:20,rb:17,diff}];
  const analyze=rows=>ctx.JUGESTGroupJudge.analyze(rows.map((input,i)=>({id:String(i+1),result:bridge.judgeObservedMachine(input)})));
  const mixed=analyze(inputs),same=analyze(inputs.map(input=>({...input,machine:'my'})));
  assert.equal(mixed.ok,true,'do not reject a machine already supported by current production');
  for(let i=0;i<3;i++){
   const a=structuredClone(mixed.hypotheses[i]),b=structuredClone(same.hypotheses[i]);
   assert.deepEqual(a,b,'hypothesis ratios, refutation and every conditional allocation remain V-identical');
  }
  const entries=inputs.map((input,i)=>({id:String(i+1),result:bridge.judgeObservedMachine(input)}));
  const model=ctx.JUGESTJudgement;
  try{delete ctx.JUGESTJudgement;assert.equal(ctx.JUGESTGroupJudge.analyze(entries).ok,true,'pure fallback validation also accepts the current production key');}
  finally{ctx.JUGESTJudgement=model}
 }
});

test('V/VI pooled reference requires their captured bonus tables to agree and never combines incompatible tables',async()=>{
 const {ctx,bridge}=await boot({loadApp:false});
 const inputs=[{machine:'my',tableNo:'101',games:8000,bb:32,rb:30,diff:''},{machine:'my6',tableNo:'102',games:5000,bb:20,rb:17,diff:''}];
 const entries=inputs.map((input,i)=>({id:String(i+1),result:bridge.judgeObservedMachine(input)}));
 const mixed=ctx.JUGESTGroupJudge.analyze(entries);
 const same=ctx.JUGESTGroupJudge.analyze(inputs.map((input,i)=>({id:String(i+1),result:bridge.judgeObservedMachine({...input,machine:'my'})})));
 assert.equal(mixed.ok,true);assert.equal(mixed.aggregate.mixedMachines,true,'keep actual model identities');
 assert.equal(mixed.aggregateJudgement.available,true);
 assert.deepEqual(structuredClone(mixed.aggregateJudgement),structuredClone(same.aggregateJudgement),'same-setting bonus-only reference is mathematically identical');
 const changed=structuredClone(entries);changed[1].result.engine.table.settings[0].b+=1;
 const incompatible=ctx.JUGESTGroupJudge.analyze(changed);
 assert.equal(incompatible.ok,true);assert.equal(incompatible.aggregateJudgement.available,false,'labels alone never establish equal probability tables');
 assert.deepEqual(entries,inputs.map((input,i)=>({id:String(i+1),result:bridge.judgeObservedMachine(input)})),'never modify existing individual results');
});
