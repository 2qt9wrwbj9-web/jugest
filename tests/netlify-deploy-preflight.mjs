import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [toml, root, pub, launcher, bridge, relay] = await Promise.all([
  readFile('netlify.toml', 'utf8'),
  readFile('index.html', 'utf8'),
  readFile('public/index.html', 'utf8'),
  readFile('ana-launcher.js', 'utf8'),
  readFile('public/relay-bridge.html', 'utf8'),
  readFile('netlify/functions/relay.mjs', 'utf8'),
]);

assert.equal(root, pub, 'root/public index must remain byte-identical');
assert.match(pub, /ジャグラー設定判別 v4\.8\.2/);

assert.match(toml, /publish\s*=\s*"public"/);
assert.match(toml, /command\s*=\s*"npm run check"/);
assert.match(toml, /NODE_VERSION\s*=\s*"22"/);
assert.match(toml, /directory\s*=\s*"netlify\/functions"/);
assert.match(toml, /node_bundler\s*=\s*"esbuild"/);
for (const path of ['/', '/index.html', '/ana-launcher.js', '/relay-bridge.html']) {
  assert.ok(toml.includes(`for = "${path}"`), `missing fresh-cache header for ${path}`);
}
assert.ok((toml.match(/Cache-Control\s*=\s*"no-store, no-cache, must-revalidate"/g) || []).length >= 4);

const origin = 'https://jugest.netlify.app';
assert.ok(pub.includes(`const RELAY_API="${origin}/api/relay"`), 'main app must use Netlify Relay while Netlify is production');
assert.ok(launcher.includes(`const RELAY_API='${origin}/api/relay'`));
assert.ok(launcher.includes(`const RELAY_BRIDGE='${origin}/relay-bridge.html'`));
assert.ok(launcher.includes(`const RELAY_BRIDGE_ORIGIN='${origin}'`));
assert.ok(bridge.includes("const API='/api/relay'"), 'bridge must call the same Netlify origin');
for (const allowed of [origin, 'https://ana-slo.com', 'https://www.ana-slo.com']) {
  assert.ok(relay.includes(`'${allowed}'`), `relay origin allowlist missing ${allowed}`);
}

console.log('Netlify production preflight passed: v4.8.2 app + Relay + Safari bridge are wired to jugest.netlify.app');
