// Transport retries are separate from calculation failures. The D1 job and this
// outbox survive a producer crash before send, or an ambiguous send outcome.
export async function dispatchDueAnalysisJobs({db,queue,enabled=false,now=Date.now,limit=20}={}){
 if(!enabled||!queue?.send)throw Error('analysis_dispatch_not_enabled');
 const at=now(),n=Math.min(20,Math.max(1,Math.trunc(limit)||20));
 const {results}=await db.prepare(`SELECT j.id FROM sites_analysis_jobs j JOIN sites_analysis_dispatch d ON d.job_id=j.id
  WHERE d.next_dispatch_at<=? AND ((j.state IN ('queued','retry_wait') AND j.available_at<=?) OR (j.state IN ('leased','running') AND j.lease_until<=?)) ORDER BY j.id LIMIT ?`).bind(at,at,at,n).all();
 let sent=0,failed=0;
 for(const row of results){
  const claim=await db.prepare('UPDATE sites_analysis_dispatch SET next_dispatch_at=?,attempts=attempts+1 WHERE job_id=? AND next_dispatch_at<=?').bind(at+60000,row.id,at).run();
  if(!claim.meta.changes)continue;
  try{await queue.send({jobId:row.id});await db.prepare('UPDATE sites_analysis_dispatch SET last_sent_at=?,last_error=NULL WHERE job_id=?').bind(at,row.id).run();sent++}
  catch{await db.prepare("UPDATE sites_analysis_dispatch SET next_dispatch_at=?,last_error='queue_send_failed' WHERE job_id=?").bind(at+5000,row.id).run();failed++}
 }
 return{sent,failed};
}
