import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const source=readFileSync(resolve(ROOT,'vps-ui-enhancements.mjs'),'utf8');

test('Today Plan uses PRE store-read as primary when the requested target is available',()=>{
  assert.match(source,/data-vps-pre-plan/);
  assert.match(source,/data-plan-run/);
  assert.match(source,/getStoreRead\(shop\)/);
  assert.match(source,/storeRead\.targetDate===targetDate/);
  assert.match(source,/engine:'pre_research'/);
  assert.match(source,/PRE版/);
});

test('Today Plan falls through to the untouched current JUGEST path when PRE is unavailable',()=>{
  assert.match(source,/planBypassOnce/);
  assert.match(source,/stopImmediatePropagation/);
  assert.match(source,/data-vps-plan-fallback/);
  assert.match(source,/現行版で表示中/);
  assert.match(source,/currentButton\s*=\s*restorePlanButton\(\)/);
  assert.match(source,/planBypassOnce=true;currentButton\.click\(\)/);
});

test('PRE lookup keeps the current Today Plan button usable and suppresses duplicate PRE requests',()=>{
  assert.match(source,/data-vps-pre-busy/);
  assert.match(source,/if\(prePlanState\?\.busy\)\{event\.preventDefault\(\);event\.stopImmediatePropagation\(\);return\}/);
  assert.doesNotMatch(source,/prePlanState\?\.busy[\s\S]{0,180}button\.disabled=true/);
  assert.match(source,/function restorePlanButton\(\)/);
});

test('legacy mode replaces only its data source with the VPS canonical legacy endpoint',()=>{
  assert.match(source,/installVpsLegacyPlanRunner/);
  assert.match(source,/getLegacyPlan\(shop,date,options\|\|\{\}\)/);
  assert.match(source,/vps_store_not_found/);
  assert.match(source,/_vpsOriginalRunLegacyTodayPlan/);
});

test('legacy mode bypasses the PRE-only prediction card and click interception',()=>{
  const ui=source.slice(source.indexOf('function ensurePrePlanUi()'),source.indexOf('async function runPrePrimaryPlan'));
  const click=source.slice(source.indexOf('function onClick(event)'),source.indexOf('function attach(candidate)'));
  assert.match(source,/function currentPlanMode\(workspace\)/);
  assert.match(source,/function shouldInterceptPlanRun\(workspace\)/);
  assert.match(ui,/currentPlanMode\(workspace\)==='legacy'[\s\S]*?return/);
  assert.match(click,/shouldInterceptPlanRun\(workspace\)[\s\S]*?return/);
  assert.match(source,/if\(currentPlanMode\(workspace\)==='legacy'\)\{restorePlanButton\(\);return\}/);
});
