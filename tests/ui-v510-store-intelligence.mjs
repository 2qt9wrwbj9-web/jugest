import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');
const js=fs.readFileSync('public/app-v510.js','utf8');

for(const method of ['getTodayPlan','runStoreAnalysis','runReplay','getModelPerformance']){
  assert.match(html,new RegExp(`${method}\\s*:`),`core bridge must expose ${method}`);
}
for(const fn of ['renderTodayPlanScreen','renderStoreAnalysisScreen','renderReplayScreen','renderModelPerformanceScreen']){
  assert.match(js,new RegExp(`${fn}\\s*\\(`),`new UI must implement ${fn}`);
}
assert.match(js,/data-plan-run/,'today plan must be explicit-run');
assert.match(js,/data-analysis-run/,'store analysis must be explicit-run');
assert.match(js,/data-replay-run/,'replay must be explicit-run');
assert.match(js,/data-model-run/,'model performance must be explicit-run');
assert.doesNotMatch(js,/navigateLegacy\?\.\(['"](?:todayplan|bruteanalysis|replay|modelperf)/,'store intelligence screens must not visibly navigate to legacy pages');

assert.match(html,/function v510GetTodayPlan[\s\S]*?v5StoreRankForPlan\(/,'today plan bridge must read existing v5 store rank');
assert.match(html,/function v510RunStoreAnalysis[\s\S]*?brutePrepare\([\s\S]*?bruteSingleGenerate\([\s\S]*?bruteGenerate\(/,'store analysis bridge must invoke the existing analysis primitives directly without legacy rendering');
assert.match(html,/function v510RunReplay[\s\S]*?v4PredictStore\(/,'replay bridge must invoke existing prediction engine');
assert.match(html,/function v510GetModelPerformance[\s\S]*?modelPerformanceForShop\(/,'model performance bridge must invoke existing scoring engine');

console.log('v5.1.0 store intelligence native UI static PASS');
