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
  assert.match(patched,/function v510ResolveRecordShop\(cx\)/);
  assert.match(patched,/for\(const row of v510KnownStoreRows\(\)\)ensureShopInMaster\(row\.name,\{save:false\}\)/);
  assert.doesNotMatch(patched,/shopId=cx\.shopId\|\|shops\[0\]\?\.id\|\|""/);
  assert.match(patched,/let sh=ensureShopInMaster\(name,\{save:false\}\);[\s\S]*v4Context\.shopId=String\(sh\?\.id\|\|""\)/);
});