import test from 'node:test';
import assert from 'node:assert/strict';

import {buildRelevanceTruth} from '../src/research/pre-v2/outcome.mjs';

test('protected six-setting posterior becomes PRE v2 expected relevance by table number',()=>{
  const truth=buildRelevanceTruth({
    judgedRows:[
      {tableNo:'101',machine:'my',q:[1,0,0,0,0,0]},
      {tableNo:'102',machine:'fk',q:[0,0,0,0,0,1]},
    ],
    expectedMachineKeys:['101','102'],
  });
  assert.equal(truth.size,2);
  assert.equal(truth.get('101'),0);
  assert.ok(Math.abs(truth.get('102')-11.27125)<1e-12);
});

test('New King V maps its protected padded q onto the dedicated 1/2/3/4/V scale',()=>{
  const truth=buildRelevanceTruth({
    judgedRows:[{tableNo:'301',machine:'newkingv',q:[0.2,0.2,0.2,0.2,0.2,0]}],
    expectedMachineKeys:['301'],
  });
  assert.ok(Math.abs(truth.get('301')-4.8)<1e-12);
});

test('normal HANA uses the six-setting HANA scale',()=>{
  const truth=buildRelevanceTruth({
    judgedRows:[{tableNo:'201',machine:'king',q:[0,0,0,0,0,1]}],
    expectedMachineKeys:['201'],
  });
  assert.equal(truth.get('201'),12.75);
});

test('formal truth fails closed for missing, extra, duplicate, unsupported, or malformed judged rows',()=>{
  assert.throws(()=>buildRelevanceTruth({judgedRows:[{tableNo:'101',machine:'my',q:[1,0,0,0,0,0]}],expectedMachineKeys:['101','102']}),/exact.*machine set|missing/i);
  assert.throws(()=>buildRelevanceTruth({judgedRows:[{tableNo:'101',machine:'my',q:[1,0,0,0,0,0]},{tableNo:'102',machine:'fk',q:[1,0,0,0,0,0]}],expectedMachineKeys:['101']}),/exact.*machine set|extra/i);
  assert.throws(()=>buildRelevanceTruth({judgedRows:[{tableNo:'101',machine:'my',q:[1,0,0,0,0,0]},{tableNo:'101',machine:'fk',q:[1,0,0,0,0,0]}],expectedMachineKeys:['101']}),/duplicate/i);
  assert.throws(()=>buildRelevanceTruth({judgedRows:[{tableNo:'101',machine:'unknown',q:[1,0,0,0,0,0]}],expectedMachineKeys:['101']}),/unsupported machine/i);
  assert.throws(()=>buildRelevanceTruth({judgedRows:[{tableNo:'101',machine:'my',q:null}],expectedMachineKeys:['101']}),/posterior|q/i);
  assert.throws(()=>buildRelevanceTruth({judgedRows:[{tableNo:'301',machine:'newkingv',q:[0.2,0.2,0.2,0.2,0.19,0.01]}],expectedMachineKeys:['301']}),/sixth|padded|setting 6/i);
});
