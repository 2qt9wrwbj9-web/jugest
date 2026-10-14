#!/usr/bin/env node
// Offline, fail-closed legacy encrypted sync import. Never contacts the source.
import {readFileSync,lstatSync,realpathSync,existsSync,readlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';

export const SYNC_NAMESPACE='jugest/juggler-device-sync-v1';
const ID=/^[A-Za-z0-9_-]{12,80}$/;
function fail(message){throw new Error('sync_import_'+message)}
const sha=data=>createHash('sha256').update(data).digest('hex');
function validPayload(p){
  return p&&p.v===1&&['none','gzip'].includes(p.zip)&&
   typeof p.iv==='string'&&/^[A-Za-z0-9_-]{12,40}$/.test(p.iv)&&
   typeof p.ct==='string'&&/^[A-Za-z0-9_-]+$/.test(p.ct);
}
export function validateArchive(archive){
  if(!archive||archive.format!=='jugest-legacy-sync-v1'||archive.namespace!==SYNC_NAMESPACE||
     !Array.isArray(archive.objects))fail('bad_archive_format');
  const items=new Map(),groups=new Map();
  for(const entry of archive.objects){
    if(!entry||typeof entry.key!=='string'||typeof entry.value!=='string'||items.has(entry.key))fail('invalid_or_duplicate_key');
    const m=/^(sync|sync-commit)\/([A-Za-z0-9_-]{12,80})(?:\/(\d{12}))?$/.exec(entry.key);
    if(!m||(m[1]==='sync'&&m[3])||(m[1]==='sync-commit'&&!m[3]))fail('unexpected_key');
    const [,kind,id,rev]=m;
    if(!ID.test(id))fail('invalid_id');
    let v;try{v=JSON.parse(entry.value)}catch{fail('invalid_record_json')}
    if(!v||v.version!==1||!Number.isSafeInteger(v.revision)||v.revision<0||
       !Number.isFinite(v.createdAt)||!Number.isFinite(v.updatedAt)||
       !/^[0-9a-f]{64}$/.test(v.authHash)||v.revision>0&&!validPayload(v.payload))fail('invalid_record');
    if(kind==='sync-commit'&&(v.revision!==Number(rev)||v.revision<1))fail('revision_mismatch');
    items.set(entry.key,entry.value);
    const g=groups.get(id)??{heads:[],commits:new Map(),all:[]};
    if(kind==='sync')g.heads.push(v);else g.commits.set(v.revision,v);
    g.all.push(v);groups.set(id,g);
  }
  if(groups.size===0)fail('no_shares_to_import');
  for(const g of groups.values()){
    if(g.heads.length!==1)fail('missing_head');
    const head=g.heads[0];
    if(head.revision===0&&head.payload!==null)fail('invalid_empty_head');

    // Historic Blob shares can have a durable head at revision N without
    // accompanying immutable commit objects: those were introduced later.
    // The current sync runtime reads that head directly and commits N+1 on
    // its next push. Preserve it exactly; NEVER invent missing commits.
    //
    // Only commits *after* the head must be contiguous. A gap there would
    // make the live runtime stop early and hide a later committed write.
    const highest=Math.max(head.revision,...g.commits.keys());
    if(highest-head.revision>=1024)fail('unbounded_recovery_gap');
    for(let revision=head.revision+1;revision<=highest;revision++){
      if(!g.commits.has(revision))fail('missing_revision_after_head');
    }
    for(const v of g.all){
      if(v.createdAt!==head.createdAt||v.authHash!==head.authHash)
        fail('share_identity_mismatch');
    }
    // An existing checkpoint for the head cannot disagree with the head
    // itself. Older commits are retained verbatim for forensic rollback.
    if(g.commits.has(head.revision)&&
       JSON.stringify(head)!==JSON.stringify(g.commits.get(head.revision)))
      fail('head_commit_disagree');
  }
  const fingerprints=[...items].sort(([a],[b])=>a.localeCompare(b))
    .map(([k,v])=>JSON.stringify([k,sha(v)]));
  return {items:[...items],shareCount:groups.size,recordCount:items.size,
    fingerprint:sha(fingerprints.join('\n'))};
}
function safeFile(p){
  if(typeof p!=='string'||!path.isAbsolute(p))fail('absolute_path_required');
  if(!existsSync(p)||!lstatSync(p).isFile()||lstatSync(p).isSymbolicLink())fail('archive_missing_or_link');
  if((lstatSync(p).mode&0o077)!==0)fail('archive_permissions_must_be_0600');
  return realpathSync(p);
}
function protectedPath(value){return ['/var/lib/jugest','/opt/jugest'].some(root=>value===root||value.startsWith(root+'/'))}
function destinationIdentity(value,depth=0){
  if(depth>32)fail('unsafe_symlink_chain');
  const resolved=path.resolve(value),root=path.parse(resolved).root,parts=resolved.slice(root.length).split(path.sep);
  let cursor=root;
  for(let i=0;i<parts.length;i++){
    const next=path.join(cursor,parts[i]);
    if(protectedPath(next))return path.join(next,...parts.slice(i+1));
    let info;
    try{info=lstatSync(next)}catch(e){if(e.code==='ENOENT')return path.join(next,...parts.slice(i+1));throw e}
    if(info.isSymbolicLink())return destinationIdentity(path.resolve(cursor,readlinkSync(next),...parts.slice(i+1)),depth+1);
    cursor=next;
  }
  return cursor;
}
function safeTarget(p){
  if(typeof p!=='string'||!path.isAbsolute(p))fail('absolute_target_required');
  const requested=path.resolve(p),identity=destinationIdentity(requested);
  if(protectedPath(requested)||protectedPath(identity))fail('production_target_not_allowed');
  try{if(lstatSync(requested).isSymbolicLink())fail('target_symlink')}catch(e){if(e.code!=='ENOENT')throw e}
  // Import is only into a scratch DB. Live cutover requires separate approval.
  return requested;
}
export function inspectDbAndImport(archive,{dbPath,apply=false}={}){
  const summary=validateArchive(archive);
  const safeDb=safeTarget(dbPath);
  if(!apply)return{...summary,items:undefined,dryRun:true};
  const db=new DatabaseSync(safeDb);
  try{
    db.exec('PRAGMA busy_timeout=3000;PRAGMA journal_mode=WAL;');
    db.exec(`CREATE TABLE IF NOT EXISTS relay_kv(
      namespace TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL,
      PRIMARY KEY(namespace,key))`);
    db.exec('BEGIN IMMEDIATE');
    try{
      const count=db.prepare('SELECT COUNT(*) n FROM relay_kv WHERE namespace=?').get(SYNC_NAMESPACE).n;
      if(count!==0)fail('destination_not_empty');
      const stmt=db.prepare('INSERT INTO relay_kv(namespace,key,value,revision,updated_at) VALUES(?,?,?,?,?)');
      const now=Date.now();
      for(const [key,value] of summary.items)stmt.run(SYNC_NAMESPACE,key,value,1,now);
      const final=db.prepare('SELECT COUNT(*) n FROM relay_kv WHERE namespace=?').get(SYNC_NAMESPACE).n;
      if(final!==summary.recordCount)fail('import_count_mismatch');
      db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e}
    return{...summary,items:undefined,dryRun:false};
  }finally{db.close()}
}
export function parseArgs(args){
  const out={};for(let i=0;i<args.length;i++){
    if(args[i]==='--apply'){out.apply=true;continue}
    if(!['--archive','--db'].includes(args[i])||!args[i+1])fail('bad_args');
    out[args[i].slice(2)]=args[++i];
  }
  if(!out.archive||!out.db)fail('required_archive_and_db');
  return out;
}
if(process.argv[1]&&realpathSync(process.argv[1])===realpathSync(new URL(import.meta.url))){
  try{
    const a=parseArgs(process.argv.slice(2));
    const text=readFileSync(safeFile(a.archive),'utf8');
    const body=JSON.parse(text);
    const summary=inspectDbAndImport(body,{dbPath:a.db,apply:a.apply});
    console.log(JSON.stringify({dryRun:summary.dryRun,shareCount:summary.shareCount,
      recordCount:summary.recordCount,fingerprint:summary.fingerprint}));
  }catch(error){console.error(String(error.message||error));process.exitCode=1}
}
