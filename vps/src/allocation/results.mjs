import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,statSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {canonicalJson,hashCanonical} from '../canonical-json.mjs';
import {serialize,deserialize} from 'node:v8';

const required=['storeId','date','inputHash','rosterHash','modelHash','scopeHash'];
function cacheKey(key){
  if(!key||typeof key!=='object'||Array.isArray(key))throw new TypeError('allocation result key is required');
  for(const field of required)if(typeof key[field]!=='string'||!key[field].trim())throw new TypeError(`${field} is required`);
  const d=new Date(`${key.date}T00:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(key.date)||!Number.isFinite(+d)||d.toISOString().slice(0,10)!==key.date)throw new TypeError('date must be a real YYYY-MM-DD date');
  return hashCanonical(key);
}
function sameFile(a,b){
  if(resolve(a)===resolve(b))return true;
  try{const x=statSync(a),y=statSync(b);return x.dev===y.dev&&x.ino===y.ino;}catch{return false;}
}
const encode=value=>`v8-base64-v1:${serialize(value).toString('base64')}`;
function decode(value){if(!value.startsWith('v8-base64-v1:'))throw new Error('unsupported result cache format');return deserialize(Buffer.from(value.slice(13),'base64'));}

/** Dedicated optional sidecar or bounded memory. Never opens/migrates canonical. */
export class AllocationResultStore{
  constructor({dbPath=null,maxEntries=128,canonicalDbPath=null,maxPayloadBytes=16*1024*1024}={}){
    if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>10000)throw new TypeError('maxEntries must be 1..10000');
    if(!Number.isSafeInteger(maxPayloadBytes)||maxPayloadBytes<1)throw new TypeError('maxPayloadBytes must be positive');
    this.maxEntries=maxEntries;this.maxPayloadBytes=maxPayloadBytes;this.memory=new Map();this.db=null;this.closed=false;this.tick=0;
    if(dbPath===null||dbPath===undefined||dbPath===':memory:')return;
    if(typeof dbPath!=='string'||!dbPath.trim())throw new TypeError('dedicated dbPath is required');
    if(canonicalDbPath&&sameFile(dbPath,canonicalDbPath))throw new Error('allocation result path must differ from canonical');
    const path=resolve(dbPath);mkdirSync(dirname(path),{recursive:true});
    const db=new DatabaseSync(path);let accepted=false;
    try{
      const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      if(tables.some(t=>t.name!=='allocation_results_v1'))throw new Error('allocation results requires a dedicated database; canonical or unrelated database refused');
      db.exec(`CREATE TABLE IF NOT EXISTS allocation_results_v1(cache_key TEXT PRIMARY KEY,key_json TEXT NOT NULL,payload_json TEXT NOT NULL,touched_at INTEGER NOT NULL);`);
      this.tick=Number(db.prepare('SELECT max(touched_at) n FROM allocation_results_v1').get().n??0);this.db=db;this.trim();accepted=true;
    }finally{if(!accepted)db.close();}
  }
  assertOpen(){if(this.closed)throw new Error('allocation result store is closed');}
  touch(){this.tick=Math.max(Date.now(),this.tick+1);return this.tick;}
  trim(){
    if(this.db)this.db.prepare('DELETE FROM allocation_results_v1 WHERE cache_key IN (SELECT cache_key FROM allocation_results_v1 ORDER BY touched_at DESC,cache_key LIMIT -1 OFFSET ?)').run(this.maxEntries);
    else while(this.memory.size>this.maxEntries)this.memory.delete(this.memory.keys().next().value);
  }
  get(key){
    this.assertOpen();const hash=cacheKey(key);
    if(this.db){
      const row=this.db.prepare('SELECT payload_json FROM allocation_results_v1 WHERE cache_key=? AND key_json=?').get(hash,canonicalJson(key));if(!row)return null;
      let value;try{value=decode(row.payload_json);}catch{this.db.prepare('DELETE FROM allocation_results_v1 WHERE cache_key=?').run(hash);return null;}
      this.db.prepare('UPDATE allocation_results_v1 SET touched_at=? WHERE cache_key=?').run(this.touch(),hash);return value;
    }
    if(!this.memory.has(hash))return null;const value=this.memory.get(hash);this.memory.delete(hash);this.memory.set(hash,value);return decode(value);
  }
  set(key,result){
    this.assertOpen();const hash=cacheKey(key),payload=encode(result);
    if(Buffer.byteLength(payload)>this.maxPayloadBytes)throw new RangeError('allocation result exceeds payload byte limit');
    if(this.db){
      this.db.exec('BEGIN IMMEDIATE');
      try{this.db.prepare('INSERT INTO allocation_results_v1 VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET key_json=excluded.key_json,payload_json=excluded.payload_json,touched_at=excluded.touched_at').run(hash,canonicalJson(key),payload,this.touch());this.trim();this.db.exec('COMMIT');}catch(error){try{this.db.exec('ROLLBACK');}catch{}throw error;}
    }else{this.memory.delete(hash);this.memory.set(hash,payload);this.trim();}
    return hash;
  }
  close(){if(this.closed)return;this.db?.close();this.memory.clear();this.closed=true;}
}
