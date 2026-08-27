import fs from 'node:fs';
const launcher=fs.readFileSync(new URL('../ana-launcher.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
if(!launcher.includes("const VERSION='4.5.0'")) throw new Error('launcher version mismatch');
if(!launcher.includes('const PARSER_VERSION=4500')) throw new Error('parser version must be 4500 for HANA reparse');
for(const x of ['NIGHT_MONTHS=13','randMs(35000,55000)','15*60000,20*60000','30*60000,40*60000','45*60000,60*60000','id="jacNightStart"','id="jacRelaySend13"','id="jacExport13"']) if(!launcher.includes(x)) throw new Error('night feature missing: '+x);
if(!html.includes('data-page="jdata"')||!html.includes('id="JDATA_OVERVIEW"')||!html.includes('id="JDATA_MACHINES"')||!html.includes('id="JDATA_TABLE"')) throw new Error('data site missing');
if(!html.includes('1台ずつ均等に平均')) throw new Error('one-table-one-vote note missing');
console.log('v4.5.0 inherited features: ok');
