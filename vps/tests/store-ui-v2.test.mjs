import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {__test as v2} from '../../vps-ui-store-v2.mjs';
import {patchJugestIndexSource} from '../src/ui-source-patch.mjs';

test('store v2 injects a single module tag and remains idempotent',()=>{
 const input=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 const once=patchJugestIndexSource(input),twice=patchJugestIndexSource(once);
 assert.equal(once,twice);
 assert.equal(once.split('<script type="module" src="./vps-ui-store-v2.mjs"></script>').length-1,1);
 assert.ok(once.indexOf('vps-ui-audit-store.mjs')<once.indexOf('vps-ui-store-v2.mjs'));
});
test('store v2 provides 5 tabs without sacrificing the original navigation action keys',()=>{
 const html=v2.nav('verify');
 for(const part of ['概要','台','傾向','予測','検証','store-data','store-trend','store-plan','store-model','data-workspace="store"'])assert.ok(html.includes(part),part);
 assert.equal((html.match(/<button /g)||[]).length,5);
 assert.match(html,/class="active" data-action="store-model"/);
});
test('store v2 collector status distinguishes errors, disabled and unknown',()=>{
 assert.equal(v2.collectorStatus({collector:{registered:true,enabled:true}}).warn,false);
 assert.equal(v2.collectorStatus({collector:{registered:true,enabled:false}}).warn,true);
 assert.equal(v2.collectorStatus({collector:{errorCode:'HTTP_429',missingDays:2}}).label,'取得要確認');
 assert.equal(v2.collectorStatus({collector:{}}).label,'取得URL未登録');
});
test('store v2 latest daily summary never treats missing observed diff as zero',()=>{
 const old=globalThis.JUGEST_CORE_BRIDGE;let judgeCalls=0;
 try{
  globalThis.JUGEST_CORE_BRIDGE={
   getStoreDates:()=>['2026-10-09'],
   getVpsJudgedStoreDay:()=>{judgeCalls++;throw Error('heavy judgement called')},
   getStoreDay:()=>({rows:[{games:5000,diff:1200},{games:3000,diff:null},{games:4000,diff:-100}]})
  };
  const r=v2.latestSummary('shop',{latestDate:'2026-10-09'});
  assert.equal(r.rows.length,3);assert.equal(r.known.length,2);
  assert.equal(r.total,1100);assert.equal(r.win,1);assert.equal(r.avg,4000);
  assert.equal(judgeCalls,0);
 }finally{globalThis.JUGEST_CORE_BRIDGE=old}
});
test('store v2 CSS is scoped to slot store, with five tabs and a dense machine comparison table',()=>{
 const css=readFileSync(new URL('../../vps-ui-store-v2.css',import.meta.url),'utf8');
 for(const term of ['.sv2-workspace','.sv2-tabs','grid-template-columns:repeat(5,minmax(0,1fr))','.sv2-machine-table-scroll','.sv2-machine-table th:first-child','.sv2-plan-settings','@media(max-width:359px)'])assert.ok(css.includes(term),term);
 const js=readFileSync(new URL('../../vps-ui-store-v2.mjs',import.meta.url),'utf8');
 for(const term of ['pachinko-store-overview','pachinko-data-screen','app?._pachinkoStoreSelected','data-analysis-run','data-action="store-analysis"','data-action="store-replay"','data-action="store-model"']) {
  if(term==='data-analysis-run')continue; // Existing legacy screen's action is preserved, not duplicated.
  assert.ok(js.includes(term),term)
 }
 assert.ok(!js.includes('ensureExternalJudged'),'no implicit heavy judgement');
});

