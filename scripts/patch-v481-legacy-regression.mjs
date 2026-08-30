import fs from 'node:fs';

const path = 'tests/v470-single-evidence.mjs';
let text = fs.readFileSync(path, 'utf8');
const from = "assert.ok(top.rootReasons.some(r=>/過去7日累計差枚/.test(r.label)),`7-day cumulative-diff slump reason missing: ${top.rootReasons.map(r=>r.label).join(' | ')}`);";
const to = "assert.ok(top.rootReasons.some(r=>/過去7日累計差枚/.test(r.label)||(r.aliasLabels||[]).some(x=>/過去7日累計差枚/.test(x))),`7-day cumulative-diff slump reason missing (including collapsed aliases): ${top.rootReasons.map(r=>[r.label,...(r.aliasLabels||[])].join(' / ')).join(' | ')}`);";
const i = text.indexOf(from);
if (i < 0) throw new Error('v4.7 single-evidence assertion anchor missing');
if (text.indexOf(from, i + from.length) >= 0) throw new Error('v4.7 single-evidence assertion anchor is not unique');
text = text.slice(0, i) + to + text.slice(i + from.length);
fs.writeFileSync(path, text);
console.log('legacy v4.7 root-reason regression is alias-aware');
