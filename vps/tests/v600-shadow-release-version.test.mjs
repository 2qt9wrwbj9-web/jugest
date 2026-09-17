import test from 'node:test';
import assert from 'node:assert/strict';

import {JUGEST_RELEASE_VERSION,__test} from '../../vps-release-version.mjs';

test('release overlay updates version badge inside the open JUGEST App Shell shadow root',()=>{
  const badge={textContent:'5.1.2'};
  const shadowRoot={
    querySelectorAll(selector){return selector==='.brand small'?[badge]:[];}
  };
  const host={shadowRoot};
  const originalDocument=globalThis.document;
  globalThis.document={
    title:'JUGEST v5.1.2',
    querySelectorAll(selector){return selector==='*'?[host]:[];}
  };
  try{
    __test.applyReleaseVersion();
    assert.equal(JUGEST_RELEASE_VERSION,'6.0.0');
    assert.equal(globalThis.document.title,'JUGEST v6.0.0');
    assert.equal(badge.textContent,'6.0.0');
  }finally{
    if(originalDocument===undefined)delete globalThis.document;
    else globalThis.document=originalDocument;
  }
});
