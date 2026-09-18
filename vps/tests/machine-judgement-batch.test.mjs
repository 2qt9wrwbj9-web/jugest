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
