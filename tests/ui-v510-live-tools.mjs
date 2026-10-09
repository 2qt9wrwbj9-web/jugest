import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');
const js=fs.readFileSync('public/app-v510.js','utf8');
for(const method of ['getReverseState','getReverseStyles','beginPickup','getPickupState','setPickupCurrentG','setPickupMetric','setPickupMetricEnabled','endPickup','getCompareState','addCompareRow','updateCompareRow','deleteCompareRow','clearCompareRows','getMoveState','selectMoveTarget','calculateMoveCompare']){
  assert.match(html,new RegExp(`${method}\\s*:`),`core bridge must expose ${method}`);
}
for(const fn of ['renderReverseScreen','renderMoveScreen','renderCompareScreen']) assert.match(js,new RegExp(`${fn}\\s*\\(`),`new UI must implement ${fn}`);
assert.match(js,/data-rev-g/);assert.match(js,/data-pickup-current-g/);assert.match(js,/data-move-candidate/);assert.match(js,/data-compare-row/);
assert.doesNotMatch(js,/navigateLegacy\?\.\(['"](?:rev|movecompare|cmp)/,'live tools must not visibly navigate to legacy pages');
assert.doesNotMatch(js,/min-width\s*:\s*(?:5|6|7|8|9)\d\dpx/,'new app JS must not introduce desktop min-width tables');
const css=fs.readFileSync('public/app-v510.css','utf8');
for(const marker of ['rev-compact','rev-odds','rev-probs-band','rev-probs-vals','data-rev-bb-odds','data-rev-rb-odds','data-rev-total-odds','data-rev-range','data-rev-q','data-rev-band']){
 assert.ok((js+css).includes(marker),`reverse compact missing ${marker}`);
}
assert.match(js,/patchReverseResult\(this\.bridge\(\)\?\.getReverseState/,'live input updates must update derived values');
assert.match(js,/getReverseState\?\.\(this\.state\.rev\)/,'live reverse continues to use the existing judgement bridge');
assert.match(css,/\.rev-compact \.rev-input input\{[^}]*min-height:44px/,'mobile inputs must remain usable');
assert.match(css,/\.rev-compact \.rev-probs-band/,'setting distribution has a scoped layout');
assert.doesNotMatch(js,/Math\.random\(/,'reverse display never fabricates odds or probabilities');
// Display-only revamp of live Juggler / HANA screens; keep existing bridge selectors.
const liveCss=fs.readFileSync('public/app-v510.css','utf8');
for(const marker of ['judge-compact','hana-compact','judge-counter-groups','live-compact-band','data-judge-grape','data-hana-live-bell','data-hana-live-water','liveCompactDistribution','livePatchDistribution']){
 assert.ok((js+liveCss).includes(marker),'compact screen marker missing: '+marker);
}
for(const attr of ['data-judge-g','data-judge-metric','data-judge-step','data-judge-enable','data-hana-field','data-hana-count','data-hana-reset','data-record-save-current'])assert.ok(js.includes(attr),'existing control must survive: '+attr);
assert.match(js,/liveCounterRate\(Number\(s.currentG\)-Number\(s.startG\),s.bell\)/,'bell rate uses only own games');
assert.match(js,/liveCounterRate\(s.bigGames,s.bigWater\)/,'BIG watermelon denominator is BIG games');
console.log('v5.1.0 live tools native UI static PASS');
