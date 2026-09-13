import test from 'node:test';
import assert from 'node:assert/strict';
import {__test as coordinatorInternals} from '../src/coordinator.mjs';

test('Coordinator routes SHADOW_PREDICT to the real shadow worker',()=>{
  const worker=coordinatorInternals.defaultWorkerPathForJob({type:'SHADOW_PREDICT'});
  assert.match(String(worker),/\/jobs\/shadow-predict\.mjs$/);
});

test('SHADOW_PREDICT shares the single low-priority research lane',()=>{
  assert.equal(coordinatorInternals.RESEARCH_JOB_TYPES.has('SHADOW_PREDICT'),true);
});
