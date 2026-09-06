import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(root,'public');
const BASE='https://jugest.vercel.app/';
const FILES=['index.html','app-v510.js','app-v510.css','core-v510.js','hanahana-judge.js','missing-inference.js','sync-core.js','ana-launcher.js','ana-single-day.js','relay-bridge.html','site.webmanifest','assets/jugest-mark.png'];
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(path.join(out,'assets'),{recursive:true});
for(const rel of FILES){
 const r=await fetch(BASE+rel+'?startup-style-hotfix-source=1',{redirect:'follow',cache:'no-store'});
 if(!r.ok)throw new Error(`source fetch failed ${rel}: ${r.status}`);
 let buf=Buffer.from(await r.arrayBuffer());
 if(rel==='app-v510.js'){
   const text=buf.toString('utf8');
   const old="    this.mount=document.createElement('div');this.mount.id='mount';this.shadowRoot.append(this.mount);";
   const hotfix=`    const link=document.createElement('link');link.rel='stylesheet';link.href='./app-v510.css';\n    this.mount=document.createElement('div');this.mount.id='mount';this.mount.style.visibility='hidden';\n    const showMount=()=>{this.mount.style.visibility=''};\n    const revealMount=()=>{global.clearTimeout(this._styleGateTimer);if(global.requestAnimationFrame)global.requestAnimationFrame(showMount);else showMount()};\n    this._styleGateTimer=global.setTimeout(showMount,2000);\n    link.addEventListener('load',revealMount,{once:true});link.addEventListener('error',revealMount,{once:true});\n    this.shadowRoot.append(link,this.mount);`;
   if(text.includes(old))buf=Buffer.from(text.replace(old,hotfix));
 }
 const p=path.join(out,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,buf);
}
// Approved crystal J icons. Runtime/hotfix stays unchanged; only icon framing is tuned.
for(const rel of ['favicon-32.png','apple-touch-icon.png','icon-192.png']){
 const src=path.join(root,'deploy-assets',rel);if(!fs.existsSync(src))throw new Error(`missing icon ${rel}`);fs.copyFileSync(src,path.join(out,rel));
}
const partsDir=path.join(root,'deploy-assets','icon-512.b64');
const parts=fs.readdirSync(partsDir).filter(x=>/^part-\d+\.txt$/.test(x)).sort();
if(!parts.length)throw new Error('missing icon-512 payload');
const icon512=Buffer.from(parts.map(x=>fs.readFileSync(path.join(partsDir,x),'utf8').trim()).join(''),'base64');
fs.writeFileSync(path.join(out,'icon-512.png'),icon512);

// Home-screen framing tune from the iPhone screenshot: 94% scale, shifted upward ~2%.
// This preserves the exact crystal-J artwork while adding a little breathing room.
for(const [rel,size] of [['favicon-32.png',32],['apple-touch-icon.png',180],['icon-192.png',192],['icon-512.png',512]]){
 const p=path.join(out,rel);
 const original=await sharp(p).ensureAlpha().resize(size,size,{fit:'fill'}).png().toBuffer();
 const inner=Math.round(size*0.94);
 const left=Math.round((size-inner)/2);
 const top=Math.max(0,Math.round(size*0.01));
 const artwork=await sharp(original).resize(inner,inner,{fit:'fill'}).png().toBuffer();
 const tuned=await sharp({create:{width:size,height:size,channels:4,background:{r:8,g:11,b:27,alpha:1}}})
   .composite([{input:artwork,left,top}]).png().toBuffer();
 fs.writeFileSync(p,tuned);
}
for(const rel of ['favicon-32.png','apple-touch-icon.png','icon-192.png','icon-512.png']){
 const b=fs.readFileSync(path.join(out,rel));if(b.length<500)throw new Error(`invalid icon ${rel}`);
}
const html=fs.readFileSync(path.join(out,'index.html'),'utf8');
const app=fs.readFileSync(path.join(out,'app-v510.js'),'utf8');
if(!html.includes('<title>JUGEST v5.1.2</title>'))throw new Error('JUGEST v5.1.2 title missing');
if(!app.includes("const VERSION='5.1.2'"))throw new Error('JUGEST app version mismatch');
if(!app.includes("link.href='./app-v510.css'"))throw new Error('startup style hotfix missing');
console.log('JUGEST v5.1.2 startup hotfix + crystal icon framing tune PASS');
