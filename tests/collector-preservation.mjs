import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(fs.readFileSync('docs/collector-batch/protected-hashes.json','utf8'));
const hash=x=>createHash('sha256').update(x).digest('hex');
for(const [file,expected] of Object.entries(manifest.protectedFiles))assert.equal(hash(fs.readFileSync(file)),expected,`Production protected: ${file}`);
for(const [file,expected] of Object.entries(manifest.jitterFiles))assert.equal(hash(fs.readFileSync(file)),expected,`Exact clean jitter integration: ${file}`);
const files=fs.readdirSync('api').filter(f=>f.endsWith('.js'));
assert.ok(!files.some(f=>/health|diagnostic|probe/.test(f)),'no diagnostic endpoints');
for(const file of ['_blob-store.js','_collector-state-v3.js','_collector-batch-v3.js','_relay-web.js']){
  const src=fs.readFileSync(`api/${file}`,'utf8');
  assert.doesNotMatch(src,/blob-health|x-blob-token|BLOB_READ_WRITE_TOKEN\s*=|token\s*:\s*process\.env|VERCEL_BLOB_API_VERSION_OVERRIDE|access\s*:\s*['"]public['"]|netlify\.app/);
}
const relay=fs.readFileSync('api/_relay-web.js','utf8');
assert.match(relay,/process\.env\.VERCEL_ENV==='preview'\?'jugest-preview-collector-v3':'jugest'/);
assert.match(relay,/createBlobStore\(name,\{\.\.\.options,root\}\)/);
console.log(`PASS ${Object.keys(manifest.protectedFiles).length} Production hashes, five byte-exact clean jitter files, Preview namespace and diagnostic exclusion`);
