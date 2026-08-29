import { readFile, writeFile } from 'node:fs/promises';

const paths = ['index.html','public/index.html'];

function once(src, oldText, newText, label) {
  const n = src.split(oldText).length - 1;
  if (n !== 1) throw new Error(`${label}: expected 1 match, got ${n}`);
  return src.replace(oldText, newText);
}

function patchHtml(src) {
  const changelog = `v4.8.0 data-page setting summary:
- Expanded ジャグラー・ハナハナデータ without changing externalJudge(), machine probability tables, or posterior q. Existing posterior mean is now labeled 期待設定.
- Added 推定設定 as the MAP setting(s) from each table posterior. Exact ties remain ties (for example 2/3) instead of being forced to one setting.
- Added 平均設定 as the one-table-one-vote mean of each table's MAP setting; tied MAP settings contribute their mean.
- Added 推定設定配分 as the one-table-one-vote distribution of MAP settings 1–6; exact ties split one table's vote equally across tied settings.
- Daily overview, machine cards, machine drill-down metadata and table rows expose the new summaries. New King V keeps setting 6 unsupported exactly as in the existing posterior.

`;
  src = once(src, '<!--\n', '<!--\n' + changelog, 'changelog');
  src = once(src, '<title>ジャグラー設定判別 v4.7.9</title>', '<title>ジャグラー設定判別 v4.8.0</title>', 'title');
  src = once(src, '>v4.7.9</span>', '>v4.8.0</span>', 'visible version');
  src = once(src, 'appVersion:"4.7.9"', 'appVersion:"4.8.0"', 'backup version');

  const oldMetrics = `function jdataMetrics(rows){rows=Array.isArray(rows)?rows:[];const n=rows.length,g=rows.reduce((a,r)=>a+(+r.games||0),0),diffRows=rows.filter(r=>r.diff!=null&&Number.isFinite(+r.diff)),esRows=rows.filter(r=>Number.isFinite(+r.expectedSetting)),p4Rows=rows.filter(r=>Number.isFinite(+r.p4));return{n,avgG:n?g/n:NaN,avgDiff:diffRows.length?diffRows.reduce((a,r)=>a+(+r.diff||0),0)/diffRows.length:NaN,expectedSetting:esRows.length?esRows.reduce((a,r)=>a+(+r.expectedSetting),0)/esRows.length:NaN,positiveRate:diffRows.length?diffRows.filter(r=>(+r.diff)>0).length/diffRows.length:NaN,p4:p4Rows.length?p4Rows.reduce((a,r)=>a+(+r.p4),0)/p4Rows.length:NaN,diffN:diffRows.length,esN:esRows.length};}`;
  const newMetrics = `function jdataMapCandidates(q){if(!Array.isArray(q)||q.length<6)return[];let z=q.slice(0,6).map(x=>Number.isFinite(+x)?+x:-Infinity),mx=Math.max(...z);if(!Number.isFinite(mx))return[];let eps=1e-12;return z.map((v,i)=>Math.abs(v-mx)<=eps?i+1:0).filter(Boolean)}
function jdataMapLabel(q){let a=jdataMapCandidates(q);return a.length?a.join('/'):'—'}
function jdataDistLabel(dist){return Array.isArray(dist)?dist.map((v,i)=>\`設定\${i+1} \${jdataFmtPct(v)}\`).join(' / '):'—'}
function jdataMetrics(rows){rows=Array.isArray(rows)?rows:[];const n=rows.length,g=rows.reduce((a,r)=>a+(+r.games||0),0),diffRows=rows.filter(r=>r.diff!=null&&Number.isFinite(+r.diff)),esRows=rows.filter(r=>Number.isFinite(+r.expectedSetting)),p4Rows=rows.filter(r=>Number.isFinite(+r.p4)),dist=[0,0,0,0,0,0],mapVals=[];let mapN=0;for(const r of rows){let a=jdataMapCandidates(r.q);if(!a.length)continue;mapN++;let w=1/a.length;for(const s of a)dist[s-1]+=w;mapVals.push(a.reduce((x,y)=>x+y,0)/a.length)}return{n,avgG:n?g/n:NaN,avgDiff:diffRows.length?diffRows.reduce((a,r)=>a+(+r.diff||0),0)/diffRows.length:NaN,expectedSetting:esRows.length?esRows.reduce((a,r)=>a+(+r.expectedSetting),0)/esRows.length:NaN,mapAverage:mapVals.length?mapVals.reduce((a,b)=>a+b,0)/mapVals.length:NaN,mapDist:mapN?dist.map(x=>x/mapN):null,positiveRate:diffRows.length?diffRows.filter(r=>(+r.diff)>0).length/diffRows.length:NaN,p4:p4Rows.length?p4Rows.reduce((a,r)=>a+(+r.p4),0)/p4Rows.length:NaN,diffN:diffRows.length,esN:esRows.length,mapN};}`;
  src = once(src, oldMetrics, newMetrics, 'jdata metrics');

  const oldCard = `function jdataMachineCard(k,rows){const m=jdataMetrics(rows),on=jdataMachineFilter===k?' on':'';return \`<button type="button" class="jdata-machine\${on}" data-jdata-machine="\${k}"><div class="jdata-machine-head"><b>\${escapeHtml(analysisMachineName(k))}</b><span>\${m.n}台</span></div><div class="jdata-machine-metrics"><div><small>平均差枚</small><strong>\${jdataFmtCoins(m.avgDiff)}</strong></div><div><small>平均G</small><strong>\${Number.isFinite(m.avgG)?Math.round(m.avgG).toLocaleString('ja-JP')+'G':'—'}</strong></div><div><small>平均設定</small><strong>\${fmtSetting(m.expectedSetting)}</strong></div><div><small>プラス台率</small><strong>\${jdataFmtPct(m.positiveRate)}</strong></div><div><small>設定4以上</small><strong>\${jdataFmtPct(m.p4)}</strong></div></div></button>\`}`;
  const newCard = `function jdataMachineCard(k,rows){const m=jdataMetrics(rows),on=jdataMachineFilter===k?' on':'';return \`<button type="button" class="jdata-machine\${on}" data-jdata-machine="\${k}"><div class="jdata-machine-head"><b>\${escapeHtml(analysisMachineName(k))}</b><span>\${m.n}台</span></div><div class="jdata-machine-metrics"><div><small>平均差枚</small><strong>\${jdataFmtCoins(m.avgDiff)}</strong></div><div><small>平均G</small><strong>\${Number.isFinite(m.avgG)?Math.round(m.avgG).toLocaleString('ja-JP')+'G':'—'}</strong></div><div><small>期待設定</small><strong>\${fmtSetting(m.expectedSetting)}</strong></div><div><small>平均設定</small><strong>\${fmtSetting(m.mapAverage)}</strong></div><div><small>プラス台率</small><strong>\${jdataFmtPct(m.positiveRate)}</strong></div><div><small>設定4以上</small><strong>\${jdataFmtPct(m.p4)}</strong></div></div><div class="jdata-note">推定設定配分：\${jdataDistLabel(m.mapDist)}</div></button>\`}`;
  src = once(src, oldCard, newCard, 'machine card');

  src = once(src,
    '<small>推定平均設定</small><b>${fmtSetting(m.expectedSetting)}</b>',
    '<small>期待設定</small><b>${fmtSetting(m.expectedSetting)}</b>',
    'overview expected label');

  src = once(src,
    '<div class="jdata-sub-kpis"><div class="jdata-kpi"><small>プラス台率</small><b>${jdataFmtPct(m.positiveRate)}</b></div><div class="jdata-kpi"><small>設定4以上 推定割合</small><b>${jdataFmtPct(m.p4)}</b></div></div><div class="jdata-note">推定平均設定と設定4以上割合は各台の設定分布を1台ずつ均等に平均。ハナハナは機種別のBIG/REG/差枚→推定ベル式を使用し、ニューキングVはV=5として平均設定を計算する。</div>',
    '<div class="jdata-sub-kpis"><div class="jdata-kpi gold"><small>平均設定</small><b>${fmtSetting(m.mapAverage)}</b></div><div class="jdata-kpi"><small>プラス台率</small><b>${jdataFmtPct(m.positiveRate)}</b></div><div class="jdata-kpi"><small>設定4以上 推定割合</small><b>${jdataFmtPct(m.p4)}</b></div></div><div class="jdata-note"><b>推定設定配分</b><br>${jdataDistLabel(m.mapDist)}</div><div class="jdata-note">期待設定と設定4以上割合は各台の設定分布を1台ずつ均等に平均。平均設定＝各台の最有力設定（MAP）を1台1票で平均。推定設定配分も1台1票で、最有力が同率なら候補設定へ等分する。ハナハナは既存のBIG/REG/差枚→推定ベル式をそのまま使用し、ニューキングVは設定6を候補にしない。</div>',
    'overview map summary');

  src = once(src,
    '<thead><tr><th>台番</th><th>G</th><th>BB</th><th>RB</th><th>差枚</th><th>推定設定</th><th>4以上</th></tr></thead>',
    '<thead><tr><th>台番</th><th>G</th><th>BB</th><th>RB</th><th>差枚</th><th>期待設定</th><th>推定設定</th><th>4以上</th></tr></thead>',
    'table header');

  src = once(src,
    "$('JDATA_TABLE_META').textContent=`${mr.length}台 / 平均差枚 ${jdataFmtCoins(mm.avgDiff)} / 平均設定 ${fmtSetting(mm.expectedSetting)}`;",
    "$('JDATA_TABLE_META').textContent=`${mr.length}台 / 平均差枚 ${jdataFmtCoins(mm.avgDiff)} / 期待設定 ${fmtSetting(mm.expectedSetting)} / 平均設定 ${fmtSetting(mm.mapAverage)} / 推定配分 ${jdataDistLabel(mm.mapDist)}`;",
    'table meta');

  src = once(src,
    '<td>${jdataFmtCoins(r.diff)}</td><td>${fmtSetting(r.expectedSetting)}</td><td>${jdataFmtPct(r.p4)}</td></tr>',
    '<td>${jdataFmtCoins(r.diff)}</td><td>${fmtSetting(r.expectedSetting)}</td><td>${jdataMapLabel(r.q)}</td><td>${jdataFmtPct(r.p4)}</td></tr>',
    'table row');

  return src;
}

