// Infrastructure guard only. D1 batches roll back every job/head/outbox write
// when the daily run lost ownership between a read and transaction acceptance.
export function dailyFenceStatements({db,storeId,channelId,targetDate,parentId=null}){
 const token=crypto.randomUUID();
 const current=parentId===null?'1':"EXISTS(SELECT 1 FROM sites_daily_runs r JOIN sites_analysis_jobs j ON j.id=r.parent_id WHERE r.parent_id=? AND r.store_id=? AND r.channel_id=? AND r.business_date=? AND r.state IN ('analysis_pending','children_pending') AND j.state='succeeded')";
 const values=parentId===null?[]:[parentId,storeId,channelId,targetDate];
 return{
  begin:db.prepare(`INSERT INTO sites_daily_fences(operation_id,valid) SELECT ?,CASE WHEN ${current} AND NOT EXISTS(SELECT 1 FROM sites_daily_runs WHERE store_id=? AND business_date>?) THEN 1 ELSE 0 END`).bind(token,...values,storeId,targetDate),
  end:db.prepare('DELETE FROM sites_daily_fences WHERE operation_id=?').bind(token),
 };
}
export const isDailyFenceError=error=>String(error?.message??error).includes('sites_daily_fence_valid');
