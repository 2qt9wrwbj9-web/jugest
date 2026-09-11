import fs from 'node:fs';
import assert from 'node:assert/strict';
import {patchJugestIndexSource} from '../src/ui-source-patch.mjs';

const index=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../../vps-store-reset.mjs',import.meta.url),'utf8');
const patched=patchJugestIndexSource(index);

assert.match(patched,/resetStoreAcquiredData:\(name\)=>vpsResetStoreAcquiredData\(name\)/,'patched bridge must expose the local acquired-data reset');
assert.match(patched,/async function vpsResetStoreAcquiredData\(name\)/,'patched index must contain the reset implementation');
assert.match(patched,/vps-store-reset\.mjs/,'patched index must load the store reset module');
for(const token of ['externalDays=nextDays','modelForecasts=nextForecasts','storeAnalysisHistoryIndex=nextHistory','externalDbSet(externalDays)','storeAnalysisSaveIndex()','autoSaveState()']){
  assert.ok(patched.includes(token),`reset implementation missing ${token}`);
}
assert.ok(!patched.includes('sessions=sessions.filter'), 'Day-1 reset must preserve play-session records');
assert.ok(!patched.includes('shops=shops.filter'), 'Day-1 reset must preserve the store master');

for(const token of ['data-vps-store-reset','今日から初期化','resetStoreAcquiredData','deleteCollectorStore','saveCollectorStore','setCollectorEnabled']){
  assert.ok(ui.includes(token),`VPS UI reset flow missing ${token}`);
}
assert.match(ui,/startDate:today/,'Collector re-registration must restart from today');
assert.match(ui,/稼働記録・店舗マスター/,'destructive confirmation must explain preserved records');

console.log('VPS store Day-1 reset static PASS');
