import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('public/index.html','utf8');
const core=fs.existsSync('public/core-v510.js')?fs.readFileSync('public/core-v510.js','utf8'):'';
const app=fs.readFileSync('public/app-v510.js','utf8');

assert.ok(core,'core-v510.js must exist');
assert.doesNotMatch(html,/LEGACY_RUNTIME_ROOT/,'legacy runtime root must be physically removed');
assert.doesNotMatch(html,/<aside[^>]+id="drawer"|class="drawer"/,'legacy drawer must be removed');
assert.doesNotMatch(html,/<section\s+id="(?:judge|rev|movecompare|cmp|runlog|stores|calendar|strategy|todayplan|replay|extimport|bruteanalysis|modelperf)"/,'legacy page DOM must be removed');
assert.doesNotMatch(html,/uiPreviewLegacyVisible|v510LegacyRenderRequested/,'legacy visibility runtime must be removed');
assert.match(html,/<script[^>]+src="\.\/core-v510\.js"/,'headless core must be loaded explicitly');
assert.doesNotMatch(core,/\bdocument\b|\bwindow\.\$\b|\$\("[A-Z0-9_]+"/,'headless core must not depend on UI DOM');
assert.doesNotMatch(core,/render[A-Z][A-Za-z0-9_]*\s*\(/,'headless core must not call UI render functions');
assert.match(app,/JUGEST_CORE_BRIDGE/,'new app must consume the core bridge');
console.log('v5.1.0 no-legacy-runtime architecture PASS');
