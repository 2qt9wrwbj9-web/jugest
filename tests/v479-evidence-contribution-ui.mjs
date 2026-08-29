import fs from 'node:fs';
const a=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),b=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
if(a!==b)throw Error('root/public mismatch');
const titleVersion=a.match(/ジャグラー設定判別 v(\d+\.\d+\.\d+)/)?.[1];
const backupVersion=a.match(/appVersion:"(\d+\.\d+\.\d+)"/)?.[1];
if(!titleVersion||backupVersion!==titleVersion)throw Error('release version sync broken');
for(const n of ['function v4RootContributionAuditHtml(r)','根拠寄与を分解','contributionES','contributionP4','実用順位の説明で、厳格P4+の確率計算とは別','weights=[1,.78,.62,.50,.40,.33,.27,.22,.18,.15]','if(!old||quality>old.quality)fam.set(f,{c,quality})','effectES:bruteClamp(effectES,-.85,.85)','p4Effect:bruteClamp(p4Effect,-.32,.32)'])if(!a.includes(n))throw Error('v479 guard: '+n);
console.log('v4.7.9 evidence contribution UI contract: ok');
