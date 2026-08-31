import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [toml, root, pub, launcher, publicLauncher, bridge, relay, syncFn, syncUi, publicSyncUi, bookmarklet, pkgText, ci, readme] = await Promise.all([
  readFile('netlify.toml', 'utf8'),
  readFile('index.html', 'utf8'),
  readFile('public/index.html', 'utf8'),
  readFile('ana-launcher.js', 'utf8'),
  readFile('public/ana-launcher.js', 'utf8'),
  readFile('public/relay-bridge.html', 'utf8'),
  readFile('netlify/functions/relay.mjs', 'utf8'),
  readFile('netlify/functions/sync.mjs', 'utf8'),
  readFile('sync-ui.js', 'utf8'),
  readFile('public/sync-ui.js', 'utf8'),
  readFile('BOOKMARKLET_v4860.txt', 'utf8'),
  readFile('package.json', 'utf8'),
  readFile('.github/workflows/pages.yml', 'utf8'),
  readFile('README.md', 'utf8'),
]);

assert.equal(root, pub, 'root/public index must remain byte-identical');
assert.equal(launcher, publicLauncher, 'root/public launcher must remain byte-identical');
assert.equal(syncUi, publicSyncUi, 'root/public sync client must remain byte-identical');
assert.match(pub, /ジャグラー設定判別 v4\.8\.6/);

assert.match(toml, /publish\s*=\s*"public"/);
assert.match(toml, /command\s*=\s*"npm run check"/);
assert.match(toml, /NODE_VERSION\s*=\s*"22"/);
assert.match(toml, /directory\s*=\s*"netlify\/functions"/);
assert.match(toml, /node_bundler\s*=\s*"esbuild"/);
for (const path of ['/', '/index.html', '/ana-launcher.js', '/relay-bridge.html', '/sync-ui.js']) {
  assert.ok(toml.includes(`for = "${path}"`), `missing fresh-cache header for ${path}`);
}
assert.ok((toml.match(/Cache-Control\s*=\s*"no-store, no-cache, must-revalidate"/g) || []).length >= 5);

const origin = 'https://jugglerest.netlify.app';
assert.ok(pub.includes(`const RELAY_API="${origin}/api/relay"`), 'main app must use Netlify Relay');
assert.ok(launcher.includes(`const RELAY_API='${origin}/api/relay'`), 'Launcher Relay API must use Netlify');
assert.ok(launcher.includes(`const RELAY_BRIDGE='${origin}/relay-bridge.html'`), 'Launcher bridge must use Netlify');
assert.ok(launcher.includes(`const RELAY_BRIDGE_ORIGIN='${origin}'`), 'Launcher bridge origin must use Netlify');
assert.ok(bridge.includes("const API='/api/relay'"), 'bridge must call the same Netlify origin');
assert.ok(bookmarklet.includes(`${origin}/ana-launcher.js?v=4860`), 'current bookmarklet must load Launcher from Netlify');
assert.ok(pub.includes('<script src="./sync-ui.js"></script>'), 'app must load device sync client');
assert.ok(syncUi.includes("const API='/api/sync'"), 'sync client must use same-origin Netlify sync API');
assert.ok(syncFn.includes("path: '/api/sync'"), 'sync function route missing');
assert.ok(syncFn.includes("'https://jugglerest.netlify.app'"), 'sync origin allowlist missing production origin');
for (const allowed of [origin, 'https://ana-slo.com', 'https://www.ana-slo.com']) {
  assert.ok(relay.includes(`'${allowed}'`), `relay origin allowlist missing ${allowed}`);
}

for (const active of [pub, launcher, publicLauncher, bookmarklet, bridge, relay, readme]) {
  assert.ok(!active.includes('https://jugest.netlify.app'), 'old Netlify origin must not remain in active production wiring');
}

for (const active of [pub, launcher, publicLauncher, bookmarklet, bridge]) {
  assert.ok(!active.includes('https://jugest.com'), 'active production asset must not point at jugest.com');
  assert.ok(!active.includes('https://relay.jugest.com'), 'active production asset must not point at relay.jugest.com');
}

const pkg = JSON.parse(pkgText);
for (const name of ['test', 'check']) {
  const script = String(pkg.scripts?.[name] || '');
  assert.ok(!script.includes('vps/'), `${name} must not run VPS code while Netlify is production`);
  assert.ok(!script.includes('tests/vps-'), `${name} must not run VPS tests while Netlify is production`);
  assert.ok(!script.includes('switch-relay-origin'), `${name} must not include origin-switch tooling while Netlify is production`);
}
assert.equal(pkg.scripts?.['netlify:preflight'], 'node tests/netlify-deploy-preflight.mjs');

assert.match(ci, /name:\s*Netlify production CI/);
assert.ok(!ci.includes('actions/deploy-pages'), 'GitHub Actions must not deploy GitHub Pages while Netlify is production');
assert.ok(!ci.includes('actions/upload-pages-artifact'), 'GitHub Actions must not publish a Pages artifact');
assert.match(readme, /Netlify is the sole active production target/);
assert.match(readme, /Current app release:\s*\*\*v4\.8\.6\*\*/);
assert.match(readme, /Current bookmarklet loader:\s*`BOOKMARKLET_v4860\.txt`/);

console.log('Netlify production preflight passed: v4.8.6 app + Relay + sync + bridge + Launcher + bookmarklet + CI are Netlify-only');
