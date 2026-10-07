import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,readFileSync} from 'node:fs';
import {dirname} from 'node:path';

export const PACHINKO_SCHEMA_VERSION=2;
const DOMAIN='pia-ofuna-pachinko';
const TABLES=['p_meta','p_snapshots','p_records','p_snapshot_members','p_machine_days','p_transitions','p_collector_state','p_model_anchors'];
function checkDatabase(db,{allowEmpty=false,allowPrevious=false}={}){
  const version=Number(db.prepare('PRAGMA user_version').get().user_version);
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row=>row.name);
  if(version===0&&tables.length===0&&allowEmpty)return 0;
  if(version!==PACHINKO_SCHEMA_VERSION&&!(allowPrevious&&version===1))throw new Error('unsupported_pachinko_schema');
  if(TABLES.some(name=>!tables.includes(name))||tables.some(name=>!TABLES.includes(name)))throw new Error('not_an_independent_pachinko_database');
  if(db.prepare("SELECT value FROM p_meta WHERE key='domain'").get()?.value!==DOMAIN)throw new Error('not_an_independent_pachinko_database');
  return version;
}

export function openPachinkoDatabase(path,{readOnly=false}={}){
  if(typeof path!=='string'||!path.trim())throw new TypeError('pachinko_database_path_required');
  if(readOnly&&(path===':memory:'||!existsSync(path)))throw new Error('pachinko_readonly_database_missing');
  if(!readOnly&&path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path,{readOnly});
  try{
    // Inspect ownership before setting WAL: opening an unrelated SQLite file
    // must never change its persistent journal mode or apply our migration.
    checkDatabase(db,{allowEmpty:!readOnly,allowPrevious:!readOnly});
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    if(!readOnly)db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
    return db;
  }catch(error){db.close();throw error}
}

export function migratePachinko(db){
  db.exec('PRAGMA foreign_keys=ON;');
  let version=Number(db.prepare('PRAGMA user_version').get().user_version);
  if(version===PACHINKO_SCHEMA_VERSION){checkDatabase(db);db.exec(`PRAGMA user_version=${PACHINKO_SCHEMA_VERSION};`);return}
  if(version!==0&&version!==1)throw new Error('unsupported_pachinko_schema');
  try{
    if(version===0){
      const existing=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      if(existing.length)throw new Error('pachinko_database_must_be_empty_and_independent');
      db.exec(readFileSync(new URL('../../migrations/pachinko/001-initial.sql',import.meta.url),'utf8'));version=1;
    }
    if(version===1){
      checkDatabase(db,{allowPrevious:true});
      db.exec(readFileSync(new URL('../../migrations/pachinko/002-retained-occurrences.sql',import.meta.url),'utf8'));
    }
  }catch(error){try{db.exec('ROLLBACK;')}catch{}throw error}
}
