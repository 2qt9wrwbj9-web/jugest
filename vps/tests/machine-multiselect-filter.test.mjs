import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as auditUtils from '../../vps-ui-audit-utils.mjs';

const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));

function requireFn(name){
  assert.equal(typeof auditUtils[name],'function',`${name} must be exported`);
  return auditUtils[name];
}

test('machine filter defaults to all available machines and restores only valid saved machines',()=>{
  const normalize=requireFn('normalizeMachineSelection');
  assert.deepEqual(normalize(['a','b','c'],null),['a','b','c']);
  assert.deepEqual(normalize(['a','b','c'],['b','x']),['b']);
  assert.deepEqual(normalize(['a','b','c'],[]),[]);
});

test('machine filter storage keys are separated by screen and store',()=>{
  const key=requireFn('machineFilterStorageKey');
  assert.notEqual(key('data','store-a'),key('trend','store-a'));
  assert.notEqual(key('data','store-a'),key('data','store-b'));
  assert.match(key('data','store-a'),/data/);
  assert.match(key('data','store-a'),/store-a/);
});

test('machine filter applies selected machine ids without changing source order',()=>{
  const apply=requireFn('filterMachineSummaries');
  const rows=[{machine:'a'},{machine:'b'},{machine:'c'}];
  assert.deepEqual(apply(rows,['c','a']).map(row=>row.machine),['a','c']);
  assert.deepEqual(apply(rows,[]),[]);
});

test('store audit addon contains separate multi-select controls for data and trend sections',()=>{
  const source=readFileSync(resolve(ROOT,'vps-ui-audit-store.mjs'),'utf8');
  assert.ok(source.includes('data-vps-machine-filter="${esc(scope)}"'));
  assert.ok(source.includes("machineFilterHtml('data',availableSummaries,selected)"));
  assert.ok(source.includes("machineFilterHtml('trend',allMachines,selected)"));
  assert.match(source,/全選択/);
  assert.match(source,/全解除/);
});
