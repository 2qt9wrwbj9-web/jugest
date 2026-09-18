import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as runtime from '../src/analysis/runtime-adapter.mjs';

const REPO_ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));

test('runtime adapter exposes observed-only machine batch judgement',async()=>{
  assert.equal(typeof runtime.runExistingMachineJudgementBatch,'function');

  const result=await runtime.runExistingMachineJudgementBatch({
    rootDir:REPO_ROOT,
    machines:[{tableNo:'412',machine:'my',games:5230,bb:24,rb:18,diff:850}]
  });

  assert.equal(result.accepted,1);
  assert.equal(result.rejected,0);
  assert.equal(result.rows.length,1);
  const row=result.rows[0];
  assert.equal(row.ok,true);
  assert.equal(row.tableNo,'412');
  assert.equal(row.machineKey,'my');
  assert.deepEqual(row.input,{games:5230,bb:24,rb:18,diff:850});
  assert.equal(row.q.length,6);
  assert.ok(Math.abs(row.q.reduce((sum,value)=>sum+value,0)-1)<1e-9);
  assert.ok(Number.isFinite(row.expectedSetting));
  assert.ok(Number.isFinite(row.p4));
  assert.ok(Number.isFinite(row.p5));
  assert.ok(Number.isFinite(row.p6));
});

test('MCP batch posterior and method exactly match the current protected JUGEST externalJudge result',async()=>{
  const input={tableNo:412,machine:'my',games:5230,bb:24,rb:18,diff:850};
  const {ctx}=await runtime.__test.bootRuntime(REPO_ROOT);
  const direct=JSON.parse(JSON.stringify(ctx.V4_TEST.externalJudge('my',5230,24,18,850)));
  const batch=await runtime.runExistingMachineJudgementBatch({rootDir:REPO_ROOT,machines:[input]});
  const row=batch.rows[0];

  assert.equal(row.ok,true);
  assert.equal(row.tableNo,'412');
  assert.deepEqual(row.q,direct.q);
  assert.equal(row.method,direct.method);
  assert.equal(row.expectedSetting,direct.q.reduce((sum,value,index)=>sum+value*(index+1),0));
  assert.equal(row.p4,direct.q[3]+direct.q[4]+direct.q[5]);
  assert.equal(row.p5,direct.q[4]+direct.q[5]);
  assert.equal(row.p6,direct.q[5]);
});

test('runtime adapter resolves a public My Juggler alias to the canonical JUGEST machine identity',async()=>{
  const result=await runtime.runExistingMachineJudgementBatch({
    rootDir:REPO_ROOT,
    machines:[{tableNo:'413',machine:'マイジャグラーV',games:4100,bb:18,rb:16}]
  });

  assert.equal(result.accepted,1);
  assert.equal(result.rejected,0);
  assert.equal(result.rows[0].ok,true);
  assert.equal(result.rows[0].machineKey,'my');
  assert.equal(result.rows[0].machineName,'マイジャグV');
});

test('one unreadable or unknown screenshot row does not discard valid machine rows',async()=>{
  const result=await runtime.runExistingMachineJudgementBatch({
    rootDir:REPO_ROOT,
    machines:[
      {tableNo:'501',machine:'マイジャグラーV',games:3800,bb:16,rb:14},
      {tableNo:'502',machine:'判別不能な機種名',games:3900,bb:17,rb:15},
      {tableNo:'503',machine:'go',games:4000,bb:18,rb:16,diff:400}
    ]
  });

  assert.equal(result.accepted,2);
  assert.equal(result.rejected,1);
  assert.equal(result.rows.length,3);
  assert.equal(result.rows[0].ok,true);
  assert.equal(result.rows[1].ok,false);
  assert.match(result.rows[1].error,/unknown machine/i);
  assert.equal(result.rows[2].ok,true);
});

test('machine batch is bounded at 200 rows',async()=>{
  const machines=Array.from({length:201},(_,index)=>({tableNo:String(index+1),machine:'my',games:1000,bb:4,rb:3}));
  await assert.rejects(
    runtime.runExistingMachineJudgementBatch({rootDir:REPO_ROOT,machines}),
    /at most 200 rows/i
  );
});

test('difference is optional and the existing JUGEST engine chooses the no-diff judgement path',async()=>{
  const result=await runtime.runExistingMachineJudgementBatch({
    rootDir:REPO_ROOT,
    machines:[{tableNo:'601',machine:'my',games:3000,bb:12,rb:11}]
  });
  assert.equal(result.accepted,1);
  assert.equal(result.rows[0].ok,true);
  assert.deepEqual(result.rows[0].input,{games:3000,bb:12,rb:11});
  assert.ok(result.rows[0].method.length>0);
});
