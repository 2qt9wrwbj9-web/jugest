import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {withoutJudgementAdditions} from './helpers/judgement-preservation.mjs';
const manifest=JSON.parse(fs.readFileSync('docs/collector-batch/protected-hashes.json','utf8'));
const hash=x=>createHash('sha256').update(x).digest('hex');
const reviewedBuildRefactor=Object.freeze({
  'build/patches/analysis-jitter-fix.mjs':'2f3adf28c082da28082c810c4071fa4887cf9853b59123cafd36411903c49bf2',
  'build/patches/collector-coverage.mjs':'c7687fc5d3b4d8c20a3971a8b5d3eb7e89cd9f10f642db5292bd2be4621555d1',
  'build/patches/collector-ui.mjs':'d72db6e93e71c4c2e38f00dfb8e29a5a9dc523eb6f2624a30a8b5808d8bfff6a',
  'build/patches/fixed-chrome.mjs':'18e22c75c78b8e8146ec3ac510643b51377708556bd6ceeface7abf2fdc23cd2',
  'build/patches/store-analysis-view.mjs':'3a98afda9208fc4ff0101268f49a6df8c895a293bbf69247247179506e01bc33',
  'tests/production-preservation.mjs':'6c01de6d9af8270382edd3cb83008d3d7e8a9212dcd02f86adcc04bfba6511b7'
});
for(const [file,expected] of Object.entries(manifest.protectedFiles)){
  const actual=hash(withoutJudgementAdditions(file,fs.readFileSync(file,'utf8')));
  // Vercel CLI 59.11.7 rewrites this file as compact JSON plus a newline.
  // Accept only that exact baseline-equivalent byte representation; changes to
  // any setting still fail. The checked-in file retains its original hash.
  if(file==='vercel.json')assert.ok([expected,manifest.vercelMinifiedSha256].includes(actual),`Production protected: ${file}`);
  else assert.equal(actual,expected,`Production protected: ${file}`);
}
for(const [file,expected] of Object.entries(manifest.jitterFiles)){
  if(['build.mjs','build-analysis-jitter-fix.mjs','tests/production-preservation.mjs'].includes(file))continue;
  assert.equal(hash(withoutJudgementAdditions(file,fs.readFileSync(file,'utf8'))),expected,`Exact clean jitter integration: ${file}`);
}
for(const [file,expected] of Object.entries(reviewedBuildRefactor)){
  assert.equal(hash(withoutJudgementAdditions(file,fs.readFileSync(file,'utf8'))),expected,`Reviewed build refactor: ${file}`);
}
const buildSource=fs.readFileSync('build.mjs','utf8');
assert.match(buildSource,/from '\.\/build\/patches\/index\.mjs'/,'build uses the patch composition entry point');
for(const leaf of ['analysis-jitter-fix','collector-coverage','collector-ui','fixed-chrome','store-analysis-view']){
  assert.doesNotMatch(buildSource,new RegExp(`build/patches/${leaf}\\.mjs`),`build does not couple directly to ${leaf}`);
}
const expectedPatchIndex="import { patchStoreAnalysisHtml, patchStoreAnalysisApp } from './store-analysis-view.mjs';\nimport { patchAnalysisJitterApp } from './analysis-jitter-fix.mjs';\nimport { patchCollectorCoverageHtml } from './collector-coverage.mjs';\nimport { patchFixedChromeCss } from './fixed-chrome.mjs';\nimport { patchCollectorUiApp } from './collector-ui.mjs';\n\nexport function applyHtmlBuildPatches(input){\n let html=patchCollectorCoverageHtml(input);\n return patchStoreAnalysisHtml(html);\n}\n\nexport function applyCssBuildPatches(input){\n return patchFixedChromeCss(input);\n}\n\nexport function applyAppBuildPatches(input){\n let app=patchCollectorUiApp(input);\n app=patchStoreAnalysisApp(app);\n return patchAnalysisJitterApp(app);\n}\n";
assert.equal(fs.readFileSync('build/patches/index.mjs','utf8'),expectedPatchIndex,'build patch order remains explicitly frozen');
const files=fs.readdirSync('api').filter(f=>f.endsWith('.js'));
assert.ok(!files.some(f=>/health|diagnostic|probe/.test(f)),'no diagnostic endpoints');
for(const file of ['_blob-store.js','_collector-state-v3.js','_collector-batch-v3.js','_relay-web.js']){
  const src=fs.readFileSync(`api/${file}`,'utf8');
  assert.doesNotMatch(src,/blob-health|x-blob-token|BLOB_READ_WRITE_TOKEN\s*=|token\s*:\s*process\.env|VERCEL_BLOB_API_VERSION_OVERRIDE|access\s*:\s*['"]public['"]|netlify\.app/);
}
const relay=fs.readFileSync('api/_relay-web.js','utf8');
assert.match(relay,/process\.env\.VERCEL_ENV==='preview'\?'jugest-preview-collector-v3':'jugest'/);
assert.match(relay,/createBlobStore\(name,\{\.\.\.options,root\}\)/);
console.log(`PASS ${Object.keys(manifest.protectedFiles).length} Production hashes, reviewed build refactor hashes, clean jitter files, Preview namespace and diagnostic exclusion`);