import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRE_V2_LAMBDA_GRID,
  alphaForTrial,
  createSequentialState,
  promotionEvidence,
  updateSequentialState,
} from '../src/research/pre-v2/sequential.mjs';

test('lifetime alpha allocation approaches but never exceeds 0.05', () => {
  let sum = 0;
  for (let k = 1; k <= 100000; k += 1) sum += alphaForTrial(k);
  assert.ok(sum < 0.05);
  assert.ok(0.05 - sum < 1e-6);
  assert.equal(alphaForTrial(1), 0.025);
});

test('lambda grid is frozen below the c=2 boundary 0.5', () => {
  assert.deepEqual(PRE_V2_LAMBDA_GRID, [0.025, 0.05, 0.10, 0.20, 0.30, 0.40, 0.475]);
  assert.ok(PRE_V2_LAMBDA_GRID.every((lambda) => lambda > 0 && lambda < 0.5));
});

test('daily deltas outside [-1,1] or non-finite values are rejected', () => {
  assert.throws(() => updateSequentialState(createSequentialState(), 1.0001), /\[-1, 1\]/);
  assert.throws(() => updateSequentialState(createSequentialState(), Number.NaN), /finite/);
});

test('predictable center is the lagged running mean and state round-trips through JSON', () => {
  let state = createSequentialState();
  state = updateSequentialState(state, 0.2);
  assert.equal(state.lastPredictableCenter, 0);
  state = updateSequentialState(state, -0.1);
  assert.equal(state.lastPredictableCenter, 0.2);
  const restored = JSON.parse(JSON.stringify(state));
  assert.deepEqual(updateSequentialState(restored, 0.3), updateSequentialState(state, 0.3));
});

test('fixed reference vector matches independent Choe-Ramdas fixed-lambda calculation', () => {
  const deltas = [0.20, -0.10, 0.30, 0.15, -0.05, 0.25];
  let state = createSequentialState();
  for (const delta of deltas) state = updateSequentialState(state, delta);

  assert.equal(state.count, 6);
  assert.ok(Math.abs(state.cumulativeSum - 0.75) < 1e-15);
  assert.ok(Math.abs(state.intrinsicTime - 0.2504340277777778) < 1e-15);
  assert.ok(Math.abs(state.logE - 0.14026538051985996) < 1e-12);
  assert.ok(Math.abs(state.eValue - 1.1505790996245957) < 1e-12);
  const expectedComponents = [
    0.018669028769355833,
    0.037164386118211185,
    0.0735510168068252,
    0.14306137316482462,
    0.20519750951699353,
    0.24932230083827306,
    0.22816975674472084,
  ];
  assert.equal(state.componentLogE.length, expectedComponents.length);
  state.componentLogE.forEach((actual, index) => {
    assert.ok(Math.abs(actual - expectedComponents[index]) < 1e-12);
  });
});

test('promotion evidence uses anytime maximum and the alpha-specific threshold', () => {
  let state = createSequentialState();
  for (let i = 0; i < 200; i += 1) state = updateSequentialState(state, 0.4);
  const evidence = promotionEvidence(state, 0.05);
  assert.equal(evidence.threshold, 20);
  assert.equal(evidence.crossed, true);
  assert.ok(evidence.crossedAt > 0);
  assert.ok(state.maxLogE >= Math.log(20));
});
