import fs from 'node:fs';import assert from 'node:assert/strict';
const root=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const launcher=fs.readFileSync(new URL('../ana-launcher.js',import.meta.url),'utf8');
for(const s of [root]){
 assert.match(s,/v4\.5\.3/);assert.match(s,/ジャグラー・ハナハナ設定判別/);
 assert.match(s,/id="HANA_LIVE_APP"/);assert.match(s,/id="HANA_REV_APP"/);
 assert.match(s,/data-family="juggler"/);assert.match(s,/data-family="hanahana"/);
 assert.match(s,/ALL_MACHINE_KEYS/);assert.match(s,/HANA_MACHINE_KEYS/);
 assert.match(s,/window\.HanaAppBridge/);assert.match(s,/getMoveCandidates/);
 assert.match(s,/v4MachineSupportQ/);
}
assert.match(launcher,/const VERSION='4\.8\.6'/);assert.match(launcher,/const PARSER_VERSION=4500/);
for(const k of ['newkingv','houou','dragon','star','king']) assert.ok(launcher.includes(`['${k}'`),'launcher missing '+k);
console.log('hana integration: ok; full v4.5.3 wiring present');
