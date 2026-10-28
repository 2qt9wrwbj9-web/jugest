import{readFileSync,writeFileSync}from'node:fs';
const original=readFileSync(new URL('../upstream/vps/src/research/backtest.mjs',import.meta.url),'utf8'),anchor="import {hashCanonical} from '../canonical-json.mjs';";
if(!original.startsWith(anchor))throw Error('fixed dataset hash import changed');
writeFileSync(new URL('../lib/analysis/generated-research-dataset.mjs',import.meta.url),"// Original research dataset mathematics unchanged; canonical SHA-256 bytes are streamed.\nimport{canonicalDigest}from'./canonical-stream.mjs';\nconst hashCanonical=value=>canonicalDigest(value).hash;\n"+original.slice(anchor.length));
