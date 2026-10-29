import{readFileSync,writeFileSync}from'node:fs';
const source=readFileSync(new URL('../upstream/vps/src/research/holdout.mjs',import.meta.url),'utf8'),a=source.indexOf('function rankRows('),b=source.indexOf('\nfunction persistHoldoutRun(',a);
if(a<0||b<0)throw Error('fixed holdout anchors missing');
writeFileSync(new URL('../lib/analysis/generated-holdout-kernel.mjs',import.meta.url),"// Exact rankRows/better from frozen holdout.mjs; generated, never approximate.\nimport{scoreSample}from'../../upstream/vps/src/research/model-search.mjs';\n"+source.slice(a,b)+'\nexport{rankRows,better};\n');
