#!/usr/bin/env node
// Read-only, restricted offline export from legacy private Vercel Blob.
// Never print or transmit share IDs, auth tokens, encrypted payloads or paths.
import {realpathSync,statSync,openSync,writeSync,fsyncSync,closeSync,unlinkSync} from 'node:fs';
import {dirname,resolve,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {validateArchive,SYNC_NAMESPACE} from './sync-import-offline.mjs';

const PREFIX=SYNC_NAMESPACE+'/';
const hash=data=>createHash('sha256').update(data).digest('hex');
function sourceName(item){return String(item?.pathname??'')}
function validPathname(name){return name.startsWith(PREFIX)&&(name.slice(PREFIX.length).startsWith('sync/')||
 name.slice(PREFIX.length).startsWith('sync-commit/'))}
function secureDir(pathname){
 if(!isAbsolute(pathname))throw new Error('export_absolute_path_required');
 const dest=resolve(pathname),dir=realpathSync(dirname(dest));
 if((statSync(dir).mode&0o077)!==0)throw new Error('export_directory_requires_0700');
 return dest;
}
async function collectNames(list){
 let cursor=undefined,pages=0;const entries=[],seen=new Set();let skipped=0;
 do{
  const page=await list({prefix:PREFIX,cursor,limit:1000});
  if(!page||!Array.isArray(page.blobs))throw new Error('export_list_failed');
  for(const obj of page.blobs){
   const name=sourceName(obj);
   if(!name.startsWith(PREFIX))throw new Error('export_wrong_prefix');
   if(!validPathname(name)){if(name.slice(PREFIX.length).startsWith('sync-upload/')){skipped++;continue}throw new Error('export_unrecognized_source_key')}
   if(seen.has(name))throw new Error('export_duplicate_source_key');
   seen.add(name);entries.push(name);
  }
  cursor=page.cursor||undefined;
  if(++pages>1000)throw new Error('export_pagination_limit');
 }while(cursor);
 return {entries:entries.sort(),skipped};
}
export async function buildLegacyArchive({list,get}){
 if(typeof list!=='function'||typeof get!=='function')throw new Error('export_source_functions_required');
 const first=await collectNames(list),objects=[];let totalBytes=0;
 for(const pathname of first.entries){
  const result=await get(pathname,{access:'private',useCache:false});
  if(!result||result.statusCode!==200||!result.stream)throw new Error('export_missing_or_unreadable_blob');
  const value=await new Response(result.stream).text();
  totalBytes+=Buffer.byteLength(value,'utf8');
  if(totalBytes>512*1024*1024)throw new Error('export_source_too_large');
  objects.push({key:pathname.slice(PREFIX.length),value});
 }
 const second=await collectNames(list);
 if(JSON.stringify(first.entries)!==JSON.stringify(second.entries))throw new Error('export_inventory_changed');
 // At least each head must still match its captured content. Full source write
 // freeze + a second identical export are required to rule out later writes.
 for(const {key,value} of objects.filter(x=>x.key.startsWith('sync/'))){
  const r=await get(PREFIX+key,{access:'private',useCache:false});
  if(!r||r.statusCode!==200||!r.stream||hash(await new Response(r.stream).text())!==hash(value))
   throw new Error('export_head_changed');
 }
 const archive={format:'jugest-legacy-sync-v1',namespace:SYNC_NAMESPACE,objects};
 const summary=validateArchive(archive);
 return{archive,summary:{shareCount:summary.shareCount,recordCount:summary.recordCount,
  skippedTransient:first.skipped,fingerprint:summary.fingerprint}};
}
export function writePrivateArchive(pathname,archive){
 const dest=secureDir(pathname),data=JSON.stringify(archive);
 const fd=openSync(dest,'wx',0o600);
 try{
    const bytes=Buffer.from(data);let offset=0;
    while(offset<bytes.length){const written=writeSync(fd,bytes,offset,Math.min(1048576,bytes.length-offset));if(written<=0)throw new Error('export_short_write');offset+=written}
    fsyncSync(fd);
  }catch(e){closeSync(fd);unlinkSync(dest);throw e}
 closeSync(fd);return{bytes:Buffer.byteLength(data)};
}
if(process.argv[1]&&realpathSync(process.argv[1])===realpathSync(new URL(import.meta.url))){
 try{
  if(process.argv.length!==4||process.argv[2]!=='--output')throw new Error('Usage: sync-export-blob.mjs --output /private-dir/export.json');
  // The token must be provided by the platform's protected environment.
  // Never include the token itself in diagnostics or CLI options.
  if(!process.env.BLOB_READ_WRITE_TOKEN)throw new Error('legacy_blob_connection_unavailable');
  const {get,list}=await import('@vercel/blob');
  const {archive,summary}=await buildLegacyArchive({get,list});
  writePrivateArchive(process.argv[3],archive);
  console.log(JSON.stringify({ok:true,...summary}));
 }catch(error){console.error(String(error?.message??'sync_export_failed'));process.exitCode=1}
}
