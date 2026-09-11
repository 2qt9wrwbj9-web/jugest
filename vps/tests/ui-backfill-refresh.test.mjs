import test from 'node:test';
import assert from 'node:assert/strict';

test('backfill card is invalidated when JUGEST core state finishes updating', async()=>{
  const saved={
    document:globalThis.document,
    MutationObserver:globalThis.MutationObserver,
    requestAnimationFrame:globalThis.requestAnimationFrame,
    bridge:globalThis.JUGEST_CORE_BRIDGE
  };
  let subscriber=null;
  let removed=0;
  const card={remove(){removed++}};
  const root={
    addEventListener(){},
    append(){},
    querySelector(selector){
      if(selector==='style[data-vps-ui-enhancements]')return {};
      if(selector==='[data-vps-backfill-card]')return card;
      return null;
    }
  };
  const candidate={shadowRoot:root};
  try{
    globalThis.document={
      querySelector(selector){return selector==='jugest-app'?candidate:null},
      createElement(){return {dataset:{},append(){},set textContent(_value){}}}
    };
    globalThis.MutationObserver=class{observe(){} disconnect(){}};
    globalThis.requestAnimationFrame=(callback)=>{callback();return 1};
    globalThis.JUGEST_CORE_BRIDGE={
      subscribe(listener){subscriber=listener;return ()=>{}}
    };

    await import(`../../vps-ui-enhancements.mjs?backfill-refresh-test=${Date.now()}`);
    assert.equal(typeof subscriber,'function','VPS UI must subscribe to JUGEST core state changes');
    subscriber();
    assert.equal(removed,1,'a core state update must invalidate the stale backfill card so the loaded day count is re-rendered');
  }finally{
    globalThis.document=saved.document;
    globalThis.MutationObserver=saved.MutationObserver;
    globalThis.requestAnimationFrame=saved.requestAnimationFrame;
    globalThis.JUGEST_CORE_BRIDGE=saved.bridge;
  }
});
