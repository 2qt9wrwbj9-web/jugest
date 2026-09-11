import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {patchJugestIndexSource} from '../src/ui-source-patch.mjs';

test('current production index accepts the VPS UI patch without changing the checked-in index',async()=>{
  const source=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  const patched=patchJugestIndexSource(source);
  assert.notEqual(patched,source);
  assert.match(patched,/getVpsBackfillDays:\(\)=>JSON\.parse\(JSON\.stringify\(externalDays\)\)/);
  assert.match(patched,/vps-ui-enhancements\.mjs/);
  assert.equal((patched.match(/vps-ui-enhancements\.mjs/g)||[]).length,1);
});
