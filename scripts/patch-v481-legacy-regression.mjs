import fs from 'node:fs';

function replaceUnique(text, from, to, label) {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`${label} anchor missing`);
  if (text.indexOf(from, i + from.length) >= 0) throw new Error(`${label} anchor is not unique`);
  return text.slice(0, i) + to + text.slice(i + from.length);
}

{
  const path = 'tests/v470-single-evidence.mjs';
  let text = fs.readFileSync(path, 'utf8');
  const from = "assert.ok(top.rootReasons.some(r=>/過去7日累計差枚/.test(r.label)),`7-day cumulative-diff slump reason missing: ${top.rootReasons.map(r=>r.label).join(' | ')}`);";
  const to = "assert.ok(top.rootReasons.some(r=>/過去7日累計差枚/.test(r.label)||(r.aliasLabels||[]).some(x=>/過去7日累計差枚/.test(x))),`7-day cumulative-diff slump reason missing (including collapsed aliases): ${top.rootReasons.map(r=>[r.label,...(r.aliasLabels||[])].join(' / ')).join(' | ')}`);";
  text = replaceUnique(text, from, to, 'v4.7 single-evidence assertion');
  fs.writeFileSync(path, text);
}

{
  const path = 'tests/v471-performance-regression.mjs';
  let text = fs.readFileSync(path, 'utf8');
  const oldSnap = `function snap(p){\n  return {champion:p.champion,storeTargetP4:p.storeTargetP4,rootEvidence:p.ranking.rootEvidence,\n    rows:p.rows.map(r=>({machine:r.machine,tableNo:r.tableNo,predP4:r.predP4,rankValue:r.rankValue,rootRankES:r.rootRankES,\n      rootEffectES:r.rootEffectES,rootP4Effect:r.rootP4Effect,rootConfidence:r.rootConfidence,rootFamilyCount:r.rootFamilyCount,\n      rootReasons:r.rootReasons.map(x=>[x.label,x.scope,x.effect,x.p4Effect,x.confidence])})).sort((a,b)=>a.machine.localeCompare(b.machine)||a.tableNo.localeCompare(b.tableNo,undefined,{numeric:true}))};\n}`;
  const newSnap = `function strictSnap(p){\n  return {champion:p.champion,storeTargetP4:p.storeTargetP4,\n    rows:p.rows.map(r=>({machine:r.machine,tableNo:r.tableNo,predP4:r.predP4})).sort((a,b)=>a.machine.localeCompare(b.machine)||a.tableNo.localeCompare(b.tableNo,undefined,{numeric:true}))};\n}\nfunction evidenceShape(p){\n  const e=p.ranking.rootEvidence; return {conditionCount:e.conditionCount,usableCount:e.usableCount,confidence:e.confidence};\n}`;
  text = replaceUnique(text, oldSnap, newSnap, 'v4.7.1 snapshot helper');

  const oldAssert = `assert.deepEqual(JSON.parse(JSON.stringify(snap(newPred))),JSON.parse(JSON.stringify(snap(oldPred))),\n  'v4.7.8 must preserve v4.7.0 strict prediction fields; final ordering is intentionally hybridized');\nconsole.log(\`PASS v4.7.8 performance semantic parity; old=\${oldMs.toFixed(0)}ms new=\${newMs.toFixed(0)}ms (timing informational only)\`);`;
  const newAssert = `assert.deepEqual(JSON.parse(JSON.stringify(strictSnap(newPred))),JSON.parse(JSON.stringify(strictSnap(oldPred))),\n  'strict Champion/store-target/per-table P4 fields must remain unchanged by practical evidence aggregation changes');\nassert.deepEqual(JSON.parse(JSON.stringify(evidenceShape(newPred))),JSON.parse(JSON.stringify(evidenceShape(oldPred))),\n  'single-evidence discovery/validation population must remain unchanged by alias dedup');\nfor(const r of newPred.rows){\n  assert.ok(Number.isFinite(r.rankValue)&&Number.isFinite(r.rootRankES)&&Number.isFinite(r.rootEffectES)&&Number.isFinite(r.rootP4Effect)&&Number.isFinite(r.rootConfidence),'practical ranking fields must stay finite after alias dedup');\n  assert.ok(Number.isInteger(r.rootFamilyCount)&&r.rootFamilyCount>=0,'deduplicated independent-root count must stay valid');\n}\nconsole.log(\`PASS v4.8.1 strict semantic parity + alias-aware practical ranking; old=\${oldMs.toFixed(0)}ms new=\${newMs.toFixed(0)}ms (timing informational only)\`);`;
  text = replaceUnique(text, oldAssert, newAssert, 'v4.7.1 semantic parity assertion');
  fs.writeFileSync(path, text);
}

