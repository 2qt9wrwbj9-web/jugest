import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';

function value(flag){const i=process.argv.indexOf(flag);return i>=0?process.argv[i+1]:null;}
const dbPath=value('--db')||process.env.JUGEST_DB_PATH;
if(!dbPath){console.error('Usage: node scripts/status.mjs --db /path/jugest.sqlite');process.exit(2)}
const db=openDatabase(dbPath);
try{
  migrate(db);
  const rows=db.prepare('SELECT state,COUNT(*) AS n FROM jobs GROUP BY state').all();
  const queue={queued:0,leased:0,running:0,succeeded:0,retry_wait:0,failed:0,cancelled:0,total:0};
  for(const row of rows){queue[row.state]=row.n;queue.total+=row.n}
  const latestResource=db.prepare('SELECT * FROM resource_samples ORDER BY id DESC LIMIT 1').get()??null;
  const profiles=db.prepare('SELECT job_type AS jobType,size_class AS sizeClass,ewma_peak_mib AS ewmaPeakMiB,samples,updated_at AS updatedAt FROM memory_profiles ORDER BY job_type,size_class').all();
  console.log(JSON.stringify({queue,latestResource,memoryProfiles:profiles}));
}finally{db.close()}
