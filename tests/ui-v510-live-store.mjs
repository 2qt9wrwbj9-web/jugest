import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');
const js=fs.readFileSync('public/app-v510.js','utf8');
for(const method of ['prepareJudge','getJudgeState','setJudgeG','setJudgeMetric','setJudgeMetricEnabled','setJudgeMachine','setJudgeContext']){
  assert.match(html,new RegExp(`${method}\\s*:`),`core bridge must expose ${method}`);
}
for(const method of ['getStoreOverview','getStoreDates','getStoreDay','getStoreTrendRoster','computeStoreTrend']){
  assert.match(html,new RegExp(`${method}\\s*:`),`core bridge must expose ${method}`);
}
assert.match(js,/renderJudgeScreen\s*\(/,'new UI must implement a native judge screen');
assert.match(js,/data-judge-g|judge-g/i,'new judge screen must expose G input');
assert.match(js,/data-judge-metric|judge-metric/i,'new judge screen must expose metric inputs');
assert.match(js,/設定4\+|設定4以上/,'new judge screen must expose P4+ result');
assert.match(js,/renderStoreDataScreen\s*\(/,'new UI must implement native store data screen');
assert.match(js,/renderStoreTrendScreen\s*\(/,'new UI must implement native store trend screen');
assert.doesNotMatch(js,/navigateLegacy\?\.\(['"]judge|navigateLegacy\(['"]judge/,'judge UI must not open visible legacy page');
for(const fn of ['v510SetJudgeG','v510SetJudgeMetric','v510SetJudgeMetricEnabled','v510SetJudgeMachine','v510SetJudgeContext']){
  const m=html.match(new RegExp(`function ${fn}\\([^)]*\\)\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(m,`${fn} must exist`);
  assert.doesNotMatch(m[1],/v510NotifyUI\s*\(/,`${fn} must not force a full app rerender while editing judge inputs`);
}
console.log('v5.1.0 live/store native UI static PASS');
