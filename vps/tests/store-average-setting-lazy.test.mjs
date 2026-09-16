import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as auditUtils from '../../vps-ui-audit-utils.mjs';
import {patchJugestIndexSource} from '../src/ui-source-patch.mjs';

const fixture=`<!doctype html><html><body><script>\nwindow.JUGEST_CORE_BRIDGE=window.JUGESTCoreV510.createBridge({\n getSummary:()=>v510CoreSummary(),\n getCollectorKey:()=>v510GetCollectorKey(),\n unlinkCollector:()=>v510UnlinkCollector()\n});\n</script></body></html>`;

test('missing expected setting is displayed as unavailable instead of 0.00',()=>{
  assert.equal(typeof auditUtils.formatExpectedSetting,'function');
  assert.equal(auditUtils.formatExpectedSetting(null),'—');
  assert.equal(auditUtils.formatExpectedSetting(undefined),'—');
  assert.equal(auditUtils.formatExpectedSetting(4.25),'4.25');
});

test('VPS bridge exposes a single-store-day lazy judgement hook',()=>{
  const patched=patchJugestIndexSource(fixture);
  assert.match(patched,/getVpsJudgedStoreDay:/);
  assert.match(patched,/ensureExternalJudgedSync\(\[day\],name\)/);
  assert.match(patched,/return v510StoreDay\(name,date\)/);
});

test('store data requests judged rows but trend remains lazy',async()=>{
  const src=await readFile(new URL('../../vps-ui-audit-store.mjs',import.meta.url),'utf8');
  assert.match(src,/getVpsJudgedStoreDay/);
  assert.match(src,/reconcileStoreData[\s\S]*storeRows\(shop,date,true\)/);
  const trend=src.match(/function trendRows\([\s\S]*?return \{period,dates,rows\};\n\}/)?.[0]||'';
  assert.ok(trend,'trendRows source must exist');
  assert.doesNotMatch(trend,/getVpsJudgedStoreDay/);
  assert.doesNotMatch(trend,/storeRows\(shop,date,true\)/);
});
