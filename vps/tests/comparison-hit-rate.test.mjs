import test from 'node:test';
import assert from 'node:assert/strict';
import {__test as liveTest} from '../src/research/live-comparison.mjs';
import {__test as historicalTest} from '../src/research/historical-summary.mjs';

function metric(overlaps){
  return {
    quality:1,coverage:1,rankCorrelation:0,
    top1:{overlap:overlaps[0],rate:overlaps[0],lift:1},
    top3:{overlap:overlaps[1],rate:overlaps[1]/3,lift:1},
    top5:{overlap:overlaps[2],rate:overlaps[2]/5,lift:1}
  };
}

test('live summary aggregates day-level Top1 Top3 Top5 hit rates separately from overlap rate',()=>{
  const rows=[
    {scores:{pre_research:{metrics:metric([1,2,0])}}},
    {scores:{pre_research:{metrics:metric([0,1,3])}}},
    {scores:{pre_research:{metrics:metric([0,0,1])}}}
  ];
  const summary=liveTest.averageMetric(rows,'pre_research');
  assert.deepEqual(summary.hitRates.top1,{hits:1,days:3,rate:1/3});
  assert.deepEqual(summary.hitRates.top3,{hits:2,days:3,rate:2/3});
  assert.deepEqual(summary.hitRates.top5,{hits:2,days:3,rate:2/3});
  assert.notEqual(summary.top3.rate,summary.hitRates.top3.rate,'average overlap rate must remain a different analytical metric');
});

test('historical summary exposes the same day-level hit-rate shape',()=>{
  const rows=[
    {preMetrics:metric([1,1,1])},
    {preMetrics:metric([0,0,2])}
  ];
  const summary=historicalTest.averageMetric(rows,'preMetrics');
  assert.deepEqual(summary.hitRates.top1,{hits:1,days:2,rate:.5});
  assert.deepEqual(summary.hitRates.top3,{hits:1,days:2,rate:.5});
  assert.deepEqual(summary.hitRates.top5,{hits:2,days:2,rate:1});
});
