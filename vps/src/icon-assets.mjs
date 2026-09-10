import path from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateSync,deflateSync} from 'node:zlib';

const PNG_SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
const APPLE_SOURCE_SHA256='ac417fad2771c1b6a25894087c3e0d249359d217e528fb6893a38dd53c2b9deb';
const ICON_NAMES=new Set(['favicon-32.png','apple-touch-icon.png','icon-192.png','icon-512.png']);
const cache=new Map();

function crc32(buf){
  let c=0xffffffff;
  for(const b of buf){
    c^=b;
    for(let i=0;i<8;i+=1)c=(c>>>1)^((c&1)?0xedb88320:0);
  }
  return(c^0xffffffff)>>>0;
}

function pngChunk(type,data){
  const t=Buffer.from(type);
  const out=Buffer.alloc(12+data.length);
  out.writeUInt32BE(data.length,0);
  t.copy(out,4);
  data.copy(out,8);
  out.writeUInt32BE(crc32(Buffer.concat([t,data])),8+data.length);
  return out;
}

function assertValidPng(buf,wantW,wantH){
  if(buf.length<33||!buf.subarray(0,8).equals(PNG_SIGNATURE))throw new Error('invalid PNG signature');
  let p=8,seenIHDR=false,seenIEND=false;
  while(p+12<=buf.length){
    const len=buf.readUInt32BE(p),end=p+12+len;
    if(end>buf.length)throw new Error('truncated PNG chunk');
    const type=buf.subarray(p+4,p+8),data=buf.subarray(p+8,p+8+len);
    const got=buf.readUInt32BE(p+8+len),want=crc32(Buffer.concat([type,data]));
    if(got!==want)throw new Error(`PNG CRC mismatch: ${type.toString('ascii')}`);
    if(type.toString('ascii')==='IHDR'){
      if(data.readUInt32BE(0)!==wantW||data.readUInt32BE(4)!==wantH)throw new Error('PNG dimensions mismatch');
      seenIHDR=true;
    }
    p=end;
    if(type.toString('ascii')==='IEND'){seenIEND=true;break;}
  }
  if(!seenIHDR||!seenIEND)throw new Error('incomplete PNG');
}

function shiftRgbPngUp(buf,dy){
  let p=8,ihdr,idats=[];
  while(p+12<=buf.length){
    const len=buf.readUInt32BE(p),type=buf.subarray(p+4,p+8).toString('ascii'),data=buf.subarray(p+8,p+8+len);
    if(type==='IHDR')ihdr=Buffer.from(data);
    if(type==='IDAT')idats.push(Buffer.from(data));
    p+=12+len;
    if(type==='IEND')break;
  }
  if(!ihdr)throw new Error('apple icon missing IHDR');
  const w=ihdr.readUInt32BE(0),h=ihdr.readUInt32BE(4),bit=ihdr[8],color=ihdr[9];
  if(bit!==8||color!==2)throw new Error(`unsupported apple icon PNG format ${bit}/${color}`);
  const bpp=3,stride=w*bpp,raw=inflateSync(Buffer.concat(idats)),rows=[];
  let prev=Buffer.alloc(stride),off=0;
  for(let y=0;y<h;y+=1){
    const filter=raw[off++],scan=raw.subarray(off,off+stride);off+=stride;
    const row=Buffer.alloc(stride);
    for(let x=0;x<stride;x+=1){
      const a=x>=bpp?row[x-bpp]:0,b=prev[x],c=x>=bpp?prev[x-bpp]:0;
      let v=scan[x];
      if(filter===1)v=(v+a)&255;
      else if(filter===2)v=(v+b)&255;
      else if(filter===3)v=(v+Math.floor((a+b)/2))&255;
      else if(filter===4){
        const q=a+b-c,pa=Math.abs(q-a),pb=Math.abs(q-b),pc=Math.abs(q-c);
        v=(v+(pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255;
      }else if(filter!==0)throw new Error(`unsupported PNG filter ${filter}`);
      row[x]=v;
    }
    rows.push(row);prev=row;
  }
  const shifted=[];
  for(let y=0;y<h;y+=1){
    const src=y+dy;
    shifted.push(Buffer.from(src<h?rows[src]:rows[h-1]));
  }
  const encoded=Buffer.concat(shifted.map(row=>Buffer.concat([Buffer.from([0]),row])));
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR',ihdr),
    pngChunk('IDAT',deflateSync(encoded,{level:9})),
    pngChunk('IEND',Buffer.alloc(0))
  ]);
}

async function readBase64Parts(dir){
  const names=(await readdir(dir)).filter(name=>/^part-\d+\.txt$/.test(name)).sort();
  if(!names.length)throw new Error(`icon payload missing: ${dir}`);
  const parts=[];
  for(const name of names)parts.push((await readFile(path.join(dir,name),'utf8')).trim());
  return Buffer.from(parts.join(''),'base64');
}

async function buildAppleIcon(rootDir){
  const originalDir=path.join(rootDir,'deploy-assets','apple-touch-icon-tuned.b64');
  const repairDir=path.join(rootDir,'deploy-assets','apple-touch-icon-tuned-repair');
  const order=[
    path.join(originalDir,'part-00.txt'),
    path.join(originalDir,'part-01.txt'),
    path.join(repairDir,'part-00.txt'),
    path.join(repairDir,'part-01.txt'),
    path.join(repairDir,'part-02.txt'),
    path.join(repairDir,'part-03.txt'),
    path.join(originalDir,'part-03.txt')
  ];
  const parts=[];
  for(const file of order)parts.push((await readFile(file,'utf8')).trim());
  const base=Buffer.from(parts.join(''),'base64');
  const hash=createHash('sha256').update(base).digest('hex');
  if(hash!==APPLE_SOURCE_SHA256)throw new Error(`apple icon source hash mismatch: ${hash}`);
  assertValidPng(base,180,180);
  const icon=shiftRgbPngUp(base,5);
  assertValidPng(icon,180,180);
  return icon;
}

async function loadIcon(rootDir,name){
  if(name==='favicon-32.png'||name==='icon-192.png')return readFile(path.join(rootDir,'deploy-assets',name));
  if(name==='icon-512.png')return readBase64Parts(path.join(rootDir,'deploy-assets','icon-512.b64'));
  if(name==='apple-touch-icon.png')return buildAppleIcon(rootDir);
  return null;
}

export async function getGeneratedIcon(rootDir,name){
  if(!ICON_NAMES.has(name))return null;
  const key=`${path.resolve(rootDir)}\0${name}`;
  if(!cache.has(key))cache.set(key,loadIcon(path.resolve(rootDir),name));
  try{
    const icon=await cache.get(key);
    if(!Buffer.isBuffer(icon)||icon.length<1000||!icon.subarray(0,8).equals(PNG_SIGNATURE))throw new Error(`invalid generated icon: ${name}`);
    return icon;
  }catch(error){
    cache.delete(key);
    throw error;
  }
}
