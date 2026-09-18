import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createJugestMcpTools} from '../src/mcp/tools.mjs';

const REPO_ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));

test('judge_machines MCP tool exposes only observed machine inputs and delegates one batch',async()=>{
  const calls=[];
  const service=createJugestMcpTools({
    rootDir:REPO_ROOT,
    judgeMachines:async input=>{calls.push(input);return {accepted:1,rejected:0,rows:[{ok:true,tableNo:'412',machineKey:'my'}]}}
  });

  const tools=service.listTools();
  const judge=tools.find(tool=>tool.name==='judge_machines');
  assert.ok(judge);
  assert.equal(judge.inputSchema.additionalProperties,false);
  assert.deepEqual(Object.keys(judge.inputSchema.properties),['machines']);
  assert.match(judge.description,/observed/i);
  assert.doesNotMatch(judge.description,/automatically.*PRE/i);

  const machines=[{tableNo:'412',machine:'マイジャグラーV',games:5230,bb:24,rb:18,diff:850}];
  const result=await service.callTool('judge_machines',{machines});
  assert.equal(calls.length,1);
  assert.equal(calls[0].rootDir,REPO_ROOT);
  assert.deepEqual(calls[0].machines,machines);
  assert.equal(result.accepted,1);
});

test('judge_machines refuses store/PRE fusion flags instead of silently changing the posterior',async()=>{
  const service=createJugestMcpTools({rootDir:REPO_ROOT,judgeMachines:async()=>({accepted:0,rejected:0,rows:[]})});
  await assert.rejects(
    service.callTool('judge_machines',{machines:[{machine:'my',games:1000,bb:4,rb:3}],storeId:'store-1'}),
    /unsupported argument: storeId/
  );
  await assert.rejects(
    service.callTool('judge_machines',{machines:[{machine:'my',games:1000,bb:4,rb:3}],usePre:true}),
    /unsupported argument: usePre/
  );
});
