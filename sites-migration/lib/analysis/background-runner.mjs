import {advanceAnalysisJob,getAnalysisJob} from './jobs.mjs';
const terminal=new Set(['succeeded','failed','cancelled']);
// Internal event handlers only. No HTTP execution or authorization bypass.
// One phase per invocation keeps the existing durable lease/fencing boundaries.
export async function runDueAnalysisPhase({db,bucket,now=Date.now,...options}){
 const job=await db.prepare("SELECT id FROM sites_analysis_jobs WHERE (state IN ('queued','retry_wait') AND available_at<=?) OR (state IN ('leased','running') AND lease_until<=?) ORDER BY id LIMIT 1").bind(now(),now()).first();
 return job?advanceAnalysisJob({db,bucket,jobId:job.id,now,...options}):null;
}
export async function consumeAnalysisQueue(batch,{db,bucket,enabled=false,now=Date.now,...options}={}){
 if(!enabled)throw Error('analysis_background_not_enabled');
 for(const message of batch.messages){
  const id=message.body?.jobId;
  if(!Number.isSafeInteger(id)||id<1){message.ack();continue}
  const before=await getAnalysisJob(db,id);if(!before||terminal.has(before.state)){message.ack();continue}
  const job=await advanceAnalysisJob({db,bucket,jobId:id,now,...options});
  if(terminal.has(job.state)){message.ack();continue}
  const due=Math.max(job.available_at||0,['running','leased'].includes(job.state)?job.lease_until||0:0);
  // Platform redelivery drives the next phase; the D1 state is the authority.
  message.retry({delaySeconds:Math.max(1,Math.ceil((due-now())/1000))});
 }
}
// DEV-only bounded continuation. Useful while no hosted scheduler is bound, but
// deliberately not presented as a durable timer or an unlimited waitUntil task.
export async function continueDevelopmentJob({db,bucket,jobId,...options}){
 let job;
 for(let step=0;step<3;step++){
  job=await advanceAnalysisJob({db,bucket,jobId,...options});
  if(!job||terminal.has(job.state)||job.state!=='queued')break;
 }
 return job;
}
