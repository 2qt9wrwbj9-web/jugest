import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {enqueueJob} from '../src/queue.mjs';

const PRIORITY={COLLECTOR_RECOVERY:10,DAILY_ANALYSIS:20,SNAPSHOT_REFRESH:30,BACKFILL:40,RESEARCH:50};
function value(flag){const i=process.argv.indexOf(flag);return i>=0?process.argv[i+1]:null;}
function numberValue(flag,fallback){const raw=value(flag);if(raw===null)return fallback;const n=Number(raw);if(!Number.isFinite(n))throw new TypeError(`${flag} must be numeric`);return n;}

try{
  const dbPath=value('--db')||process.env.JUGEST_DB_PATH;
  const type=value('--type');
  const key=value('--key');
  if(!dbPath||!type||!key){console.error('Usage: node scripts/enqueue.mjs --db PATH --type TYPE --key KEY [--payload JSON] [--lease MiB]');process.exit(2)}
  const payload=JSON.parse(value('--payload')||'{}');
  const priority=Math.trunc(numberValue('--priority',PRIORITY[type]??50));
  const estimatedLeaseMiB=numberValue('--lease',128);
  const maxAttempts=Math.trunc(numberValue('--max-attempts',3));
  const sizeClass=value('--size-class')||'small';
  const db=openDatabase(dbPath);
  try{
    migrate(db);
    const job=enqueueJob(db,{type,priority,idempotencyKey:key,payload,sizeClass,estimatedLeaseMiB,maxAttempts});
    console.log(JSON.stringify(job));
  }finally{db.close()}
}catch(error){
  console.error(String(error?.stack??error));
  process.exit(1);
}
