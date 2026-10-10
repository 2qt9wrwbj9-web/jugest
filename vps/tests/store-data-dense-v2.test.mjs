import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const v2=readFileSync(new URL('../../vps-ui-store-v2.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../../vps-ui-store-v2.css',import.meta.url),'utf8');
const original=readFileSync(new URL('../../vps-ui-audit-store.mjs',import.meta.url),'utf8');

test('dense upper panel is limited to slot-store data screen, not pachinko and other tabs',()=>{
 for(const selector of [
  '.sv2-workspace.store-data-screen .sv2-tabs',
  '.sv2-workspace.store-data-screen .vps-audit-summary>.vps-audit-kpis',
  '.sv2-workspace.store-data-screen .vps-matrix-tools.sv2-tools-unified',
  '.sv2-workspace.store-data-screen .sv2-tools-unified .vps-machine-filter-panel',
  '.sv2-workspace.store-data-screen .vps-setting-legend'
 ])assert.ok(css.includes(selector),selector);
 assert.ok(!css.includes('.pachinko-data-screen'), 'new rules must not modify PIA dedicated panels');
 assert.ok(css.includes('grid-template-columns:repeat(5,minmax(0,1fr))!important'),'5 KPIs stay on one row');
 assert.ok(css.includes('grid-template-columns:minmax(0,1fr) auto auto'),'search + filter + density share a row');
});
test('dense toolbar preserves selected value while shortening only date option labels',()=>{
 const body=v2.slice(v2.indexOf('function compactDataScreen('),v2.indexOf('function compact('));
 assert.ok(body.includes("date.setAttribute('aria-label','営業日')"));
 assert.ok(body.includes('option.textContent=m[1]'), 'visual label only');
 assert.ok(!body.includes('option.value='),'underlying YYYY-MM-DD selection remains unchanged');
 assert.ok(body.includes("toolbar.dataset.sv2DataToolbar='1'"),'idempotent header prep');
 assert.ok(body.includes("summary.dataset.sv2Compact='1'"),'idempotent matrix prep');
});
test('visual densification retains existing matrix thresholds and heavy computation hooks',()=>{
 for(const term of [
  'settingHeatColor(ok?es:null)','settingHeatTextColor(ok?es:null)',
  'data-vps-matrix-period','data-vps-matrix-search','data-vps-machine-filter',
  'data-vps-matrix-density','data-vps-matrix-cell',
  'scrollLeft=matrixScroll.left','scrollTop=matrixScroll.top'
 ]) assert.ok(original.includes(term),term);
 assert.ok(!v2.includes('ensureExternalJudged'),'layout must not trigger heavy judgement');
 assert.ok(v2.includes('density.before(filter)'),'existing filter is moved rather than recreated');
 assert.ok(v2.includes('compactDataScreen(screen)'), 'reapply after historical matrix recomputations');
 assert.ok(v2.includes('controls.classList.add(\'sv2-tools-unified\')'));
});
test('search count stays hidden until actively filtering; no page-wide content deletion',()=>{
 const body=v2.slice(v2.indexOf('function compactDataScreen('),v2.indexOf('function compact('));
 assert.ok(body.includes("counts.hidden=!String(search?.value||'').trim()"));
 assert.ok(v2.includes("root.addEventListener('input'"));
 assert.ok(v2.includes("event.target?.matches?.('[data-vps-matrix-search]')"));
 assert.ok(!body.includes('innerHTML='),'compaction moves existing DOM nodes and changes text only');
});
