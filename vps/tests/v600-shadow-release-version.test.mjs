import test from 'node:test';
import assert from 'node:assert/strict';

import {JUGEST_RELEASE_VERSION,__test} from '../../vps-release-version.mjs';

function fakeShell(){
  const badge={textContent:'5.1.2'};
  const shadowRoot={querySelectorAll(selector){return selector==='.brand small'?[badge]:[];}};
  const host={shadowRoot};
  let fullScans=0;
  const document={
    title:'JUGEST v5.1.2',
    documentElement:{},
    getElementById(id){return id==='JUGEST_APP'?host:null;},
    querySelector(selector){return selector==='jugest-app'||selector==='#JUGEST_APP'?host:null;},
    querySelectorAll(selector){if(selector==='*'){fullScans++;return [host];}return [];}
  };
  return {badge,shadowRoot,host,document,getFullScans:()=>fullScans};
}

test('release overlay updates version badge inside the open JUGEST App Shell shadow root',()=>{
  const shell=fakeShell(),originalDocument=globalThis.document;
  globalThis.document=shell.document;
  try{
    __test.applyReleaseVersion();
    assert.equal(JUGEST_RELEASE_VERSION,'6.0.2');
    assert.equal(globalThis.document.title,'JUGEST v6.0.2');
    assert.equal(shell.badge.textContent,'6.0.2');
  }finally{
    if(originalDocument===undefined)delete globalThis.document;
    else globalThis.document=originalDocument;
  }
});

test('release overlay observes the App Shell shadow root and restores v6 after a rerender',()=>{
  assert.equal(typeof __test.installReleaseVersionObservers,'function');
  const shell=fakeShell(),callbacks=new Map(),originalDocument=globalThis.document;
  class FakeObserver{
    constructor(callback){this.callback=callback;}
    observe(target){callbacks.set(target,this.callback);}
  }
  globalThis.document=shell.document;
  try{
    __test.installReleaseVersionObservers(FakeObserver,new WeakSet());
    assert.equal(shell.badge.textContent,'6.0.2');
    assert.equal(callbacks.has(shell.shadowRoot),true,'open shadow root must be observed');
    shell.badge.textContent='5.1.2';
    callbacks.get(shell.shadowRoot)([]);
    assert.equal(shell.badge.textContent,'6.0.2');
  }finally{
    if(originalDocument===undefined)delete globalThis.document;
    else globalThis.document=originalDocument;
  }
});

test('release overlay does not observe or rescan the whole document once App Shell exists',()=>{
  const shell=fakeShell(),callbacks=new Map(),originalDocument=globalThis.document;
  class FakeObserver{
    constructor(callback){this.callback=callback;}
    observe(target){callbacks.set(target,this.callback);}
  }
  globalThis.document=shell.document;
  try{
    __test.installReleaseVersionObservers(FakeObserver,new WeakSet());
    assert.equal(callbacks.has(shell.document.documentElement),false,'document-wide mutation observer can block navigation renders');
    const scansBefore=shell.getFullScans();
    shell.badge.textContent='5.1.2';
    callbacks.get(shell.shadowRoot)([]);
    assert.equal(shell.badge.textContent,'6.0.2');
    assert.equal(shell.getFullScans(),scansBefore,'shadow rerender must not trigger a full document scan');
  }finally{
    if(originalDocument===undefined)delete globalThis.document;
    else globalThis.document=originalDocument;
  }
});
