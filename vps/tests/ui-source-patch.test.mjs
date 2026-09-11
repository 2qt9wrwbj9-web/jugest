import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const patchModule=await import('../src/ui-source-patch.mjs').catch(()=>({}));
const {patchJugestIndexSource}=patchModule;

const fixture=`<!doctype html><html><body><script>\nwindow.JUGEST_CORE_BRIDGE=window.JUGESTCoreV510.createBridge({\n getSummary:()=>v510CoreSummary(),\n getCollectorKey:()=>v510GetCollectorKey(),\n unlinkCollector:()=>v510UnlinkCollector()\n});\n</script></body></html>`;

test('VPS index patch exposes cloned local externalDays and injects enhancement module exactly once',()=>{
  assert.equal(typeof patchJugestIndexSource,'function','patchJugestIndexSource must exist');
  const once=patchJugestIndexSource(fixture);
  assert.match(once,/getVpsBackfillDays:\(\)=>JSON\.parse\(JSON\.stringify\(externalDays\)\)/);
  assert.match(once,/<script type="module" src="\.\/vps-ui-enhancements\.mjs"><\/script>/);
  const twice=patchJugestIndexSource(once);
  assert.equal(twice,once,'source patch must be idempotent');
});

test('VPS index patch fails closed if the expected bridge anchor is missing',()=>{
  assert.equal(typeof patchJugestIndexSource,'function','patchJugestIndexSource must exist');
  assert.throws(()=>patchJugestIndexSource('<html><body>unexpected</body></html>'),/bridge anchor/i);
});

test('VPS UI enhancement source contains settings, chip acknowledgement and authenticated backfill hooks',async()=>{
  const src=await readFile(new URL('../../vps-ui-enhancements.mjs',import.meta.url),'utf8');
  for(const token of [
    'data-vps-settings-gear',
    'Collector連携設定',
    '解析失敗',
    'sessionStorage',
    'getVpsBackfillDays',
    '/api/vps/backfill',
    'jugglerRelayReceiver:v1',
    'このiPhoneの既存データをVPSへ移行',
    'sync-setup'
  ])assert.ok(src.includes(token),`missing UI enhancement token: ${token}`);
});
