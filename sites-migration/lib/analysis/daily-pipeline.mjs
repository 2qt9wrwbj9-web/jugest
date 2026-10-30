import{enqueueAnalysisJob,getAnalysisJob}from'./jobs.mjs';
// Internal reception/continuation bridge. Not a timer, collector or the complete
// original DAILY_ANALYSIS (shadow/comparison side effects remain unported).
export async function enqueueDailyPipeline({db,storeId,channelId,targetDate,now=Date.now}){
 const key='daily_'+targetDate.replaceAll('-','');
 const parent=await enqueueAnalysisJob({db,storeId,channelId,targetDate,kind:'store-analysis',historyLimit:180,requestKey:key,now});
 await db.prepare('INSERT INTO sites_daily_runs(store_id,business_date,channel_id,parent_id,state) VALUES(?,?,?,?,?) ON CONFLICT(store_id,business_date,channel_id) DO NOTHING').bind(storeId,targetDate,channelId,parent.id,'analysis_pending').run();
 return await db.prepare('SELECT * FROM sites_daily_runs WHERE store_id=? AND business_date=? AND channel_id=?').bind(storeId,targetDate,channelId).first();
}
export async function advanceDailyPipelines({db,now=Date.now,onStage=()=>{},enabled=false}){
 if(!enabled)return[];
 if(!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sites_daily_runs'").first())return[];
 const rows=(await db.prepare("SELECT * FROM sites_daily_runs WHERE state NOT IN ('completed','failed','superseded') ORDER BY business_date,parent_id LIMIT 20").all()).results,out=[];
 for(const row of rows){
  const newer=await db.prepare('SELECT 1 FROM sites_daily_runs WHERE store_id=? AND channel_id=? AND business_date>? LIMIT 1').bind(row.store_id,row.channel_id,row.business_date).first();
  if(newer){await db.prepare("UPDATE sites_daily_runs SET state='superseded' WHERE parent_id=?").bind(row.parent_id).run();continue}
  const parent=await getAnalysisJob(db,row.parent_id);if(!parent||['failed','cancelled'].includes(parent.state)){await db.prepare("UPDATE sites_daily_runs SET state='failed' WHERE parent_id=?").bind(row.parent_id).run();continue}if(parent.state!=='succeeded')continue;
  // Stable request keys make a crash after child acceptance recover without a
  // duplicate. Each child acceptance atomically creates its durable outbox.
  const options={db,storeId:row.store_id,channelId:row.channel_id,targetDate:row.business_date,historyLimit:180,requestKey:'daily_parent_'+row.parent_id,now};
  const feature=await enqueueAnalysisJob({...options,kind:'feature-build'});onStage('daily:feature-accepted');
  const pre=await enqueueAnalysisJob({...options,kind:'formal-pre'});onStage('daily:pre-accepted');
  await db.prepare("UPDATE sites_daily_runs SET feature_id=?,pre_id=?,state='children_pending' WHERE parent_id=? AND state IN ('analysis_pending','children_pending')").bind(feature.id,pre.id,row.parent_id).run();
  const final=await getAnalysisJob(db,pre.id),features=await getAnalysisJob(db,feature.id);
  if(['failed','cancelled','succeeded'].includes(final.state)&&['failed','cancelled','succeeded'].includes(features.state))await db.prepare("UPDATE sites_daily_runs SET state=? WHERE parent_id=? AND state='children_pending'").bind(final.state==='succeeded'&&features.state==='succeeded'?'completed':'failed',row.parent_id).run();
  out.push({parentId:row.parent_id,featureId:feature.id,preId:pre.id,unimplemented:['shadow','comparison','historical','original-refresh-state-and-summary']});
 }
 return out;
}
