import {createHash,randomBytes} from 'node:crypto';
import {mkdir,rename,rm,writeFile} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {gzip} from 'node:zlib';
import {promisify} from 'node:util';

const gzipAsync=promisify(gzip);

function safeSegment(value,name){
  const s=String(value??'').trim();
  if(!s||s==='.'||s==='..'||s.includes('..')||s.includes('/')||s.includes('\\')||s.includes('\0'))throw new TypeError(`${name} must be a safe path segment`);
  return s;
}
function validDate(value){
  const s=String(value??'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new TypeError('date must be YYYY-MM-DD');
  const d=new Date(`${s}T00:00:00Z`);
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw new TypeError('date must be a real YYYY-MM-DD date');
  return s;
}
function withinRoot(root,target){
  const base=resolve(root),full=resolve(target);
  return full===base||full.startsWith(base+sep);
}

export async function archiveRawHtml({root,storeId,date,html}={}){
  if(typeof root!=='string'||!root.trim())throw new TypeError('root is required');
  storeId=safeSegment(storeId,'storeId');date=validDate(date);
  if(typeof html!=='string')throw new TypeError('html must be a string');
  const raw=Buffer.from(html,'utf8');
  const sha256=createHash('sha256').update(raw).digest('hex');
  const year=date.slice(0,4),month=date.slice(5,7);
  const dir=join(resolve(root),storeId,year,month);
  const path=join(dir,`${date}.html.gz`);
  if(!withinRoot(root,path))throw new Error('archive path escaped root');
  await mkdir(dir,{recursive:true,mode:0o700});
  const zipped=await gzipAsync(raw,{level:9});
  const tmp=join(dir,`.${date}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  try{
    await writeFile(tmp,zipped,{mode:0o600,flag:'wx'});
    await rename(tmp,path);
  }catch(error){
    try{await rm(tmp,{force:true})}catch{}
    throw error;
  }
  return {path,sha256,bytes:raw.byteLength,compressedBytes:zipped.byteLength};
}
