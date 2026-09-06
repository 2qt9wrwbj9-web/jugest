import fs from 'node:fs';
import assert from 'node:assert/strict';
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const relay=fs.readFileSync('api/relay.js','utf8')+'\n'+fs.readFileSync('api/_relay-web.js','utf8');
const sync=fs.readFileSync('api/sync.js','utf8')+'\n'+fs.readFileSync('api/_sync-web.js','utf8');
const blob=fs.existsSync('api/_blob-store.js')?fs.readFileSync('api/_blob-store.js','utf8'):'';
assert.ok(pkg.dependencies?.['@vercel/blob'],'@vercel/blob dependency is required');
assert.match(blob,/makeBlobStore/);
for(const [name,src] of [['relay',relay],['sync',sync]]){
  assert.doesNotMatch(src,/createNetlifyProxy|jugglerest\.netlify\.app\/api\//,`${name} must not proxy normal traffic to Netlify`);
  assert.match(src,/createBlobStore|vercel/i,`${name} must use the Vercel backend`);
}
assert.match(relay,/juggler-relay-v1/);
assert.match(sync,/juggler-device-sync-v1/);
console.log('Vercel native backend static PASS');
