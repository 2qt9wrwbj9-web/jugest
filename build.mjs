import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

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

// Keep the approved crystal-J design. Only the iOS home-screen framing is tuned.
for(const rel of ['favicon-32.png','icon-192.png']){
 const src=path.join(root,'deploy-assets',rel);if(!fs.existsSync(src))throw new Error(`missing icon ${rel}`);fs.copyFileSync(src,path.join(out,rel));
}

const tunedDir=path.join(root,'deploy-assets','apple-touch-icon-tuned.b64');
const tunedParts=fs.readdirSync(tunedDir).filter(x=>/^part-\d+\.txt$/.test(x)).sort();
if(!tunedParts.length)throw new Error('tuned apple-touch-icon payload missing');
const apple=Buffer.from(tunedParts.map(x=>fs.readFileSync(path.join(tunedDir,x),'utf8').trim()).join(''),'base64');
const appleHash=createHash('sha256').update(apple).digest('hex');
if(appleHash!=='ac417fad2771c1b6a25894087c3e0d249359d217e528fb6893a38dd53c2b9deb')throw new Error(`tuned apple-touch-icon hash mismatch: ${appleHash}`);
fs.writeFileSync(path.join(out,'apple-touch-icon.png'),apple);

const partsDir=path.join(root,'deploy-assets','icon-512.b64');
const parts=fs.readdirSync(partsDir).filter(x=>/^part-\d+\.txt$/.test(x)).sort();
if(!parts.length)throw new Error('JUGEST icon-512 payload missing');
const icon512=Buffer.from(parts.map(x=>fs.readFileSync(path.join(partsDir,x),'utf8').trim()).join(''),'base64');
fs.writeFileSync(path.join(out,'icon-512.png'),icon512);

for(const rel of ['favicon-32.png','apple-touch-icon.png','icon-192.png','icon-512.png']){
 const b=fs.readFileSync(path.join(out,rel));if(b.length<1000)throw new Error(`invalid icon ${rel}`);
}

// Bust iOS/Safari icon URL cache for the tuned asset without changing app runtime behavior.
let html=fs.readFileSync(path.join(out,'index.html'),'utf8');
html=html.replace(/apple-touch-icon\.png(?:\?[^"']*)?/g,'apple-touch-icon.png?v=512-icon-tune-2');
fs.writeFileSync(path.join(out,'index.html'),html);

const app=fs.readFileSync(path.join(out,'app-v510.js'),'utf8');
if(!html.includes('<title>JUGEST v5.1.2</title>'))throw new Error('JUGEST v5.1.2 title missing');
if(!app.includes("const VERSION='5.1.2'"))throw new Error('JUGEST app version mismatch');
if(!app.includes("link.href='./app-v510.css'"))throw new Error('startup style hotfix missing');
console.log('JUGEST v5.1.2 startup hotfix + tuned iOS icon build PASS');