{
  const path = 'tests/v474-lazy-execution.mjs';
  let text = fs.readFileSync(path, 'utf8');
  const oldSnap = `function snap(p){return{champion:p.champion,storeTargetP4:p.storeTargetP4,rootEvidence:p.ranking.rootEvidence,\n  rows:p.rows.map(r=>({machine:r.machine,tableNo:r.tableNo,predP4:r.predP4,rankValue:r.rankValue,rootRankES:r.rootRankES,rootEffectES:r.rootEffectES,\n    rootP4Effect:r.rootP4Effect,rootConfidence:r.rootConfidence,rootFamilyCount:r.rootFamilyCount,\n    rootReasons:r.rootReasons.map(x=>[x.label,x.scope,x.effect,x.p4Delta,x.practicalEffect,x.practicalP4Delta,x.contributionES,x.contributionP4,x.confidence])})).sort((a,b)=>a.machine.localeCompare(b.machine)||a.tableNo.localeCompare(b.tableNo,undefined,{numeric:true}))};}`;
  const newSnap = `function strictSnap(p){return{champion:p.champion,storeTargetP4:p.storeTargetP4,\n  rows:p.rows.map(r=>({machine:r.machine,tableNo:r.tableNo,predP4:r.predP4})).sort((a,b)=>a.machine.localeCompare(b.machine)||a.tableNo.localeCompare(b.tableNo,undefined,{numeric:true}))};}\nfunction evidenceShape(p){const e=p.ranking.rootEvidence;return{conditionCount:e.conditionCount,usableCount:e.usableCount,confidence:e.confidence};}`;
  text = replaceUnique(text, oldSnap, newSnap, 'v4.7.4 lazy snapshot helper');

  const oldAssert = `assert.deepEqual(JSON.parse(JSON.stringify(snap(newPred))),JSON.parse(JSON.stringify(snap(oldPred))),\n  'lazy raw-data execution must preserve v4.7.3 strict prediction values; final ordering is intentionally hybridized');\n\nconsole.log('PASS v4.7.8 lazy execution regression; boot/navigation work deferred, ranking semantics preserved');`;
  const newAssert = `assert.deepEqual(JSON.parse(JSON.stringify(strictSnap(newPred))),JSON.parse(JSON.stringify(strictSnap(oldPred))),\n  'lazy raw-data execution must preserve strict Champion/store-target/per-table P4 values');\nassert.deepEqual(JSON.parse(JSON.stringify(evidenceShape(newPred))),JSON.parse(JSON.stringify(evidenceShape(oldPred))),\n  'lazy raw-data execution must preserve single-evidence discovery/validation population');\nfor(const r of newPred.rows){\n  assert.ok(Number.isFinite(r.rankValue)&&Number.isFinite(r.rootRankES)&&Number.isFinite(r.rootEffectES)&&Number.isFinite(r.rootP4Effect)&&Number.isFinite(r.rootConfidence),'lazy practical ranking fields must stay finite after alias dedup');\n  assert.ok(Number.isInteger(r.rootFamilyCount)&&r.rootFamilyCount>=0,'lazy deduplicated independent-root count must stay valid');\n}\n\nconsole.log('PASS v4.8.1 lazy execution regression; boot/navigation remains deferred, strict prediction semantics preserved, practical aliases deduplicated');`;
  text = replaceUnique(text, oldAssert, newAssert, 'v4.7.4 lazy semantic parity assertion');
  fs.writeFileSync(path, text);
}

console.log('legacy v4.7 regressions are alias-dedup aware while strict parity and lazy execution remain enforced');
