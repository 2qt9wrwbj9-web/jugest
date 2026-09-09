import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';

function value(flag){const i=process.argv.indexOf(flag);return i>=0?process.argv[i+1]:null;}
const dbPath=value('--db')||process.env.JUGEST_DB_PATH;
if(!dbPath){console.error('Usage: node scripts/migrate.mjs --db /path/jugest.sqlite');process.exit(2)}
const db=openDatabase(dbPath);
try{
  migrate(db);
  console.log(JSON.stringify({ok:true,db:dbPath}));
}finally{db.close()}
