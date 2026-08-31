import fs from 'node:fs';
import assert from 'node:assert/strict';
const s=fs.readFileSync(new URL('../ana-launcher.js',import.meta.url),'utf8');
const must=[
  "const VERSION='4.8.4'",
  "const ACCESS_WINDOW_MS=15*60*1000",
  "const ACCESS_LIMIT=30",
  "const DB_VERSION=2",
  "const SHOP_REGISTRY_KEY='jugglerAnaShopRegistry:v1'",
  "const NIGHT_WAIT_MIN_MS=25000",
  "const NIGHT_WAIT_MAX_MS=35000",
  'function listUnsentDaysAll()',
  'function fetchUrlForShop(date,targetSlug)',
  'async function fetchDayForShop',
  "bypassRateLimit:true",
  'function relayPayloadForShop',
  'async function relaySendAllUnsent',
  'async function runAllLatest()',
  'async function runNightAutomation()',
  'async function retryCurrentNightFailures',
  'async function updateRegisteredLatestNight',
  'async function buildPendingShopsNight',
  'REGION_PREFECTURES',
  'parseCatalogShops',
  'jacAllLatest','jacAllUnsent','jacAddShop','jacCatalogRegion','jacCatalogPref','jacCatalogShop'
];
for(const x of must)assert.ok(s.includes(x),'missing v4.8.4 feature: '+x);
assert.ok(!s.includes('const ACCESS_WINDOW_MS=30*60*1000'),'old 30-minute limiter remains');
assert.ok(!s.includes('return randMs(35000,55000)'),'old night wait remains');
assert.ok(!s.includes('return randMs(8*60000,12*60000)'),'old 60-day night rest remains');
assert.ok(!s.includes('return randMs(2*60000,4*60000)'),'old 15-day night rest remains');
const nightRetry=s.slice(s.indexOf('async function nightFetchWithRetryForShop'),s.indexOf('async function finishNight'));
assert.ok(nightRetry.includes('{bypassRateLimit:true}'),'night fetch must bypass local rolling limiter');
const normal=s.slice(s.indexOf('async function run(){'),s.indexOf("$('jacStart').onclick"));
assert.ok(normal.includes('fetchDay(date)'),'normal acquisition must still use rate-limited fetch');
const bookmark=fs.readFileSync(new URL('../BOOKMARKLET_v4840.txt',import.meta.url),'utf8');
assert.ok(bookmark.includes('jugglerest.netlify.app/ana-launcher.js?v=4840'));
const root=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),pub=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
assert.equal(root,pub,'root/public index diverged');
assert.equal(s,fs.readFileSync(new URL('../public/ana-launcher.js',import.meta.url),'utf8'),'root/public launcher diverged');
console.log('v4.8.4 launcher maintenance regression: ok');
