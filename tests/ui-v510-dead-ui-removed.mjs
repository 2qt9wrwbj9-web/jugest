import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');
const banned=['renderRunLog','renderStoreManagement','renderAnalysis','renderStrategyAnalysis','renderCalendar','renderDataManager','renderRelayPanel','renderExternalImport','renderBruteAnalysis','renderModelPerformance','pageState','setPage','renderLazyPage','make','revcalc','renderCompare','v4RenderTodayPlan','v4RenderReplay','v4BindJudgeContext','renderStoreAnalysisHistory','storeAnalysisOpen','storeAnalysisDelete','showMiniToast'];
for(const name of banned) assert.doesNotMatch(html,new RegExp(`function\\s+${name}\\s*\\(`),`dead legacy UI function remains: ${name}`);
for(const f of ['ui-preview.js','hanahana-ui.js','sync-ui.js']) assert.ok(!fs.existsSync(`public/${f}`),`obsolete UI artifact remains: ${f}`);
assert.doesNotMatch(html,/HanaAppBridge|HanaJudgeUI|navigateLegacy|LAZY_PAGE_NAMES|PAGE_LABEL/,'legacy UI bridge/runtime token remains');
assert.doesNotMatch(html,/document\.getElementById|document\.querySelector(All)?|\$\(["'][A-Z0-9_]+["']\)/,'inline domain engine must not query legacy UI DOM');
console.log('v5.1.0 dead legacy UI removal PASS');
