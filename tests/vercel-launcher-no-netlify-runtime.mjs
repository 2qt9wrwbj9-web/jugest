import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync('ana-launcher.js','utf8');
assert.doesNotMatch(src,/jugglerest\.netlify\.app/,'Vercel launcher runtime must not fall back to Netlify');
assert.doesNotMatch(src,/Netlifyにまだ反映|Netlify/,'launcher user-facing errors must not name the old backend');
assert.match(src,/LAUNCHER_SCRIPT_URL\?new URL\(LAUNCHER_SCRIPT_URL,location\.href\)\.origin:''/,'launcher must derive the backend only from its own script origin');
console.log('Vercel launcher has no Netlify runtime fallback PASS');
