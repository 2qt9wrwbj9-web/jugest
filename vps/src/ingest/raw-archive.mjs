import {createHash,randomBytes} from 'node:crypto';
import {mkdir,writeFile,link,rm,stat} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {gzip} from 'node:zlib';
import {promisify} from 'node:util';

const gzipAsync=promisify(gzip);

function requiredText(value,name){
  const text=String(value??'').trim();
  if(!text)throw new TypeError(`${name} is required`);
  return text;
}
function validDate(value){
  const text=requiredText(value,'date');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))throw new TypeError('date must be YYYY-MM-DD');
  const parsed=new Date(`${text}T00:00:00Z`);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==text)throw new TypeError('date must be a real YYYY-MM-DD date');
  return text;
}
function inside(root,target){
  const base=resolve(root),full=resolve(target);
  return full===base||full.startsWith(base+sep);
}
function storeDirectory(storeId){
  return `s-${createHash('sha256').update(requiredText(storeId,'storeId'),'utf8').digest('hex').slice(0,24)}`;
}

export async function archiveRawArtifact({root,storeId,date,rawText}={}){
  root=requiredText(root,'root');
  date=validDate(date);
  if(typeof rawText!=='string')throw new TypeError('rawText must be a string');
  const raw=Buffer.from(rawText,'utf8');
  const sha256=createHash('sha256').update(raw).digest('hex');
  const year=date.slice(0,4),month=date.slice(5,7);
  const dir=join(resolve(root),storeDirectory(storeId),year,month);
  const path=join(dir,`${date}.${sha256}.html.gz`);
  if(!inside(root,path))throw new Error('archive path escaped root');
  await mkdir(dir,{recursive:true,mode:0o700});

  try{
    const info=await stat(path);
    return {path,sha256,bytes:raw.byteLength,compressedBytes:info.size,created:false};
  }catch(error){if(error?.code!=='ENOENT')throw error}

  const zipped=await gzipAsync(raw,{level:9});
  const tmp=join(dir,`.${date}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  try{
    await writeFile(tmp,zipped,{mode:0o600,flag:'wx'});
    try{
      await link(tmp,path);
      return {path,sha256,bytes:raw.byteLength,compressedBytes:zipped.byteLength,created:true};
    }catch(error){
      if(error?.code!=='EEXIST')throw error;
      const info=await stat(path);
      return {path,sha256,bytes:raw.byteLength,compressedBytes:info.size,created:false};
    }
  }finally{
    try{await rm(tmp,{force:true})}catch{}
  }
}
