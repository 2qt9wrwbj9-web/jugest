import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {openDatabase} from '../db.mjs';
import {migrate} from '../schema.mjs';
import {executeDailyAnalysis} from '../analysis/daily-analysis.mjs';

const MIB=1024*1024;
const DEFAULT_DB='/var/lib/jugest/jugest.sqlite';
const DEFAULT_ROOT=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)));
let peakRssMiB=process.memoryUsage().rss/MIB;

function sample(){
  peakRssMiB=Math.max(peakRssMiB,process.memoryUsage().rss/MIB);
  process.send?.({type:'heartbeat',rssMiB:peakRssMiB});
}

async function main(){
  const encoded=process.argv[2];
  if(!encoded)throw new Error('missing job descriptor');
  const descriptor=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
  if(descriptor.type!=='DAILY_ANALYSIS')throw new Error(`unsupported job type: ${descriptor.type}`);
  const dbPath=path.resolve(process.env.JUGEST_DB_PATH||DEFAULT_DB);
  const rootDir=path.resolve(process.env.JUGEST_WEB_ROOT||DEFAULT_ROOT);
  const db=openDatabase(dbPath);
  let heartbeat;
  try{
    migrate(db);
    sample();
    heartbeat=setInterval(sample,4000);
    heartbeat.unref?.();
    const out=await executeDailyAnalysis({db,job:descriptor,rootDir});
    sample();
    process.send?.({
      type:'complete',
      peakRssMiB,
      resultHash:out.outputHash,
      status:out.status,
      targetGeneration:out.targetGeneration,
      followupJobId:out.followupJobId
    });
  }finally{
    if(heartbeat)clearInterval(heartbeat);
    try{db.close()}catch{}
  }
}

main().then(()=>process.exit(0)).catch(error=>{
  peakRssMiB=Math.max(peakRssMiB,process.memoryUsage().rss/MIB);
  process.send?.({
    type:'error',
    peakRssMiB,
    errorClass:error?.code||'daily_analysis_error',
    message:String(error?.message??error)
  },()=>process.exit(1));
  if(!process.connected)process.exit(1);
});
