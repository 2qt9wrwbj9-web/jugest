import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JUGEST_RELEASE_VERSION,__test as releaseTest} from '../../vps-release-version.mjs';
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

test('release overlay updates the visible version inside the JUGEST Shadow DOM',()=>{
  const shadowVersion={textContent:'5.1.2'};
  const previousDocument=globalThis.document;
  globalThis.document={
    title:'JUGEST v5.1.2',
    querySelectorAll(selector){
      if(selector==='.brand small')return [];
      if(selector==='jugest-app')return [{shadowRoot:{querySelectorAll:s=>s==='.brand small'?[shadowVersion]:[]}}];
      return [];
    }
  };
  try{
    releaseTest.applyReleaseVersion();
    assert.equal(globalThis.document.title,'JUGEST v6.0.0');
    assert.equal(shadowVersion.textContent,'6.0.0');
  }finally{
    if(previousDocument===undefined)delete globalThis.document;
    else globalThis.document=previousDocument;
  }
});
