import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {__test as runtime} from '../src/analysis/runtime-adapter.mjs';
import {judgeMachinesPublic} from '../src/mcp-handler.mjs';
import {JUGGLER_MACHINE_KEYS} from '../src/judge/juggler-external-judge.mjs';

const rootDir=fileURLToPath(new URL('../../',import.meta.url));
for(const machine of JUGGLER_MACHINE_KEYS)test(`${machine}: independent browser bridge and public MCP stay exactly equivalent`,async()=>{
 const {bridge}=await runtime.bootRuntime(rootDir);
 const inputs=[undefined,0,-830,830].map(diff=>({machine,tableNo:'3064',games:5278,bb:19,rb:22,...(diff===undefined?{}:{diff})}));
 const publicResult=await judgeMachinesPublic(inputs,{rootDir});
 assert.equal(publicResult.judgeVersion,'external-juggler-browser-parity-v1');
 for(let i=0;i<inputs.length;i++){
  const actual=bridge.judgeObservedMachine(inputs[i]),expected=publicResult.machines[i];
  for(const key of ['q','expectedSetting','p4','p5','p6','method','estimatedGrape','estimatedGrapeCount','grapeCountLo','grapeCountHi','reverseWarn'])assert.deepEqual(key==='q'?Array.from(actual[key]):actual[key],expected[key]);
  assert.deepEqual(Object.keys(expected).sort(),['ok','index','tableNo','machine','machineName','games','bb','rb','diff','q','method','expectedSetting','p4','p5','p6','estimatedGrape','estimatedGrapeCount','grapeCountLo','grapeCountHi','reverseWarn'].sort(),'MCP result must not acquire UI/diagnostic fields');
  assert.equal(actual.warnings.length,expected.reverseWarn?1:0);
 }
});
