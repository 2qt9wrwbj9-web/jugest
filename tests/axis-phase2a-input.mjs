import test from 'node:test';
import assert from 'node:assert/strict';
import {extractExternalDays} from '../research/axis-auto-selector/input.mjs';

const packedDay={id:1,source:'ana-slo',date:'2026-01-01',shop:'A',createdAt:1,updatedAt:2,machines:[['my','101',6000,1200,24,16,'observed','observed']]};

test('input adapter accepts a real JUGEST backup package and expands packed machine rows',()=>{
 const days=extractExternalDays({app:'juggler-tool',backupVersion:1,state:{externalDays:[packedDay]}});
 assert.deepEqual(days,[{...packedDay,machines:[{machine:'my',tableNo:'101',games:6000,diff:1200,bb:24,rb:16,gamesSource:'observed',diffSource:'observed'}]}]);
});

test('input adapter also accepts direct externalDays/day arrays without mutating input',()=>{
 const object={externalDays:[packedDay]},before=structuredClone(object);
 assert.equal(extractExternalDays(object).length,1);
 assert.deepEqual(object,before);
 assert.equal(extractExternalDays([packedDay]).length,1);
});

test('store-filtered input expands only the requested store before packed-row validation',()=>{
 const malformedOther={id:2,source:'ana-slo',date:'2026-01-01',shop:'B',machines:[[1,2,3]]};
 const input={state:{externalDays:[packedDay,malformedOther]}};
 const days=extractExternalDays(input,{store:'A'});
 assert.equal(days.length,1);
 assert.equal(days[0].shop,'A');
 assert.equal(days[0].machines[0].tableNo,'101');
 assert.throws(()=>extractExternalDays(input,{store:'C'}),/store C|history/i);
});

test('input adapter rejects malformed or missing external history',()=>{
 assert.throws(()=>extractExternalDays({}),/externalDays|history/i);
 assert.throws(()=>extractExternalDays({state:{externalDays:[{...packedDay,machines:[[1,2,3]]}]}}),/packed machine/i);
});
