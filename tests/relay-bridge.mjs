import fs from 'node:fs';
const s=fs.readFileSync(new URL('../public/relay-bridge.html',import.meta.url),'utf8');
if(!s.includes("const API='/api/relay'")) throw new Error('bridge API missing');
if(!s.includes('https://ana-slo.com')||!s.includes('https://www.ana-slo.com')||!s.includes('https://2qt9wrwbj9-web.github.io')) throw new Error('bridge origin allowlist missing');
if(!s.includes('juggler-relay-bridge-call')||!s.includes('juggler-relay-bridge-result')||!s.includes('juggler-relay-bridge-ready')) throw new Error('bridge message protocol missing');
console.log('relay bridge: ok');