import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';

const databases=new Map();

function openRelayDatabase(dbPath){
  const target=String(dbPath||'').trim();
  if(!target)throw new TypeError('relay dbPath is required');
  const cacheKey=target===':memory:'?target:path.resolve(target);
  if(databases.has(cacheKey))return databases.get(cacheKey);
  if(target!==':memory:')mkdirSync(path.dirname(cacheKey),{recursive:true});
  const db=new DatabaseSync(cacheKey);
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec('PRAGMA synchronous=NORMAL;');
  db.exec('PRAGMA busy_timeout=5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS relay_kv (
      namespace TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(namespace,key)
    );
    CREATE INDEX IF NOT EXISTS relay_kv_namespace_key_idx ON relay_kv(namespace,key);
  `);
  databases.set(cacheKey,db);
  return db;
}

function namespaceFor(name,root){
  const n=String(name||'').trim();
  const r=String(root||'jugest').trim()||'jugest';
  if(!n)throw new TypeError('relay store name is required');
  return `${r}/${n}`;
}

function etagFor(revision){return `"r${Math.max(1,Number(revision)||1)}"`;}

function preconditionError(){
  const error=new Error('relay store ETag precondition failed');
  error.status=412;
  error.statusCode=412;
  error.code='precondition_failed';
  return error;
}

function rollbackQuietly(db){try{db.exec('ROLLBACK;')}catch{}}

export function createRelayStore(name,{dbPath='/var/lib/jugest/relay.sqlite',root='jugest'}={}){
  const db=openRelayDatabase(dbPath);
  const namespace=namespaceFor(name,root);
  const select=db.prepare('SELECT value,revision,updated_at FROM relay_kv WHERE namespace=? AND key=?');
  const insert=db.prepare('INSERT INTO relay_kv(namespace,key,value,revision,updated_at) VALUES(?,?,?,?,?)');
  const insertNew=db.prepare('INSERT OR IGNORE INTO relay_kv(namespace,key,value,revision,updated_at) VALUES(?,?,?,?,?)');
  const update=db.prepare('UPDATE relay_kv SET value=?,revision=?,updated_at=? WHERE namespace=? AND key=?');
  const remove=db.prepare('DELETE FROM relay_kv WHERE namespace=? AND key=?');
  const listPrefix=db.prepare('SELECT key,revision,updated_at FROM relay_kv WHERE namespace=? AND substr(key,1,?)=? ORDER BY key ASC');

  async function set(key,value,options={}){
    const k=String(key??'');
    const text=String(value??'');
    const now=Date.now();
    db.exec('BEGIN IMMEDIATE;');
    try{
      if(options.onlyIfNew===true){
        const result=insertNew.run(namespace,k,text,1,now);
        db.exec('COMMIT;');
        return result.changes?{modified:true,etag:etagFor(1)}:{modified:false};
      }
      const current=select.get(namespace,k);
      if(options.ifMatch){
        if(!current||etagFor(current.revision)!==String(options.ifMatch))throw preconditionError();
      }
      const revision=current?Number(current.revision)+1:1;
      if(current)update.run(text,revision,now,namespace,k);
      else insert.run(namespace,k,text,revision,now);
      db.exec('COMMIT;');
      return {modified:true,etag:etagFor(revision)};
    }catch(error){
      rollbackQuietly(db);
      throw error;
    }
  }

  async function setJSON(key,value,options={}){
    return await set(key,JSON.stringify(value),options);
  }

  async function get(key,options={}){
    const row=select.get(namespace,String(key??''));
    if(!row)return null;
    if(options.type==='json'){
      if(!row.value)return null;
      try{return JSON.parse(row.value)}catch{return null}
    }
    return row.value;
  }

  async function getWithMetadata(key){
    const row=select.get(namespace,String(key??''));
    if(!row)return null;
    return {value:JSON.parse(row.value),etag:etagFor(row.revision)};
  }

  async function list({prefix=''}={}){
    const p=String(prefix??'');
    const rows=listPrefix.all(namespace,p.length,p);
    return {blobs:rows.map(row=>({key:row.key,pathname:row.key,etag:etagFor(row.revision),uploadedAt:new Date(Number(row.updated_at)||0).toISOString()}))};
  }

  async function del(key){remove.run(namespace,String(key??''));}

  return {set,setJSON,get,getWithMetadata,list,delete:del,_namespace:namespace};
}

export const __test={etagFor};
