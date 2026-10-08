import {fileURLToPath} from 'node:url';
import {openDatabase} from '../db.mjs';
import {migrate} from '../schema.mjs';
import {executePredictionEvaluation} from '../analysis/prediction-evaluation.mjs';
const rss=()=>process.memoryUsage().rss/1048576;
async function main(){
 const job=JSON.parse(Buffer.from(process.argv[2]||'','base64url').toString('utf8'));
 if(job.type!=='PREDICTION_EVALUATE')throw new TypeError('prediction descriptor required');
 const db=openDatabase(process.env.JUGEST_DB_PATH||'/var/lib/jugest/jugest.sqlite');
 let peakRssMiB=rss();const startRssMiB=peakRssMiB,started=Date.now();
 const timer=setInterval(()=>{peakRssMiB=Math.max(peakRssMiB,rss());process.send?.({type:'heartbeat',rssMiB:peakRssMiB})},1000);timer.unref?.();
 try{
  migrate(db);process.send?.({type:'task_start',taskKind:'prediction_evaluate',phase:3,taskVersion:'prospective-jst-v1',storeId:job.payload.storeId,startedAt:new Date().toISOString()});
  const out=await executePredictionEvaluation({db,job,rootDir:process.env.JUGEST_WEB_ROOT||fileURLToPath(new URL('../../..',import.meta.url))});
  peakRssMiB=Math.max(peakRssMiB,rss());
  process.send?.({type:'complete',status:'evaluated',resultHash:out.outputHash,followupJobId:out.followupJobId,startRssMiB,peakRssMiB,endRssMiB:rss(),durationMs:Date.now()-started});
 }finally{clearInterval(timer);db.close()}
}
main().catch(error=>{process.send?.({type:'error',message:String(error?.message||error),errorClass:'prediction_evaluation_error',rssMiB:rss()});process.exitCode=1});
