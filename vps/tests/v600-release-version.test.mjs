import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JUGEST_RELEASE_VERSION} from '../../vps-release-version.mjs';
import {patchJugestIndexSource,__test as patchTest} from '../src/ui-source-patch.mjs';

test('VPS release overlay labels PRE v2 shadow as JUGEST v6.0.0 without changing protected UI source',()=>{
  assert.equal(JUGEST_RELEASE_VERSION,'6.0.0');
  const source=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../../app-v510.js',import.meta.url),'utf8');
  assert.match(source,/<title>JUGEST v5\.1\.2<\/title>/);
  assert.match(app,/const VERSION='5\.1\.2'/);
  const patched=patchJugestIndexSource(source);
  assert.ok(patched.includes(patchTest.RELEASE_VERSION_MODULE_TAG));
  assert.equal(patched.split(patchTest.RELEASE_VERSION_MODULE_TAG).length-1,1);
});
