#!/usr/bin/env node
import {readFileSync,realpathSync,existsSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {openPachinkoDatabase,migratePachinko} from '../src/pachinko/schema.mjs';
import {importPachinkoSnapshot,reestimatePachinkoRecords,getPachinkoMatrix} from '../src/pachinko/store.mjs';
import {collectPachinkoOnce} from '../src/pachinko/collector.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
function args(argv){const [command,...rest]=argv,out={command};for(let i=0;i<rest.length;i++){const token=rest[i];if(!token.startsWith('--'))throw new Error(`unexpected_argument:${token}`);const key=token.slice(2);if(key==='allow-production'){out[key]=true;continue}const value=rest[++i];if(value===undefined||value.startsWith('--'))throw new Error(`missing_value:${key}`);out[key]=value}return out}
function isInside(child,parent){const c=path.resolve(child),p=path.resolve(parent),prefix=p.endsWith(path.sep)?p:`${p}${path.sep}`;return c===p||c.startsWith(prefix)}
function destinationIdentity(value){const resolved=path.resolve(value);let cursor=resolved;const tail=[];while(!existsSync(cursor)){const parent=path.dirname(cursor);if(parent===cursor)break;tail.unshift(path.basename(cursor));cursor=parent}try{return path.join(realpathSync(cursor),...tail)}catch{return resolved}}
export function assertSafeWritablePath(value,{allowProduction=false,requiredCode='explicit_path_required'}={}){
  if(!value)throw new Error(requiredCode);const resolved=path.resolve(value),identity=destinationIdentity(resolved);
  if(!allowProduction&&(['/var/lib/jugest','/opt/jugest'].some(root=>isInside(identity,root))))throw new Error('production_path_requires_--allow-production');
  return resolved;
}
export function assertSafeDbPath(dbPath,{allowProduction=false}={}){
  return assertSafeWritablePath(dbPath,{allowProduction,requiredCode:'explicit_--db_required'});
}
function readRaw(file){const bytes=readFileSync(file);return file.endsWith('.gz')?gunzipSync(bytes).toString('utf8'):bytes.toString('utf8')}
function readJson(file){return JSON.parse(readFileSync(file,'utf8'))}
function output(value){process.stdout.write(`${JSON.stringify(value,null,2)}\n`)}
function snapshotInput(file,provenance={},observedAt=undefined){const rawText=readRaw(file),payload=JSON.parse(rawText);return {payload,rawText,provenance,observedAt}}
export function validateBackfillManifest(manifestPath){
  const manifestReal=realpathSync(manifestPath),base=realpathSync(path.dirname(manifestReal)),manifest=readJson(manifestReal);
  if(!Array.isArray(manifest.snapshots)||!manifest.snapshots.length)throw new Error('invalid_backfill_manifest');
  const items=manifest.snapshots.map((entry,index)=>{
    if(!entry||typeof entry.file!=='string'||!/^[a-f0-9]{64}$/iu.test(String(entry.raw_sha256||'')))throw new Error(`invalid_backfill_entry:${index}`);
    const requested=path.resolve(base,entry.file);if(!isInside(requested,base))throw new Error(`manifest_path_escape:${index}`);
    if(!existsSync(requested)||lstatSync(requested).isSymbolicLink())throw new Error(`invalid_backfill_file:${index}`);
    const real=realpathSync(requested);if(!isInside(real,base))throw new Error(`manifest_path_escape:${index}`);
    const rawText=readRaw(real);if(sha(rawText)!==entry.raw_sha256)throw new Error(`backfill_sha256_mismatch:${entry.file}`);
    const payload=JSON.parse(rawText);if(entry.server_date_time&&(payload?.server_date_time?.date!==entry.server_date_time.date||payload?.server_date_time?.time!==entry.server_date_time.time))throw new Error(`backfill_server_time_mismatch:${entry.file}`);
    return {file:real,rawText,payload,observedAt:entry.observed_at??undefined,provenance:entry.provenance??{}};
  });
  return {manifest,items};
}

export async function main(argv=process.argv.slice(2)){
  const a=args(argv),command=a.command;if(!command)throw new Error('command_required');
  const allowed=new Set(['status','migrate','reestimate','import','backfill','collect']);if(!allowed.has(command))throw new Error(`unknown_command:${command}`);
  const dbPath=assertSafeDbPath(a.db,{allowProduction:a['allow-production']===true});
  // Validate every external input before opening a writable database. A bad
  // manifest/import must not create or migrate even a scratch database.
  let prepared=null;
  if(command==='backfill'){if(!a.manifest)throw new Error('explicit_--manifest_required');prepared=validateBackfillManifest(a.manifest)}
  if(command==='import'){if(!a.file)throw new Error('explicit_--file_required');const provenance=a.provenance?readJson(a.provenance):{};prepared=snapshotInput(a.file,provenance,a['observed-at'])}
  let archiveRoot=null;
  if(command==='collect')archiveRoot=assertSafeWritablePath(a.archive,{allowProduction:a['allow-production']===true,requiredCode:'explicit_--archive_required'});
  if(command==='status'){
    const db=openPachinkoDatabase(dbPath,{readOnly:true});try{const matrix=getPachinkoMatrix(db,{limit:1});const state=db.prepare('SELECT * FROM p_collector_state WHERE collector_id=?').get('pia:35-p')??null;output({ok:true,schemaVersion:db.prepare('PRAGMA user_version').get().user_version,collector:state,latestSnapshot:matrix.latestSnapshot,modelSnapshots:matrix.modelSnapshots});return}finally{db.close()}
  }
  const db=openPachinkoDatabase(dbPath);try{
    migratePachinko(db);
    if(command==='migrate'){output({ok:true,schemaVersion:db.prepare('PRAGMA user_version').get().user_version});return}
    if(command==='reestimate'){output({ok:true,...reestimatePachinkoRecords(db)});return}
    if(command==='import'){output({ok:true,...importPachinkoSnapshot(db,prepared)});return}
    if(command==='backfill'){const results=[];for(const item of prepared.items)results.push(importPachinkoSnapshot(db,{payload:item.payload,rawText:item.rawText,observedAt:item.observedAt,provenance:item.provenance,collectorVersion:'pachinko-backfill-v1'}));output({ok:true,imported:results});return}
    if(command==='collect'){const result=await collectPachinkoOnce(db,{archiveRoot});output({ok:true,...result});return}
  }finally{db.close()}
}

const direct=process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(direct)main().catch(error=>{console.error(String(error?.message||error));process.exitCode=1});
