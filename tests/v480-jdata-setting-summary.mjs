import assert from 'node:assert/strict';
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
assert.ok(root.includes('appVersion:"4.8.0"'));
assert.ok(root.includes('>v4.8.0</span>'));
assert.ok(root.includes('ニューキングVは設定6を候補にしない'));
assert.ok(root.includes('let eps=1e-12'));
assert.ok(!root.includes('<small>推定平均設定</small>'));
console.log('v4.8.0 jdata setting summary regression passed');
