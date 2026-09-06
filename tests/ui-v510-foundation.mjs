import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('public/index.html','utf8');
assert.match(html, /<jugest-app\b[^>]*id="JUGEST_APP"/i, 'v5.1.0 root <jugest-app> must exist');
assert.match(html, /<script[^>]+src="\.\/app-v510\.js"/i, 'v5.1.0 app script must be loaded');
assert.ok(fs.existsSync('public/app-v510.js'), 'public/app-v510.js must exist');
assert.ok(fs.existsSync('public/app-v510.css'), 'public/app-v510.css must exist');

const js = fs.readFileSync('public/app-v510.js','utf8');
const css = fs.readFileSync('public/app-v510.css','utf8');

for (const ws of ['home','live','store','records','data']) {
  assert.match(js, new RegExp(`['\"]${ws}['\"]`), `workspace ${ws} must be represented in app code`);
}
assert.match(js, /attachShadow\s*\(/, 'new UI must use Shadow DOM isolation');
assert.match(js, /function\s+loadUIState\s*\(/, 'UI state load must be guarded for restricted localStorage contexts');
assert.match(js, /const saved=loadUIState\(\)/, 'constructor must use guarded UI state loader');
assert.match(js, /activeStore/, 'new UI must have an activeStore concept');
assert.match(js, /store-selector|storeSelector|STORE_SELECTOR/i, 'new UI must expose explicit store selector UI');
assert.match(js, /bridge\.getSummary(?:\?\.)?\s*\(/, 'home must consume bridge summary');
assert.match(js, /取得|Collector|status/i, 'home must include acquisition/status semantics');
assert.doesNotMatch(js, /旧UIに戻す|新UIに戻す|UI Preview/i, 'visible v5.1.0 copy must not expose preview/legacy toggles');

assert.match(html, /window\.JUGEST_CORE_BRIDGE\s*=/, 'core bridge must be created by index runtime');
for (const method of ['getSummary','getStores','getActiveStore','setActiveStore','subscribe']) {
  assert.match(html, new RegExp(`${method}\s*[:(]`), `bridge must expose ${method}`);
}

assert.match(css, /env\(safe-area-inset-top\)/, 'shell must handle top safe area');
assert.match(css, /env\(safe-area-inset-bottom\)/, 'shell must handle bottom safe area');
assert.match(css, /prefers-reduced-motion/, 'shell must support reduced motion');
assert.match(css, /min-height:\s*(?:100dvh|100svh)/, 'visible app must cover the standalone viewport');
assert.match(css, /min-width:\s*44px|min-height:\s*44px/, 'interactive targets must have at least a 44px floor');

assert.doesNotMatch(html,/navigateLegacy\s*:/,'legacy navigation must be removed from the v5.1 bridge');
console.log('v5.1.0 UI foundation static PASS');
