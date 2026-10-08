import {enqueueJob,getJob} from '../queue.mjs';
const ACTIVE=new Set(['queued','leased','running','retry_wait']);
export function migratePredictionRefresh(db){db.exec(`CREATE TABLE IF NOT EXISTS prediction_refresh_state(
 store_id TEXT PRIMARY KEY,generation INTEGER NOT NULL DEFAULT 0,completed_generation INTEGER NOT NULL DEFAULT 0,active_job_id INTEGER,updated_at TEXT NOT NULL,
 FOREIGN KEY(store_id) REFERENCES stores(id));`)}
export function requestPredictionEvaluation(db,{storeId,nowIso=new Date().toISOString(),dirty=true}={}){
 db.prepare(`INSERT INTO prediction_refresh_state VALUES(?,1,0,NULL,?) ON CONFLICT(store_id) DO UPDATE SET generation=generation+?,updated_at=excluded.updated_at`).run(storeId,nowIso,dirty?1:0);
 const state=db.prepare('SELECT * FROM prediction_refresh_state WHERE store_id=?').get(storeId);
 if(state.generation<=state.completed_generation)return{state,job:null};
 const active=state.active_job_id?getJob(db,state.active_job_id):null;
 if(active&&ACTIVE.has(active.state))return{state,job:active};
 const job=enqueueJob(db,{type:'PREDICTION_EVALUATE',priority:45,idempotencyKey:`prediction-evaluate:${storeId}:${state.generation}`,payload:{storeId,generation:state.generation},sizeClass:'medium',estimatedLeaseMiB:384,maxAttempts:3,createdAtIso:nowIso});
 db.prepare('UPDATE prediction_refresh_state SET active_job_id=?,updated_at=? WHERE store_id=?').run(job.id,nowIso,storeId);
 return{state,job};
}
export function completePredictionEvaluation(db,{storeId,jobId,generation,nowIso}={}){
 const result=db.prepare('UPDATE prediction_refresh_state SET completed_generation=MAX(completed_generation,?),active_job_id=NULL,updated_at=? WHERE store_id=? AND active_job_id=?').run(generation,nowIso,storeId,jobId);
 if(result.changes!==1)throw new Error('prediction evaluation lost ownership');
 return requestPredictionEvaluation(db,{storeId,nowIso,dirty:false});
}
