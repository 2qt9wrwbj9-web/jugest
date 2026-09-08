import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  createShadowProfile,validateShadowProfile,readShadowProfiles,writeShadowProfiles
} from '../research/axis-auto-selector/profile.mjs';

const axisDefs=[
  Object.freeze({id:'practical-v1',version:1,approved:true}),
  Object.freeze({id:'model-v1',version:1,approved:true}),
  Object.freeze({id:'strict-v1',version:1,approved:true}),
  Object.freeze({id:'calendar-v1',version:1,approved:false})
];
const registry=Object.freeze({
  get:id=>axisDefs.find(axis=>axis.id===id),
  has:id=>axisDefs.some(axis=>axis.id===id)
});
const summary={score:.12,mean:.11,sd:.02,winRate:.75,n:6};
const input=()=>({
  store:'A',sourceSignature:'sig-123',trainedThrough:'2026-09-01',trainedAt:'2026-09-08T00:00:00.000Z',
  decision:'SHADOW_CHAMPION',
  selectedAxes:[
    {id:'practical-v1',version:1,weight:.7},
    {id:'model-v1',version:1,weight:.3}
  ],
  train:{...summary,n:12},
  validation:{...summary},
  holdout:{...summary},
  control:{validation:{...summary,score:.08},holdout:{...summary,score:.07}},
  fallback:{validation:{...summary,score:.06},holdout:{...summary,score:.05}},
  evaluationDates:{
    train:Array.from({length:12},(_,i)=>`2026-07-${String(i+1).padStart(2,'0')}`),
    validation:Array.from({length:6},(_,i)=>`2026-07-${String(i+13).padStart(2,'0')}`),
    holdout:Array.from({length:6},(_,i)=>`2026-07-${String(i+19).padStart(2,'0')}`)
  },
  integrity:{futureLeakage:false,allAxesApproved:true,deterministic:true},
  reasons:['all_gates_passed']
});

test('profile schema is immutable, deterministic, and content-addressed',()=>{
  const a=createShadowProfile(input());
  const b=createShadowProfile(input());
  assert.equal(a.schema,'jugest-axis-shadow-v1');
  assert.match(a.id,/^sha256:[0-9a-f]{64}$/);
  assert.equal(a.id,b.id);
  assert.equal(a.store,'A');
  assert.equal(a.decision,'SHADOW_CHAMPION');
  assert.equal(a.selectedAxes.length,2);
  assert.ok(Object.isFrozen(a));
  assert.ok(Object.isFrozen(a.selectedAxes));
  assert.ok(Object.isFrozen(a.selectedAxes[0]));
  assert.ok(Object.isFrozen(a.integrity));
});

test('trainedAt is audit metadata and does not change deterministic profile identity',()=>{
  const a=createShadowProfile(input());
  const changed=input();changed.trainedAt='2026-09-08T01:00:00.000Z';
  const b=createShadowProfile(changed);
  assert.equal(a.id,b.id);
  assert.notEqual(a.trainedAt,b.trainedAt);
});

test('valid profile passes current source and registry validation',()=>{
  const profile=createShadowProfile(input());
  assert.deepEqual(validateShadowProfile(profile,{sourceSignature:'sig-123',registry}),{valid:true,reasons:[]});
});

test('stale source signature invalidates safely',()=>{
  const profile=createShadowProfile(input());
  const out=validateShadowProfile(profile,{sourceSignature:'sig-new',registry});
  assert.equal(out.valid,false);
  assert.ok(out.reasons.includes('stale_source_signature'));
});

test('missing, version-changed, or unapproved selected axes invalidate safely',()=>{
  const profile=createShadowProfile(input());
  const missing=Object.freeze({get:id=>id==='practical-v1'?axisDefs[0]:undefined,has:id=>id==='practical-v1'});
  assert.ok(validateShadowProfile(profile,{sourceSignature:'sig-123',registry:missing}).reasons.includes('axis_missing:model-v1'));
  const versioned=Object.freeze({get:id=>id==='model-v1'?{...axisDefs[1],version:2}:registry.get(id),has:registry.has});
  assert.ok(validateShadowProfile(profile,{sourceSignature:'sig-123',registry:versioned}).reasons.includes('axis_version_mismatch:model-v1'));
  const unapproved=Object.freeze({get:id=>id==='model-v1'?{...axisDefs[1],approved:false}:registry.get(id),has:registry.has});
  assert.ok(validateShadowProfile(profile,{sourceSignature:'sig-123',registry:unapproved}).reasons.includes('axis_unapproved:model-v1'));
});

test('tampered or non-normalized selected weights invalidate, including profile id mismatch',()=>{
  const profile=createShadowProfile(input());
  const tampered=structuredClone(profile);
  tampered.selectedAxes[0].weight=.8;
  const out=validateShadowProfile(tampered,{sourceSignature:'sig-123',registry});
  assert.equal(out.valid,false);
  assert.ok(out.reasons.includes('weights_not_normalized'));
  assert.ok(out.reasons.includes('profile_id_mismatch'));
});

test('CONTROL profile may retain no selected axes but still records explicit reasons',()=>{
  const value=input();
  value.decision='CONTROL';value.selectedAxes=[];value.reasons=['validation_advantage_below_threshold'];
  const profile=createShadowProfile(value);
  assert.equal(profile.selectedAxes.length,0);
  assert.deepEqual(validateShadowProfile(profile,{sourceSignature:'sig-123',registry}),{valid:true,reasons:[]});
});

test('atomic profile persistence round-trips and leaves no temporary file',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'jugest-axis-profile-'));
  const path=join(dir,'profiles.json');
  const profiles=[createShadowProfile(input())];
  await writeShadowProfiles(path,profiles);
  assert.deepEqual(await readShadowProfiles(path),profiles);
  const files=await readdir(dir);
  assert.deepEqual(files,['profiles.json']);
  const raw=await readFile(path,'utf8');
  assert.ok(raw.endsWith('\n'));
});

test('missing profile file reads as an empty isolated profile set',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'jugest-axis-profile-missing-'));
  assert.deepEqual(await readShadowProfiles(join(dir,'none.json')),[]);
});
