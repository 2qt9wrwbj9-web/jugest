import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
if(!/<html[^>]*class="jugest-app"/i.test(html))throw new Error('html must carry JUGEST app surface class');
if(!/html\.jugest-app\s*,\s*html\.jugest-app\s+body\.jugest-v510\s*\{[^}]*background\s*:/i.test(html))throw new Error('html + v5.1 body must share branded PWA background');
if(!/body\.jugest-v510\s*\{[^}]*min-height\s*:\s*100dvh/i.test(html))throw new Error('v5.1 body must fill standalone viewport');
if(/LEGACY_RUNTIME_ROOT/i.test(html))throw new Error('legacy runtime must not exist in the standalone app');
if(/body\.jugest-v510\s+jugest-app\s*\{[^}]*min-height\s*:\s*100(?:dvh|vh|svh)/i.test(html))throw new Error('jugest-app host must not become a viewport spacer');
console.log('PWA viewport background no-legacy regression PASS');
