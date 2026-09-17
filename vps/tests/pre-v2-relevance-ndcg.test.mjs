import test from 'node:test';
import assert from 'node:assert/strict';

import {
  expectedRelevance,
  relevanceScaleForFamily,
} from '../src/research/pre-v2/relevance.mjs';
import {
  linearNdcg,
  pairedNdcgDelta,
} from '../src/research/pre-v2/ndcg.mjs';

test('Juggler relevance has setting 1 at zero and preserves accepted payout gaps', () => {
  const relevance = relevanceScaleForFamily('juggler');
  assert.equal(relevance['1'], 0);
  assert.ok(Math.abs(relevance['2'] - 1.11125) < 1e-12);
  assert.ok(Math.abs(relevance['3'] - 2.86375) < 1e-12);
  assert.ok(Math.abs(relevance['4'] - 5.38) < 1e-12);
  assert.ok(Math.abs(relevance['5'] - 7.92125) < 1e-12);
  assert.ok(Math.abs(relevance['6'] - 11.27125) < 1e-12);
});

test('normal HANA scale excludes New King V and uses the four six-stage machines', () => {
  assert.deepEqual(relevanceScaleForFamily('hana'), {
    1: 0,
    2: 2,
    3: 4,
    4: 6.75,
    5: 9.75,
    6: 12.75,
  });
});

test('New King V uses its dedicated five-stage relevance scale', () => {
  assert.deepEqual(relevanceScaleForFamily('new_king_v'), {
    1: 0,
    2: 2,
    3: 4,
    4: 7,
    V: 11,
  });
});

test('expected relevance uses the full posterior without rounding an expected setting', () => {
  assert.ok(Math.abs(expectedRelevance({1: 0.5, 6: 0.5}, 'juggler') - 11.27125 / 2) < 1e-12);
  assert.ok(Math.abs(expectedRelevance({1: 0.25, 2: 0.25, 3: 0.25, V: 0.25}, 'new_king_v') - 4.25) < 1e-12);
});

test('posterior probabilities must be finite, nonnegative, and sum to one within tolerance', () => {
  assert.throws(() => expectedRelevance({1: 0.5, 6: 0.6}, 'juggler'), /sum to 1/i);
  assert.throws(() => expectedRelevance({1: 1.1, 6: -0.1}, 'juggler'), /nonnegative/i);
});

test('linear NDCG gives a perfect ranking score 1 and a reversal less than 1', () => {
  const truth = new Map([['a', 3], ['b', 2], ['c', 1]]);
  const perfect = linearNdcg(['a', 'b', 'c'], truth, 3);
  const reverse = linearNdcg(['c', 'b', 'a'], truth, 3);
  assert.equal(perfect.informative, true);
  assert.equal(perfect.score, 1);
  assert.equal(reverse.informative, true);
  assert.ok(reverse.score < 1);
  assert.ok(reverse.score > 0);
});

test('NDCG uses kEff=min(k, ranking length, truth size)', () => {
  const truth = new Map([['a', 3], ['b', 2]]);
  const result = linearNdcg(['a', 'b'], truth, 10);
  assert.equal(result.kEff, 2);
  assert.equal(result.score, 1);
});

test('IDCG zero is diagnostic non-informative and formal paired delta is zero', () => {
  const truth = new Map([['a', 0], ['b', 0]]);
  const ndcg = linearNdcg(['a', 'b'], truth, 2);
  const paired = pairedNdcgDelta(['a', 'b'], ['b', 'a'], truth, 2);
  assert.equal(ndcg.informative, false);
  assert.equal(ndcg.score, null);
  assert.equal(ndcg.idcg, 0);
  assert.equal(paired.informative, false);
  assert.equal(paired.delta, 0);
  assert.equal(paired.challenger.score, null);
  assert.equal(paired.champion.score, null);
});

test('paired delta is challenger minus champion on the exact same truth map', () => {
  const truth = new Map([['a', 3], ['b', 2], ['c', 1]]);
  const result = pairedNdcgDelta(['a', 'b', 'c'], ['c', 'b', 'a'], truth, 3);
  assert.ok(result.delta > 0);
  assert.equal(result.delta, result.challenger.score - result.champion.score);
});
