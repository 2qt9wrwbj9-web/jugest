import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as runtime from '../src/analysis/runtime-adapter.mjs';

const REPO_ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));

function closeEnoughArray(a,b,eps=1e-12){
  assert.equal(a.length,b.length);
  for(let i=0;i<a.length;i+=1)assert.ok(Math.abs(a[i]-b[i])<=eps,`index ${i}: ${a[i]} != ${b[i]}`);
}

test('batch machine judgement reuses the protected JUGEST posterior',async()=>{
  assert.equal(typeof runtime.runExistingMachineJudgement,'function','runtime must expose runExistingMachineJudgement');

  const input={machineNo:'101',machine:'my',games:5000,bb:20,rb:18,diff:100};
  const direct=await runtime.runExistingMachineJudgement({rootDir:REPO_ROOT,machines:[input]});
  assert.equal(direct.machines.length,1);
  const row=direct.machines[0];
  assert.equal(row.machineNo,'101');
  assert.equal(row.machine,'my');
  assert.equal(row.games,5000);
  assert.equal(row.bb,20);
  assert.equal(row.rb,18);
  assert.equal(row.diff,100);
  assert.equal(row.q.length,6);
  assert.ok(Math.abs(row.q.reduce((a,b)=>a+b,0)-1)<1e-9);
  assert.ok(Number.isFinite(row.expectedSetting));
  assert.ok(Number.isFinite(row.p4));
  assert.ok(Number.isFinite(row.p5));
  assert.ok(Number.isFinite(row.p6));
  assert.equal(typeof row.method,'string');

  const protectedDay=await runtime.runExistingStoreDayJudgement({
    rootDir:REPO_ROOT,
    shop:'MCP判別一致テスト店',
    sourceStoreId:'mcp-parity',
    targetDate:'2026-09-19',
    days:[{
      date:'2026-09-19',
      machines:[{
        machine:'my',category:'juggler',sourceMachineName:'マイジャグラーV',tableNo:'101',
        games:5000,bb:20,rb:18,diff:100
      }]
    }]
  });
  closeEnoughArray(row.q,protectedDay.rows[0].q);
  assert.ok(Math.abs(row.expectedSetting-protectedDay.rows[0].expectedSetting)<=1e-12);
});

test('batch machine judgement supports bonus-only rows and validates unsafe inputs',async()=>{
  assert.equal(typeof runtime.runExistingMachineJudgement,'function','runtime must expose runExistingMachineJudgement');

  const result=await runtime.runExistingMachineJudgement({
    rootDir:REPO_ROOT,
    machines:[{machineNo:'202',machine:'fk',games:6200,bb:27,rb:20}]
  });
  const row=result.machines[0];
  assert.equal(row.diff,null);
  assert.equal(row.q.length,6);
  assert.ok(row.q.every(Number.isFinite));
  assert.ok(Math.abs(row.q.reduce((a,b)=>a+b,0)-1)<1e-9);

  await assert.rejects(
    runtime.runExistingMachineJudgement({rootDir:REPO_ROOT,machines:[{machine:'unknown',games:1000,bb:3,rb:2}]}),
    /unsupported machine/i
  );
  await assert.rejects(
    runtime.runExistingMachineJudgement({rootDir:REPO_ROOT,machines:[{machine:'my',games:10,bb:8,rb:8}]}),
    /BB\+RB/i
  );
  await assert.rejects(
    runtime.runExistingMachineJudgement({rootDir:REPO_ROOT,machines:Array.from({length:201},()=>({machine:'my',games:1000,bb:3,rb:2}))}),
    /at most 200/i
  );
});
