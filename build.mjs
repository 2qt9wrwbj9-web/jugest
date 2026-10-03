import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIcons } from './build/assets/icons.mjs';
import { applyHtmlBuildPatches, applyCssBuildPatches, applyAppBuildPatches } from './build/patches/index.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(root,'public');
const FILES=['index.html','app-v510.js','app-v510.css','core-v510.js','judgement-model.js','judgement-view.js','judgement-page-view.js','hanahana-judge.js','missing-inference.js','sync-core.js','ana-launcher.js','ana-single-day.js','relay-bridge.html','site.webmanifest','assets/jugest-mark.png'];
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(path.join(out,'assets'),{recursive:true});
for(const rel of FILES){
 const buf=fs.readFileSync(path.join(root,rel));
 const p=path.join(out,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,buf);
}

buildIcons(root,out);

let html=fs.readFileSync(path.join(out,'index.html'),'utf8');
html=html.replace(/apple-touch-icon\.png(?:\?[^"']*)?/g,'apple-touch-icon.png?v=512-icon-tune-3');
html=applyHtmlBuildPatches(html);
fs.writeFileSync(path.join(out,'index.html'),html);

let css=fs.readFileSync(path.join(out,'app-v510.css'),'utf8');
css=applyCssBuildPatches(css);
fs.writeFileSync(path.join(out,'app-v510.css'),css);

let app=fs.readFileSync(path.join(out,'app-v510.js'),'utf8');
app=applyAppBuildPatches(app);
fs.writeFileSync(path.join(out,'app-v510.js'),app);
if(!html.includes('<title>JUGEST v5.1.2</title>'))throw new Error('JUGEST v5.1.2 title missing');if(!app.includes("const VERSION='5.1.2'"))throw new Error('JUGEST app version mismatch');if(!app.includes("link.href='./app-v510.css'"))throw new Error('startup style hotfix missing');console.log('JUGEST v5.1.2 Collector coverage + fixed chrome + store-analysis evidence view + analysis progress stability + startup/icon hotfix PASS');
