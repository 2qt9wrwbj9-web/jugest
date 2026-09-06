import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const re=/<script([^>]*)>([\s\S]*?)<\/script>/gi;let m,n=0;
while((m=re.exec(html))){if(/\bsrc\s*=/.test(m[1]))continue;n++;new vm.Script(m[2],{filename:`index-inline-${n}.js`});}
if(!n)throw new Error('no inline script found');
console.log('index inline syntax PASS');
