import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,plain} from './helpers/runtime.mjs';

test('My Juggler VI is selectable in live and parallel judgement, independently named but spec-identical to V',async()=>{
  const {bridge,ctx}=await boot({loadApp:false});
  const options=plain(bridge.getObservedJudgeMachines());
  assert.equal(options.find(m=>m.key==='my')?.name,'マイジャグラーⅤ');
  assert.equal(options.find(m=>m.key==='my6')?.name,'マイジャグラーVI');
  assert.equal(options.filter(m=>['my','my6'].includes(m.key)).length,2);
  const observed={tableNo:'714',games:6000,bb:24,rb:26,diff:360};
  const a=bridge.judgeObservedMachine({machine:'my',...observed});
  const b=bridge.judgeObservedMachine({machine:'my6',...observed});
  assert.equal(a.ok,true);assert.equal(b.ok,true);
  assert.deepEqual(plain(b.q),plain(a.q));
  assert.deepEqual(b.engine.table.settings,a.engine.table.settings);
  assert.deepEqual(b.engine.table.revch,a.engine.table.revch);
  assert.notEqual(a.machineName,b.machineName);
  const metrics={grape:1000,cherry:145,b0:12,bc:6,bu:6,r0:15,rc:7,ru:4};
  function live(machine){
    bridge.setJudgeMachine(machine);bridge.setJudgeG(6000);
    for(const [field,n] of Object.entries(metrics))bridge.setJudgeMetric(field,n);
    return plain(bridge.getJudgeState());
  }
  const v=live('my'),vi=live('my6');
  assert.equal(vi.machine,'my6');
  assert.equal(vi.machineName,'マイジャグラーVI');
  assert.deepEqual(vi.defs.map(x=>x.id),v.defs.map(x=>x.id));
  assert.deepEqual(vi.q,v.q);
  assert.equal(vi.expectedSetting,v.expectedSetting);
  assert.equal(vi.p4,v.p4);
  assert.deepEqual(plain(ctx.JUGESTJudgement.MACHINE_KEYS).includes('my6'),true);
});
