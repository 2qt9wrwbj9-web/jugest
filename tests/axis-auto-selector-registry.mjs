import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_AXIS_DEFINITIONS,
  createAxisRegistry
} from '../research/axis-auto-selector/registry.mjs';
import {axisSignalsFromPredictionRow} from '../research/axis-auto-selector/jugest-adapter.mjs';

const baseDefinition=Object.freeze({
  id:'example-v1',
  label:'Example axis',
  version:1,
  approved:true,
  sourceId:'jugest-row:exampleSignal',
  sourceField:'exampleSignal',
  aliases:[],
  scope:'prediction-row',
  minHistory:0,
  availability:'finite-source-value',
  audit:'Test-only deterministic signal.',
  correlationGroup:'example',
  maxWeight:1
});

const customRegistry=definitions=>createAxisRegistry({
  definitions,
  correlationGroups:[{id:'example',maxWeight:.6}]
});

test('default registry exposes the exact Phase 1 approval policy and immutable metadata',()=>{
  const registry=createAxisRegistry();

  assert.equal(registry.get('practical-v1').approved,true);
  assert.equal(registry.get('model-v1').approved,true);
  assert.equal(registry.get('strict-v1').approved,true);
  assert.equal(registry.get('calendar-v1').approved,false);
  assert.deepEqual(registry.approved().map(axis=>axis.id),[
    'practical-v1','model-v1','strict-v1'
  ]);
  assert.equal(registry.get('practical-v1').sourceId,'jugest-row:practicalSignal');
  assert.equal(registry.get('practical-v1').scope,'prediction-row');
  assert.equal(registry.get('practical-v1').minHistory,0);
  assert.equal(registry.get('calendar-v1').availability,'unavailable-phase-1');
  assert.equal(registry.groupCap('calendar-model'),.2);
  assert.deepEqual(registry.groupCaps(),{'calendar-model':.2});
  assert.equal(registry.has('missing-v1'),false);
  assert.equal(registry.get('missing-v1'),undefined);

  assert.ok(Object.isFrozen(DEFAULT_AXIS_DEFINITIONS));
  assert.ok(DEFAULT_AXIS_DEFINITIONS.every(Object.isFrozen));
  assert.ok(Object.isFrozen(registry));
  assert.ok(Object.isFrozen(registry.list()));
  assert.ok(Object.isFrozen(registry.approved()));
  assert.ok(Object.isFrozen(registry.groupCaps()));
  assert.ok(Object.isFrozen(registry.get('practical-v1')));
  assert.ok(Object.isFrozen(registry.get('practical-v1').aliases));
  assert.throws(()=>registry.list().push(baseDefinition),TypeError);
  assert.throws(()=>{registry.get('practical-v1').approved=false;},TypeError);
});

test('registry rejects duplicate axis ids',()=>{
  assert.throws(
    ()=>customRegistry([baseDefinition,{...baseDefinition,label:'Duplicate'}]),
    /duplicate axis id/i
  );
});

test('registry rejects invalid versions',()=>{
  for(const version of [0,-1,1.5,NaN,'1']){
    assert.throws(
      ()=>customRegistry([{...baseDefinition,version}]),
      /version/i,
      `version ${String(version)}`
    );
  }
});

test('registry rejects out-of-range axis and correlation-group weights',()=>{
  for(const maxWeight of [-.01,1.01,Infinity,'1']){
    assert.throws(
      ()=>customRegistry([{...baseDefinition,maxWeight}]),
      /maxWeight/i,
      `axis maxWeight ${String(maxWeight)}`
    );
  }
  assert.throws(
    ()=>createAxisRegistry({
      definitions:[baseDefinition],
      correlationGroups:[{id:'example',maxWeight:1.1}]
    }),
    /maxWeight/i
  );
});

test('registry rejects axes that reference unknown correlation-group metadata',()=>{
  assert.throws(
    ()=>createAxisRegistry({
      definitions:[baseDefinition],
      correlationGroups:[{id:'another-group',maxWeight:.5}]
    }),
    /unknown correlation group/i
  );
});

test('registry snapshots custom definitions and retains shared source identity for alias dedup',()=>{
  const definitions=[
    {...baseDefinition,aliases:['legacy-example']},
    {...baseDefinition,id:'example-alias-v1',label:'Example alias',aliases:['example-v1']}
  ];
  const registry=customRegistry(definitions);
  definitions[0].sourceId='changed-after-creation';
  definitions[0].aliases.push('changed-after-creation');

  assert.equal(registry.get('example-v1').sourceId,'jugest-row:exampleSignal');
  assert.deepEqual(registry.get('example-v1').aliases,['legacy-example']);
  assert.equal(
    registry.get('example-v1').sourceId,
    registry.get('example-alias-v1').sourceId
  );
  assert.equal(registry.groupCap('example'),.6);
});

test('adapter maps current JUGEST prediction fields exactly and keeps the fixed bonus separate',()=>{
  const registry=createAxisRegistry();
  const row={
    key:'my|17',machine:'my',tableNo:'17',rank:2,hybridScore:.7123456789,
    practicalSignal:.81,modelSignal:.63,strictSignal:.57,
    hybridValidatedBonus:.035,actualES:4.25,actualP4:.76
  };

  const out=axisSignalsFromPredictionRow(row,registry);

  assert.equal(out.key,row.key);
  assert.equal(out.controlRank,row.rank);
  assert.equal(out.controlScore,row.hybridScore);
  assert.equal(out.axes['practical-v1'],row.practicalSignal);
  assert.equal(out.axes['model-v1'],row.modelSignal);
  assert.equal(out.axes['strict-v1'],row.strictSignal);
  assert.equal(out.axes['calendar-v1'],null);
  assert.equal(out.fixedBonus,row.hybridValidatedBonus||0);
  assert.equal(out.actualES,row.actualES);
  assert.equal(out.actualP4,row.actualP4);
  assert.ok(Object.isFrozen(out));
  assert.ok(Object.isFrozen(out.axes));
});

test('adapter builds the existing machine/table key and fails optional non-finite values safe',()=>{
  const out=axisSignalsFromPredictionRow({
    machine:'hana',tableNo:403,rank:1,hybridScore:.9,
    practicalSignal:null,modelSignal:NaN,strictSignal:Infinity,
    hybridValidatedBonus:NaN,actualES:undefined,actualP4:-Infinity
  },createAxisRegistry());

  assert.equal(out.key,'hana|403');
  assert.deepEqual(out.axes,{
    'practical-v1':null,
    'model-v1':null,
    'strict-v1':null,
    'calendar-v1':null
  });
  assert.equal(out.fixedBonus,0);
  assert.equal(out.actualES,null);
  assert.equal(out.actualP4,null);
});

test('adapter rejects malformed required row identity, rank, and control score',()=>{
  const registry=createAxisRegistry();
  assert.throws(
    ()=>axisSignalsFromPredictionRow(null,registry),
    /prediction row/i
  );
  assert.throws(
    ()=>axisSignalsFromPredictionRow({machine:'my',tableNo:1,rank:NaN,hybridScore:.5},registry),
    /rank/i
  );
  assert.throws(
    ()=>axisSignalsFromPredictionRow({machine:'my',tableNo:1,rank:1,hybridScore:Infinity},registry),
    /hybridScore/i
  );
  assert.throws(
    ()=>axisSignalsFromPredictionRow({rank:1,hybridScore:.5},registry),
    /identity/i
  );
});
