import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {
  PRE_V2_C,
  PRE_V2_LAMBDA_GRID,
  createSequentialState,
  updateSequentialState,
} from '../src/research/pre-v2/sequential.mjs';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/pre-v2-sequential-reference.json',import.meta.url),'utf8'));

function close(actual,expected,tolerance=1e-12){
  assert.ok(Math.abs(actual-expected)<tolerance,`expected ${actual} to be within ${tolerance} of ${expected}`);
}

test('PRE v2 scorer constants stay locked to the independently frozen reference contract',()=>{
  assert.equal(PRE_V2_C,fixture.source.c);
  assert.deepEqual(PRE_V2_LAMBDA_GRID,fixture.lambdas);
});

test('PRE v2 sequential state matches the frozen external reference vector',()=>{
  let state=createSequentialState();
  for(const delta of fixture.deltas)state=updateSequentialState(state,delta);
  assert.equal(state.count,fixture.expected.count);
  close(state.cumulativeSum,fixture.expected.cumulativeSum,1e-15);
  close(state.intrinsicTime,fixture.expected.intrinsicTime,1e-15);
  assert.equal(state.componentLogE.length,fixture.expected.componentLogE.length);
  state.componentLogE.forEach((value,index)=>close(value,fixture.expected.componentLogE[index]));
  close(state.logE,fixture.expected.logE);
  close(state.eValue,fixture.expected.eValue);
});
