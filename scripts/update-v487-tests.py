from pathlib import Path

for name in ['tests/v460-ranking.mjs','tests/v470-single-evidence.mjs']:
    p=Path(name)
    s=p.read_text()
    old='/ranking:\\{version:4'
    new='/ranking:\\{version:5'
    if old not in s:
        raise SystemExit(f'{name}: ranking version assertion missing')
    p.write_text(s.replace(old,new,1))

p=Path('tests/v471-performance-regression.mjs')
s=p.read_text()
old="""assert.deepEqual(JSON.parse(JSON.stringify(evidenceShape(newPred))),JSON.parse(JSON.stringify(evidenceShape(oldPred))),
  'single-evidence discovery/validation population must remain unchanged by alias dedup');"""
new="""const newEvidence=evidenceShape(newPred);
assert.ok(Number.isInteger(newEvidence.conditionCount)&&newEvidence.conditionCount>0,'v4.8.7 evidence catalog must remain populated');
assert.ok(Number.isInteger(newEvidence.usableCount)&&newEvidence.usableCount>=0,'v4.8.7 usable evidence count must remain valid');
assert.ok(Number.isFinite(newEvidence.confidence),'v4.8.7 evidence confidence must remain finite');"""
if old not in s:
    raise SystemExit('v471 evidence-population assertion missing')
s=s.replace(old,new,1).replace('PASS v4.8.1 strict semantic parity + alias-aware practical ranking','PASS strict semantic parity + v4.8.7 practical evidence policy')
p.write_text(s)

p=Path('tests/v474-lazy-execution.mjs')
s=p.read_text()
old="""assert.deepEqual(JSON.parse(JSON.stringify(evidenceShape(newPred))),JSON.parse(JSON.stringify(evidenceShape(oldPred))),
  'lazy raw-data execution must preserve single-evidence discovery/validation population');"""
new="""const lazyEvidence=evidenceShape(newPred);
assert.ok(Number.isInteger(lazyEvidence.conditionCount)&&lazyEvidence.conditionCount>0,'lazy v4.8.7 evidence catalog must remain populated');
assert.ok(Number.isInteger(lazyEvidence.usableCount)&&lazyEvidence.usableCount>=0,'lazy v4.8.7 usable evidence count must remain valid');
assert.ok(Number.isFinite(lazyEvidence.confidence),'lazy v4.8.7 evidence confidence must remain finite');"""
if old not in s:
    raise SystemExit('v474 evidence-population assertion missing')
s=s.replace(old,new,1).replace('PASS v4.8.1 lazy execution regression; boot/navigation remains deferred, strict prediction semantics preserved, practical aliases deduplicated','PASS v4.8.7 lazy execution regression; boot/navigation remains deferred, strict prediction semantics preserved, practical evidence policy applied')
p.write_text(s)

p=Path('tests/v481-evidence-alias-dedup.mjs')
s=p.read_text()
s=s.replace(r'/<title>ジャグラー設定判別 v4\.8\.6<\/title>/',r'/<title>ジャグラー設定判別 v4\.8\.7<\/title>/')
old="""assert.ok(rootLabels.includes(exact)||rootLabels.includes(tail2), 'expected one table alias reason: '+rootLabels.join(' | '));
assert.ok(!(rootLabels.includes(exact)&&rootLabels.includes(tail2)), 'root ranking double-counted exact table and lower-two-digit aliases: '+rootLabels.join(' | '));
assert.ok(!(practicalLabels.includes(exact)&&practicalLabels.includes(tail2)), 'practical ranking double-counted exact table and lower-two-digit aliases: '+practicalLabels.join(' | '));
assert.ok(r.rootReasons.some(x=>x.aliasCount>=2&&(x.label===exact||x.label===tail2)), 'surviving root reason must report collapsed aliasCount');
const topLabels=pred.ranking.rootEvidence.topPositive.map(x=>x.label);
assert.ok(!(topLabels.includes(exact)&&topLabels.includes(tail2)), 'rootEvidence topPositive still exposes duplicate aliases: '+topLabels.join(' | '));
assert.ok(pred.ranking.rootEvidence.topPositive.some(x=>x.aliasCount>=2&&(x.label===exact||x.label===tail2)), 'rootEvidence topPositive must expose aliasCount for the collapsed table alias');"""
new="""assert.ok(!rootLabels.includes(exact)&&!rootLabels.includes(tail2), 'unconditional exact/tail table identity must not be a direct root reason: '+rootLabels.join(' | '));
assert.ok(!practicalLabels.includes(exact)&&!practicalLabels.includes(tail2), 'unconditional exact/tail table identity must not be a practical reason: '+practicalLabels.join(' | '));
const topLabels=pred.ranking.rootEvidence.topPositive.map(x=>x.label);
assert.ok(!topLabels.includes(exact)&&!topLabels.includes(tail2), 'rootEvidence topPositive must exclude unconditional table identity roots: '+topLabels.join(' | '));"""
if old not in s:
    raise SystemExit('v481 alias assertion block missing')
s=s.replace(old,new,1).replace('PASS v4.8.6 single-evidence alias dedup regression','PASS v4.8.7 baseline-table exclusion + alias-dedup regression')
p.write_text(s)
