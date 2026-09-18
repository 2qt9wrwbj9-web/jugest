import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

export function openDatabase(path){
  if(typeof path!=='string'||!path)throw new TypeError('database path is required');
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path);
  // Install the lock wait before WAL negotiation so concurrent startup/openers
  // do not fail immediately while another connection is changing/reading state.
  db.exec('PRAGMA busy_timeout=5000;');
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec('PRAGMA synchronous=NORMAL;');
  db.exec('PRAGMA foreign_keys=ON;');
  return db;
}
