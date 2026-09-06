import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const expected = {
  'index.html':'691aeb5a920a8b9c0960595258ec22738f40ae05a61c0ed5d35d623ae82bf038',
  'app-v510.js':'d5bcc1dd788e9bd97528c9a179ba52ab17e0aff78795023ffc754f64a5fc4582',
  'app-v510.css':'5118705d8e48dc8efb0b18b2a40b68e8f034628749db73a60b7c54cd28f2b344',
  'core-v510.js':'b72a712049125b2341f8b12bd7ce5cf2f12bb74064f8eb058ed9f94348fc7d47',
  'hanahana-judge.js':'d8c540d14aa5689528887268aac97ff6197410342eae061eddb55aa77fd2b60e',
  'missing-inference.js':'1a44d1192bcb1ecfbd040f264b57609193161379f631a0df6a74f4fd950c99ca',
  'sync-core.js':'f20ba76206eed257d94345d2851105831ae49542432067231b1066f5c0c79986',
  'ana-launcher.js':'63de2aca8c353b5b5c7ec43300931f46de6843cf704b9cb41dc8fb10e466f95f',
  'relay-bridge.html':'026d4380f682b3a34a6dfa0abf31f374ce99f819337fd82527661ed173bc959e',
  'site.webmanifest':'990f3fa2346e0cae2f77614e3b670396e31fba588552506162d5025bba5db01c',
  'apple-touch-icon.png':'2622669e252cb0aa369721acb0ba17a0c97bc1d1ee4c70ca8715c410e99215d7',
  'favicon-32.png':'c4332d291279a279c3fb5d56c9ad85d385801eed97565f89a641e19b1cb4135e',
  'icon-192.png':'e348e6176034ec71b375f8aa104411e78dd1cc60ed7686c08126667326b12ee9',
  'icon-512.png':'c4cd13ffe2be1e954348ad8fb0847f55dde47e1db9ed2de2f69f9cf61134c6f2',
  'assets/jugest-mark.png':'32fc89afec729e387d9588a7bc92f24929e6261ed9b3a9a580545de787c48c0b'
};
for (const [rel, sha] of Object.entries(expected)) {
  const file = path.join('public', rel);
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
  const got = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (got !== sha) throw new Error(`hash mismatch ${file}: ${got}`);
}
const html = fs.readFileSync('public/index.html','utf8');
const app = fs.readFileSync('public/app-v510.js','utf8');
const launcher = fs.readFileSync('public/ana-launcher.js','utf8');
if (!html.includes('<title>JUGEST v5.1.2</title>')) throw new Error('v5.1.2 title missing');
if (!app.includes("const VERSION='5.1.2'")) throw new Error('v5.1.2 app version missing');
if (launcher.includes('jugglerest.netlify.app') || launcher.includes('jugest.netlify.app')) throw new Error('Netlify runtime fallback detected');
for (const file of ['api/_blob-store.js','api/_node-web.js','api/_relay-web.js','api/_sync-web.js','api/relay.js','api/sync.js']) {
  execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
}
await import('@vercel/blob');
console.log('JUGEST v5.1.2 Vercel release verification: PASS');
