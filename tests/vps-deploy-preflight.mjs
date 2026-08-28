import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { planRelayOrigin, normalizeRelayOrigin } from '../scripts/switch-relay-origin.mjs';

const root = process.cwd();
const caddy = await readFile(path.join(root, 'vps/Caddyfile.example'), 'utf8');
const service = await readFile(path.join(root, 'vps/jugest-relay.service'), 'utf8');
const bridge = await readFile(path.join(root, 'relay-bridge.html'), 'utf8');
const publicBridge = await readFile(path.join(root, 'public/relay-bridge.html'), 'utf8');

assert.match(caddy, /@bridge\s+path\s+\/relay-bridge\.html/);
assert.match(caddy, /root \* \/opt\/jugest/);
assert.match(caddy, /file_server/);
assert.match(caddy, /reverse_proxy 127\.0\.0\.1:8787/);
assert.match(caddy, /frame-ancestors[^\n]*ana-slo\.com/);
assert.match(service, /Environment=HOST=127\.0\.0\.1/);
assert.match(service, /JUGEST_RELAY_DATA_DIR=\/var\/lib\/jugest-relay/);
assert.match(service, /ProtectSystem=strict/);
assert.equal(bridge, publicBridge, 'relay bridge root/public bytes must stay identical');
assert.match(bridge, /const API='\/api\/relay'/);

const dummy = 'https://relay-preflight.invalid';
assert.equal(normalizeRelayOrigin(`${dummy}/`), dummy);
assert.throws(() => normalizeRelayOrigin('http://relay.example.com'), /HTTPS/);
assert.throws(() => normalizeRelayOrigin('https://relay.example.com/path'), /must not include/);

const beforeIndex = await readFile(path.join(root, 'index.html'), 'utf8');
const beforeLauncher = await readFile(path.join(root, 'ana-launcher.js'), 'utf8');
const plan = await planRelayOrigin(root, dummy);
assert.ok(plan.currentOrigin.startsWith('https://'));
assert.equal(plan.newOrigin, dummy);
assert.equal(plan.write, false);
assert.equal(plan.changes.length, 4);
for (const item of plan.changes) assert.equal(item.changed, plan.currentOrigin !== dummy);
assert.equal(await readFile(path.join(root, 'index.html'), 'utf8'), beforeIndex, 'dry-run must not write index');
assert.equal(await readFile(path.join(root, 'ana-launcher.js'), 'utf8'), beforeLauncher, 'dry-run must not write launcher');
assert.ok(plan.changes.find(x => x.file === 'index.html').after.includes(`${dummy}/api/relay`));
const launcherPreview = plan.changes.find(x => x.file === 'ana-launcher.js').after;
assert.ok(launcherPreview.includes(`${dummy}/api/relay`));
assert.ok(launcherPreview.includes(`${dummy}/relay-bridge.html`));
assert.ok(launcherPreview.includes(`RELAY_BRIDGE_ORIGIN='${dummy}'`));

console.log('vps deploy preflight regression passed');
