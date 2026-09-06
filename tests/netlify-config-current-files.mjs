import fs from 'node:fs';
import assert from 'node:assert/strict';

const toml=fs.readFileSync('tests/fixtures/legacy-netlify/netlify.toml','utf8');
const m=toml.match(/command\s*=\s*"([^"]+)"/);
assert.ok(m,'netlify build command missing');
const command=m[1];
const checked=[...command.matchAll(/node --check\s+([^\s&]+)/g)].map(x=>x[1]);
for(const file of checked){
  assert.ok(fs.existsSync(file.replace('netlify/functions/','tests/fixtures/legacy-netlify/functions/')),`netlify build command references missing file: ${file}`);
}
assert.ok(command.includes('sync-core.js'),'netlify build must check current sync-core.js');
assert.ok(command.includes('core-v510.js'),'netlify build must check current core-v510.js');
assert.ok(command.includes('app-v510.js'),'netlify build must check current app-v510.js');
assert.doesNotMatch(toml,/hanahana-ui\.js|sync-ui\.js/,'netlify config must not reference removed legacy UI files');
assert.match(toml,/for\s*=\s*"\/sync-core\.js"/,'sync-core.js should keep no-cache header');
console.log('Historical Netlify fixture config PASS (not deployed)');
