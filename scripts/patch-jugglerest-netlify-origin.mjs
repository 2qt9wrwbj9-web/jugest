import fs from 'node:fs';
import path from 'node:path';

const OLD='https://jugest.netlify.app';
const NEW='https://jugglerest.netlify.app';
const OLD_LAUNCHER_SHA='964891a40f829bc73e12dfd4da2c486b775e2650535a97e702ca296f12cb13a4';
const NEW_LAUNCHER_SHA='2481cbc8707e4a8803ce0da597331adfb80f37797b2b1d7a030b023f5fa74e67';
const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
const replaceAll=(p)=>{const s=read(p),n=s.split(OLD).join(NEW);if(n!==s)write(p,n);};
const replaceOnce=(p,from,to,label)=>{const s=read(p),i=s.indexOf(from);if(i<0)throw new Error(`missing ${label} in ${p}`);if(s.indexOf(from,i+from.length)>=0)throw new Error(`duplicate ${label} in ${p}`);write(p,s.slice(0,i)+to+s.slice(i+from.length));};

// Active app shell: only change the live Relay constant; preserve historical changelog text.
for(const p of ['index.html','public/index.html']){
  replaceOnce(p,`const RELAY_API=\"${OLD}/api/relay\"`,`const RELAY_API=\"${NEW}/api/relay\"`,'RELAY_API');
}

// Active launcher + current bookmarklet.
for(const p of ['ana-launcher.js','public/ana-launcher.js']) replaceAll(p);
replaceAll('BOOKMARKLET_v4500.txt');

// Netlify Function: new app origin only. Old subdomain is intentionally removed from CORS allowlist.
replaceAll('netlify/functions/relay.mjs');
let relay=read('netlify/functions/relay.mjs').replace("  'https://2qt9wrwbj9-web.github.io',\n",'');
write('netlify/functions/relay.mjs',relay);

// Current production docs/tests and parked migration references that should point back to the new rollback origin.
for(const p of ['README.md','tests/netlify-deploy-preflight.mjs']) replaceAll(p);
for(const dir of ['tests','vps']){
  for(const name of fs.readdirSync(dir)){
    const p=path.join(dir,name);
    if(!fs.statSync(p).isFile())continue;
    if(!/\.(mjs|js|md|txt|sh|example)$/.test(name))continue;
    replaceAll(p);
  }
}

// v4.7.3 deliberately pins Launcher bytes. This migration changes only the reviewed Netlify origin constants,
// so update that guard to the exact post-migration Launcher hash while keeping VERSION/PARSER_VERSION unchanged.
let relayInit=read('tests/v473-relay-init.mjs');
if(!relayInit.includes(OLD_LAUNCHER_SHA))throw new Error('v473 Launcher SHA guard is not the expected pre-migration value');
relayInit=relayInit.replace(OLD_LAUNCHER_SHA,NEW_LAUNCHER_SHA)
  .replace('Launcher changed unexpectedly; bookmarklet/parser bump would need explicit review','Launcher changed unexpectedly beyond the reviewed Netlify-origin migration; bookmarklet/parser bump would need explicit review')
  .replace('version sync + Launcher/bookmarklet unchanged','version sync + reviewed Launcher origin migration pinned');
write('tests/v473-relay-init.mjs',relayInit);

// Strengthen the production guard: old host must not reappear in active assets.
let pre=read('tests/netlify-deploy-preflight.mjs');
if(!pre.includes('old Netlify origin must not remain')){
  const anchor="for (const active of [pub, launcher, publicLauncher, bookmarklet, bridge]) {\n";
  const insert="for (const active of [pub, launcher, publicLauncher, bookmarklet, bridge, relay, readme]) {\n  assert.ok(!active.includes('https://jugest.netlify.app'), 'old Netlify origin must not remain in active production wiring');\n}\n\n";
  if(!pre.includes(anchor))throw new Error('preflight anchor missing');
  pre=pre.replace(anchor,insert+anchor);
  write('tests/netlify-deploy-preflight.mjs',pre);
}

// README migration note: browser storage is origin-scoped.
let md=read('README.md');
if(!md.includes('Browser storage migration note')){
  md += "\n## Browser storage migration note\n\nMoving from `jugest.netlify.app` to `jugglerest.netlify.app` creates a new browser origin. IndexedDB/localStorage do not move automatically. Before retiring the old hostname, export a complete backup there, restore it on the new hostname, verify store-day/history counts, then re-pair Launcher Relay because receiver pairing is also origin-scoped.\n";
  write('README.md',md);
}

// Active runtime parity checks.
if(read('index.html')!==read('public/index.html'))throw new Error('root/public index parity broken');
if(read('ana-launcher.js')!==read('public/ana-launcher.js'))throw new Error('root/public launcher parity broken');
for(const [p,needle] of [
  ['index.html',`${NEW}/api/relay`],
  ['ana-launcher.js',`${NEW}/api/relay`],
  ['ana-launcher.js',`${NEW}/relay-bridge.html`],
  ['BOOKMARKLET_v4500.txt',`${NEW}/ana-launcher.js?v=4500`],
  ['netlify/functions/relay.mjs',`'${NEW}'`],
  ['tests/v473-relay-init.mjs',NEW_LAUNCHER_SHA],
]) if(!read(p).includes(needle))throw new Error(`${p} missing ${needle}`);

console.log('Applied jugglerest.netlify.app production-origin migration patch');
