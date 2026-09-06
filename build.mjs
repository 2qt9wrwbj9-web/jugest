import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inflateSync, deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(root,'public');
const FILES=['index.html','app-v510.js','app-v510.css','core-v510.js','hanahana-judge.js','missing-inference.js','sync-core.js','ana-launcher.js','ana-single-day.js','relay-bridge.html','site.webmanifest','assets/jugest-mark.png'];
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(path.join(out,'assets'),{recursive:true});
for(const rel of FILES){
 const buf=fs.readFileSync(path.join(root,rel));
 const p=path.join(out,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,buf);
}

for(const rel of ['favicon-32.png','icon-192.png']){
 const src=path.join(root,'deploy-assets',rel);if(!fs.existsSync(src))throw new Error(`missing icon ${rel}`);fs.copyFileSync(src,path.join(out,rel));
}

function crc32(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function assertValidPng(buf,wantW,wantH){
 const sig=Buffer.from([137,80,78,71,13,10,26,10]);if(buf.length<33||!buf.subarray(0,8).equals(sig))throw new Error('apple icon invalid PNG signature');
 let p=8,seenIHDR=false,seenIEND=false;while(p+12<=buf.length){const len=buf.readUInt32BE(p),end=p+12+len;if(end>buf.length)throw new Error('apple icon truncated PNG chunk');const type=buf.subarray(p+4,p+8),data=buf.subarray(p+8,p+8+len),got=buf.readUInt32BE(p+8+len),want=crc32(Buffer.concat([type,data]));if(got!==want)throw new Error(`apple icon PNG CRC mismatch: ${type.toString('ascii')}`);if(type.toString('ascii')==='IHDR'){if(data.readUInt32BE(0)!==wantW||data.readUInt32BE(4)!==wantH)throw new Error('apple icon wrong size');seenIHDR=true;}p=end;if(type.toString('ascii')==='IEND'){seenIEND=true;break;}}if(!seenIHDR||!seenIEND)throw new Error('apple icon incomplete PNG');
}
function pngChunk(type,data){const t=Buffer.from(type);const out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);t.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([t,data])),8+data.length);return out;}
function shiftRgbPngUp(buf,dy){
 let p=8,ihdr,idats=[];while(p+12<=buf.length){const len=buf.readUInt32BE(p),type=buf.subarray(p+4,p+8).toString('ascii'),data=buf.subarray(p+8,p+8+len);if(type==='IHDR')ihdr=Buffer.from(data);if(type==='IDAT')idats.push(Buffer.from(data));p+=12+len;if(type==='IEND')break;}
 const w=ihdr.readUInt32BE(0),h=ihdr.readUInt32BE(4),bit=ihdr[8],color=ihdr[9];if(bit!==8||color!==2)throw new Error(`unsupported apple icon PNG format ${bit}/${color}`);const bpp=3,stride=w*bpp,raw=inflateSync(Buffer.concat(idats)),rows=[];let prev=Buffer.alloc(stride),off=0;
 for(let y=0;y<h;y++){const filter=raw[off++],scan=raw.subarray(off,off+stride);off+=stride;const row=Buffer.alloc(stride);for(let x=0;x<stride;x++){const a=x>=bpp?row[x-bpp]:0,b=prev[x],c=x>=bpp?prev[x-bpp]:0;let v=scan[x];if(filter===1)v=(v+a)&255;else if(filter===2)v=(v+b)&255;else if(filter===3)v=(v+Math.floor((a+b)/2))&255;else if(filter===4){const q=a+b-c,pa=Math.abs(q-a),pb=Math.abs(q-b),pc=Math.abs(q-c);v=(v+(pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255;}else if(filter!==0)throw new Error(`unsupported PNG filter ${filter}`);row[x]=v;}rows.push(row);prev=row;}
 const shifted=[];for(let y=0;y<h;y++){const src=y+dy;shifted.push(Buffer.from(src<h?rows[src]:rows[h-1]));}
 const encoded=Buffer.concat(shifted.map(r=>Buffer.concat([Buffer.from([0]),r])));return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',ihdr),pngChunk('IDAT',deflateSync(encoded,{level:9})),pngChunk('IEND',Buffer.alloc(0))]);
}

const originalDir=path.join(root,'deploy-assets','apple-touch-icon-tuned.b64');
const repairDir=path.join(root,'deploy-assets','apple-touch-icon-tuned-repair');
const tunedOrder=[path.join(originalDir,'part-00.txt'),path.join(originalDir,'part-01.txt'),path.join(repairDir,'part-00.txt'),path.join(repairDir,'part-01.txt'),path.join(repairDir,'part-02.txt'),path.join(repairDir,'part-03.txt'),path.join(originalDir,'part-03.txt')];
for(const p of tunedOrder)if(!fs.existsSync(p))throw new Error(`tuned apple-touch-icon payload missing: ${path.basename(p)}`);
const appleBase=Buffer.from(tunedOrder.map(p=>fs.readFileSync(p,'utf8').trim()).join(''),'base64');
const appleHash=createHash('sha256').update(appleBase).digest('hex');if(appleHash!=='ac417fad2771c1b6a25894087c3e0d249359d217e528fb6893a38dd53c2b9deb')throw new Error(`tuned apple-touch-icon hash mismatch: ${appleHash}`);
assertValidPng(appleBase,180,180);
const apple=shiftRgbPngUp(appleBase,5);assertValidPng(apple,180,180);fs.writeFileSync(path.join(out,'apple-touch-icon.png'),apple);

const partsDir=path.join(root,'deploy-assets','icon-512.b64');const parts=fs.readdirSync(partsDir).filter(x=>/^part-\d+\.txt$/.test(x)).sort();if(!parts.length)throw new Error('JUGEST icon-512 payload missing');fs.writeFileSync(path.join(out,'icon-512.png'),Buffer.from(parts.map(x=>fs.readFileSync(path.join(partsDir,x),'utf8').trim()).join(''),'base64'));
for(const rel of ['favicon-32.png','apple-touch-icon.png','icon-192.png','icon-512.png']){if(fs.readFileSync(path.join(out,rel)).length<1000)throw new Error(`invalid icon ${rel}`);}

let html=fs.readFileSync(path.join(out,'index.html'),'utf8');
html=html.replace(/apple-touch-icon\.png(?:\?[^"']*)?/g,'apple-touch-icon.png?v=512-icon-tune-3');
const coverageHelperAnchor='async function v510RefreshCollector(){';
const coverageHelper=`function v510CollectorCoveragePayload(){\n const grouped=new Map();\n for(const d of externalDays||[]){\n  const shop=canonicalExternalShopName(d?.shop||'').trim(),date=String(d?.date||'');if(!shop||!/^20\\d{2}-\\d{2}-\\d{2}$/.test(date))continue;\n  let row=grouped.get(shop);if(!row){row={shop,dates:new Set()};grouped.set(shop,row)}row.dates.add(date);\n }\n return [...grouped.values()].slice(0,100).map(r=>({shop:r.shop,dates:[...r.dates].sort().slice(-370)}));\n}\n\n`;
if((html.split(coverageHelperAnchor).length-1)!==1)throw new Error('Collector coverage helper anchor missing');
html=html.replace(coverageHelperAnchor,coverageHelper+coverageHelperAnchor);
const sinceRevisionAnchor='sinceRevision:Math.max(0,+collectorSyncState.revision||0)}';
const coverageStatusReplacement='sinceRevision:Math.max(0,+collectorSyncState.revision||0),localCoverage:v510CollectorCoveragePayload()}';
const coverageStatusHits=html.split(sinceRevisionAnchor).length-1;if(coverageStatusHits<5)throw new Error(`Collector status coverage anchor count ${coverageStatusHits}`);
html=html.replaceAll(sinceRevisionAnchor,coverageStatusReplacement);
fs.writeFileSync(path.join(out,'index.html'),html);

let css=fs.readFileSync(path.join(out,'app-v510.css'),'utf8');
const chromeTransforms=[
 ['.topbar{position:fixed;z-index:50;top:0;left:50%;transform:translateX(-50%);width:min(100%,560px);','.topbar{position:fixed;z-index:50;top:0;left:0;right:0;margin:0 auto;width:min(100%,560px);','topbar fixed centering'],
 ['.bottom-nav{position:fixed;z-index:50;bottom:0;left:50%;transform:translateX(-50%);width:min(100%,560px);','.bottom-nav{position:fixed;z-index:50;bottom:0;left:0;right:0;margin:0 auto;width:min(100%,560px);','bottom navigation fixed centering'],
];
for(const [from,to,label] of chromeTransforms){const hits=css.split(from).length-1;if(hits!==1)throw new Error(`${label} anchor count ${hits}`);css=css.replace(from,to)}
fs.writeFileSync(path.join(out,'app-v510.css'),css);

let app=fs.readFileSync(path.join(out,'app-v510.js'),'utf8');
const manualCollectorStartDate='<label><small>取得開始日</small><input data-store-start type="date" value="${esc(e.startDate)}"></label>';
if(!app.includes(manualCollectorStartDate))throw new Error('Collector start-date control anchor missing');
app=app.replace(manualCollectorStartDate,'');
const collectorSetupOpen='<section class="panel sync-setup"><h2>';
const compactCollectorSetupOpen=`<details class="panel sync-setup collector-link-card" \${d.linked?'':'open'}><summary class="collector-link-summary">`;
const collectorSetupHeadingClose='</h2>\n    <p>端末同期とは別の、取得データをJUGESTへ送るための連携です。</p>';
const compactCollectorSetupHeadingClose=`\${d.linked?'　設定を表示':''}</summary>\n    <p>端末同期とは別の、取得データをJUGESTへ送るための連携です。</p>`;
const collectorSetupClose='</section>\n    <div class="data-kpis">';
const compactCollectorSetupClose='</details>\n    <div class="data-kpis">';
for(const [from,to,label] of [[collectorSetupOpen,compactCollectorSetupOpen,'Collector compact setup open'],[collectorSetupHeadingClose,compactCollectorSetupHeadingClose,'Collector compact setup heading'],[collectorSetupClose,compactCollectorSetupClose,'Collector compact setup close']]){
 const hits=app.split(from).length-1;if(hits!==1)throw new Error(`${label} anchor count ${hits}`);app=app.replace(from,to);
}
fs.writeFileSync(path.join(out,'app-v510.js'),app);
if(!html.includes('<title>JUGEST v5.1.2</title>'))throw new Error('JUGEST v5.1.2 title missing');if(!app.includes("const VERSION='5.1.2'"))throw new Error('JUGEST app version mismatch');if(!app.includes("link.href='./app-v510.css'"))throw new Error('startup style hotfix missing');console.log('JUGEST v5.1.2 Collector coverage + fixed chrome + startup/icon hotfix PASS');
