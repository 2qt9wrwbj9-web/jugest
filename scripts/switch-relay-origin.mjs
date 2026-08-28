import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGETS = [
  { file: 'index.html', names: ['RELAY_API'] },
  { file: 'public/index.html', names: ['RELAY_API'] },
  { file: 'ana-launcher.js', names: ['RELAY_API', 'RELAY_BRIDGE', 'RELAY_BRIDGE_ORIGIN'] },
  { file: 'public/ana-launcher.js', names: ['RELAY_API', 'RELAY_BRIDGE', 'RELAY_BRIDGE_ORIGIN'] },
];

export function normalizeRelayOrigin(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); }
  catch { throw new Error('Relay origin must be a valid HTTPS origin, e.g. https://relay.example.com'); }
  if (u.protocol !== 'https:') throw new Error('Relay origin must use HTTPS');
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/') {
    throw new Error('Relay origin must not include credentials, a path, query, or hash');
  }
  return u.origin;
}

function constRegex(name, global = false) {
  return new RegExp(`(\\bconst\\s+${name}\\s*=\\s*)(['\"])(.*?)\\2`, global ? 'g' : '');
}

function extractConst(text, name, file) {
  const matches = [...text.matchAll(constRegex(name, true))];
  if (matches.length !== 1) throw new Error(`${file}: expected exactly one ${name}, found ${matches.length}`);
  return matches[0][3];
}

function replaceConst(text, name, value, file) {
  const matches = [...text.matchAll(constRegex(name, true))];
  if (matches.length !== 1) throw new Error(`${file}: expected exactly one ${name}, found ${matches.length}`);
  return text.replace(constRegex(name), (_all, prefix, quote) => `${prefix}${quote}${value}${quote}`);
}

function endpointOrigin(value, suffix, label) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.pathname !== suffix || u.search || u.hash) {
    throw new Error(`${label} is not the expected ${suffix} HTTPS endpoint: ${value}`);
  }
  return u.origin;
}

export async function planRelayOrigin(rootDir, rawOrigin, { write = false } = {}) {
  const root = path.resolve(rootDir);
  const newOrigin = normalizeRelayOrigin(rawOrigin);
  const loaded = new Map();
  const observedOrigins = new Set();

  for (const target of TARGETS) {
    const full = path.join(root, target.file);
    const before = await readFile(full, 'utf8');
    loaded.set(target.file, { ...target, full, before, after: before });
    for (const name of target.names) {
      const value = extractConst(before, name, target.file);
      if (name === 'RELAY_API') observedOrigins.add(endpointOrigin(value, '/api/relay', `${target.file}:${name}`));
      else if (name === 'RELAY_BRIDGE') observedOrigins.add(endpointOrigin(value, '/relay-bridge.html', `${target.file}:${name}`));
      else if (name === 'RELAY_BRIDGE_ORIGIN') observedOrigins.add(normalizeRelayOrigin(value));
    }
  }

  if (observedOrigins.size !== 1) {
    throw new Error(`Relay wiring is already split across origins: ${[...observedOrigins].join(', ')}`);
  }
  const currentOrigin = [...observedOrigins][0];

  for (const item of loaded.values()) {
    let after = item.before;
    for (const name of item.names) {
      const value = name === 'RELAY_API' ? `${newOrigin}/api/relay`
        : name === 'RELAY_BRIDGE' ? `${newOrigin}/relay-bridge.html`
        : newOrigin;
      after = replaceConst(after, name, value, item.file);
    }
    item.after = after;
  }

  const rootIndex = loaded.get('index.html').after;
  const publicIndex = loaded.get('public/index.html').after;
  const rootLauncher = loaded.get('ana-launcher.js').after;
  const publicLauncher = loaded.get('public/ana-launcher.js').after;
  if (rootIndex !== publicIndex) throw new Error('Cutover would break root/public index byte parity');
  if (rootLauncher !== publicLauncher) throw new Error('Cutover would break root/public launcher byte parity');

  const changes = [...loaded.values()].map(({ file, full, before, after }) => ({ file, full, before, after, changed: before !== after }));
  if (write) {
    for (const item of changes) if (item.changed) await writeFile(item.full, item.after, 'utf8');
  }
  return { currentOrigin, newOrigin, write, changes };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const origin = args.find(x => !x.startsWith('--'));
  if (!origin) {
    console.error('Usage: node scripts/switch-relay-origin.mjs https://relay.example.com [--write]');
    process.exit(2);
  }
  try {
    const result = await planRelayOrigin(process.cwd(), origin, { write });
    console.log(`Relay origin: ${result.currentOrigin} -> ${result.newOrigin}`);
    for (const c of result.changes) console.log(`${c.changed ? 'CHANGE' : 'SAME  '} ${c.file}`);
    console.log(write ? 'Cutover wiring written.' : 'Dry run only. Re-run with --write after the VPS HTTPS health/bridge checks pass.');
  } catch (e) {
    console.error(e?.message || e);
    process.exit(1);
  }
}