for (const p of paths) {
  const src = await readFile(p,'utf8');
  await writeFile(p, patchHtml(src));
}

const pkgPath='package.json';
const pkg=JSON.parse(await readFile(pkgPath,'utf8'));
pkg.name='juggler-hanahana-tool-v4800';
pkg.version='4.8.0';
for(const k of ['test','check']){
  if(!pkg.scripts[k].includes('tests/v480-jdata-setting-summary.mjs')) pkg.scripts[k] += ' && node tests/v480-jdata-setting-summary.mjs';
}
await writeFile(pkgPath, JSON.stringify(pkg,null,2)+'\n');

const test=`import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root=await readFile('index.html','utf8');
const pub=await readFile('public/index.html','utf8');
assert.equal(root,pub,'root/public index must remain byte-identical');
for(const s of [
  'v4.8.0 data-page setting summary',
  'function jdataMapCandidates(q)',
  'function jdataMapLabel(q)',
  'function jdataDistLabel(dist)',
  'mapAverage:',
  'mapDist:',
  '<small>期待設定</small>',
  '<small>平均設定</small>',
  '<b>推定設定配分</b>',
  '<th>期待設定</th><th>推定設定</th>',
  "jdataMapLabel(r.q)"
]) assert.ok(root.includes(s), 'missing '+s);
assert.ok(root.includes('appVersion:\"4.8.0\"'));
assert.ok(root.includes('>v4.8.0</span>'));
assert.ok(root.includes('ニューキングVは設定6を候補にしない'));
assert.ok(root.includes('let eps=1e-12'));
assert.ok(!root.includes('<small>推定平均設定</small>'));
console.log('v4.8.0 jdata setting summary regression passed');
`;
await writeFile('tests/v480-jdata-setting-summary.mjs',test);
console.log('v4.8.0 data-page patch applied');
