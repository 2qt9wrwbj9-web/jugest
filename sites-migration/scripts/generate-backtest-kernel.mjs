import{readFileSync,writeFileSync}from'node:fs';
const source=readFileSync(new URL('../upstream/vps/src/jobs/backtest.mjs',import.meta.url),'utf8'),start=source.indexOf('function rankSplit('),end=source.indexOf('\nasync function main()',start);
if(start<0||end<0)throw Error('missing fixed BACKTEST kernel anchors');
writeFileSync(new URL('../lib/analysis/generated-backtest-kernel.mjs',import.meta.url),"// Exact pure ranking and SQLite persistence helpers from the frozen BACKTEST worker.\nimport{scoreSample}from'../../upstream/vps/src/research/model-search.mjs';\nimport{canonicalJson}from'../../upstream/vps/src/canonical-json.mjs';\n"+source.slice(start,end)+"\nexport{rankSplit,persistSplit};\n");
