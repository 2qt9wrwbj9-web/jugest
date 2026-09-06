import test from 'node:test';import assert from 'node:assert/strict';import {boot} from './helpers/runtime.mjs';
test('Unchecked or failed Collector status never claims normal operation',async()=>{
 const r=await boot(),build=r.ctx.JugestAppV510Test.buildHomeStatus;
 for(const raw of [{linked:false},{linked:true,enabledTargets:2,collectorCheckedAt:0},{linked:true,enabledTargets:2,collectorCheckedAt:1,collectorError:'offline'}]){
  const text=JSON.stringify(build(raw));assert.doesNotMatch(text,/取得エラーなし|稼働中|正常/);
 }
 const q=build({linked:true,collectorCheckedAt:1,launcherPending:2});assert.match(JSON.stringify(q),/Launcher/);assert.match(JSON.stringify(q),/2件/);
});
