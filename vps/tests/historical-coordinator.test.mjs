import test from 'node:test';
import assert from 'node:assert/strict';
import {__test} from '../src/coordinator.mjs';

test('Coordinator routes HISTORICAL_COMPARE to real worker and research lane',()=>{
  assert.match(String(__test.defaultWorkerPathForJob({type:'HISTORICAL_COMPARE'})),/historical-compare\.mjs/);
  assert.equal(__test.RESEARCH_JOB_TYPES.has('HISTORICAL_COMPARE'),true);
});
