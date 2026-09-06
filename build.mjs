import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const pdir=path.join(here,'payload');
const chunks=fs.readdirSync(pdir).filter(x=>/^payload-\d+\.txt$/.test(x)).sort();
if(!chunks.length)throw new Error('JUGEST payload missing');
const encoded=chunks.map(x=>fs.readFileSync(path.join(pdir,x),'utf8').trim()).join('');
const packed=Buffer.from(encoded,'base64');
const raw=zlib.brotliDecompressSync(packed);
const payload=JSON.parse(raw.toString('utf8'));
fs.rmSync(path.join(here,'public'),{recursive:true,force:true});
fs.mkdirSync(path.join(here,'public','assets'),{recursive:true});
for(const [rel,b64] of Object.entries(payload)){
  const p=path.join(here,'public',rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,String(b64),'utf8');
}

// Tiny dependency-free PNG generator for deploy-only cosmetic assets.
function crc32(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
function chunk(type,data){const t=Buffer.from(type);const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([len,t,data,crc])}
function png(size){const w=size,h=size,row=w*4+1,raw=Buffer.alloc(row*h);for(let y=0;y<h;y++){const off=y*row;raw[off]=0;for(let x=0;x<w;x++){const i=off+1+x*4;const bg=[18,112,255,255];raw[i]=bg[0];raw[i+1]=bg[1];raw[i+2]=bg[2];raw[i+3]=255;const nx=x/w,ny=y/h;const white=(nx>.22&&nx<.40&&ny>.20&&ny<.72)||(nx>.34&&nx<.75&&ny>.62&&ny<.80)||(nx>.62&&nx<.78&&ny>.28&&ny<.70);if(white){raw[i]=255;raw[i+1]=255;raw[i+2]=255;}}}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))])}
for(const [rel,size] of [['favicon-32.png',32],['apple-touch-icon.png',180],['icon-192.png',192],['icon-512.png',512],['assets/jugest-mark.png',96]])fs.writeFileSync(path.join(here,'public',rel),png(size));

const checks={
 'index.html':'691aeb5a920ace7446289c2557d147f1d79f6698acd9feae0333bc8f8c4e506d',
 'app-v510.js':'d5bcc1dd788ef42e5cdd4c774456b942ba62f76f95796ceaea381c929cf22217',
 'app-v510.css':'5118705d8e483ea19ae110d3e31e431b0a13209a7916f7f702d1acf5626f8fe9',
 'core-v510.js':'b72a71204912278d04a65f5843471d0c975dfe8068878e065cbeb6e93596f2ba',
 'hanahana-judge.js':'d8c540d14aa5a8e06fe5dadd01a29251d9d37e6243d4a136891c8870282740c0',
 'missing-inference.js':'1a44d1192bcbd7ec2863b9dbcad46e2c0301124f68506f3491ba45448d49e98d',
 'sync-core.js':'f20ba76206ee1902dad7688a6378198c7c0a87d00f4f9c23c10463a06ba40eb8',
 'ana-launcher.js':'63de2aca8c359da5f4b36e132054156e9853495e50c04c7d355415a5b4464cf4',
 'ana-single-day.js':'29f0d754876c634cefa07ee00bb377115f23a70da6393c0bbfde1143d805581d',
 'relay-bridge.html':'026d4380f682d06bf3f37d78867093bec0fb11ba62480b39593a7cdeed7610e0',
 'site.webmanifest':'990f3fa2346e744dfb5cce7520af4dc4cce6a79292ae56e0e2e234244dbd8f40'
};
for(const [rel,want] of Object.entries(checks)){const p=path.join(here,'public',rel);const got=createHash('sha256').update(fs.readFileSync(p)).digest('hex');if(got!==want)throw new Error(`hash mismatch ${rel}: ${got}`)}
const html=fs.readFileSync(path.join(here,'public/index.html'),'utf8');
const app=fs.readFileSync(path.join(here,'public/app-v510.js'),'utf8');
const launcher=fs.readFileSync(path.join(here,'public/ana-launcher.js'),'utf8');
if(!html.includes('<title>JUGEST v5.1.2</title>'))throw new Error('JUGEST v5.1.2 title missing');
if(!app.includes("const VERSION='5.1.2'"))throw new Error('JUGEST app version mismatch');
if(launcher.includes('jugglerest.netlify.app')||launcher.includes('jugest.netlify.app'))throw new Error('Netlify launcher fallback detected');
for(const file of ['package.json','vercel.json','api/_blob-store.js','api/_node-web.js','api/_relay-web.js','api/_sync-web.js','api/relay.js','api/sync.js']){const s=fs.readFileSync(path.join(here,file),'utf8');if(/@netlify\/blobs|jugglerest\.netlify\.app|netlify\/functions/i.test(s))throw new Error(`Netlify runtime dependency in ${file}`)}
console.log(`JUGEST v5.1.2 Vercel-only build PASS: ${Object.keys(payload).length} exact runtime files + generated icons`);
