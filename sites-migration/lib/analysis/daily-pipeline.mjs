import{enqueueAnalysisJob,getAnalysisJob}from'./jobs.mjs';
// Internal reception/continuation bridge. Not a timer, collector or the complete
// original DAILY_ANALYSIS (refresh, summary and comparison remain unported).
const pending="state IN ('analysis_pending','children_pending')";
const newer="EXISTS(SELECT 1 FROM sites_daily_runs n WHERE n.store_id=sites_daily_runs.store_id AND n.business_date>sites_daily_runs.business_date)";
async function supersede(db,parentId){return db.prepare(`UPDATE sites_daily_runs SET state='superseded' WHERE parent_id=? AND ${pending} AND ${newer}`).bind(parentId).run()}
export async function enqueueDailyPipeline({db,storeId,channelId,targetDate,now=Date.now,onStage=()=>{}}){
 const read=()=>db.prepare('SELECT * FROM sites_daily_runs WHERE store_id=? AND business_date=? AND channel_id=?').bind(storeId,targetDate,channelId).first();
 const prior=await read();if(prior)return prior;
 await onStage('daily:before-parent-accept');
 await enqueueAnalysisJob({db,storeId,channelId,targetDate,kind:'store-analysis',historyLimit:180,requestKey:'daily_'+targetDate.replaceAll('-',''),dailyReception:true,now});
 await onStage('daily:parent-accepted');
 return read();
}
export async function advanceDailyPipelines({db,now=Date.now,onStage=()=>{},enabled=false}){
 if(!enabled)return[];
 if(!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sites_daily_runs'").first())return[];
 const rows=(await db.prepare(`SELECT * FROM sites_daily_runs WHERE ${pending} ORDER BY business_date,parent_id LIMIT 20`).all()).results,out=[];
 for(const row of rows){
  await supersede(db,row.parent_id);
  const current=await db.prepare('SELECT state FROM sites_daily_runs WHERE parent_id=?').bind(row.parent_id).first();
  if(!current||!['analysis_pending','children_pending'].includes(current.state))continue;
  const parent=await getAnalysisJob(db,row.parent_id);
  if(!parent||['failed','cancelled'].includes(parent.state)){
   await db.prepare(`UPDATE sites_daily_runs SET state=CASE WHEN ${newer} THEN 'superseded' ELSE 'failed' END WHERE parent_id=? AND ${pending}`).bind(row.parent_id).run();continue;
  }
  if(parent.state!=='succeeded')continue;
  const options={db,storeId:row.store_id,channelId:row.channel_id,targetDate:row.business_date,historyLimit:180,requestKey:'daily_parent_'+row.parent_id,dailyParentId:row.parent_id,now};
  let feature,pre;
  try{
   await onStage('daily:before-feature-accept');
   feature=await enqueueAnalysisJob({...options,kind:'feature-build'});await onStage('daily:feature-accepted');
   pre=await enqueueAnalysisJob({...options,kind:'formal-pre'});await onStage('daily:pre-accepted');
  }catch(error){if(error.code!=='daily_frontier_changed')throw error;await supersede(db,row.parent_id);continue}
  // Absorbing terminal states and latest-frontier checks are evaluated inside
  // the UPDATE, never just against the stale row read above.
  await db.prepare(`UPDATE sites_daily_runs SET feature_id=?,pre_id=?,state=CASE WHEN ${newer} THEN 'superseded' ELSE 'children_pending' END WHERE parent_id=? AND ${pending}`).bind(feature.id,pre.id,row.parent_id).run();
  const final=await getAnalysisJob(db,pre.id),features=await getAnalysisJob(db,feature.id);
  if(['failed','cancelled','succeeded'].includes(final.state)&&['failed','cancelled','succeeded'].includes(features.state)){
   await onStage('daily:before-complete');
   await db.prepare(`UPDATE sites_daily_runs SET state=CASE WHEN ${newer} THEN 'superseded' ELSE ? END WHERE parent_id=? AND state='children_pending'`).bind(final.state==='succeeded'&&features.state==='succeeded'?'completed':'failed',row.parent_id).run();
  }
  out.push({parentId:row.parent_id,featureId:feature.id,preId:pre.id,unimplemented:['shadow','comparison','historical','original-refresh-state-and-summary']});
 }
 return out;
}
