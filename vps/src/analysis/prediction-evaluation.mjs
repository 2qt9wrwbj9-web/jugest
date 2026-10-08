import {loadStoreDays} from './store-data.mjs';
import {scoreAvailableComparisonDays} from './comparison-refresh.mjs';
import {runFormalDailyLoop} from './daily-analysis.mjs';
import {completePredictionEvaluation} from './prediction-refresh-state.mjs';
import {refreshActiveStoreReadSnapshot} from '../research/store-read-output.mjs';
import {businessDateAt} from '../research/prediction-policy.mjs';
import {hashCanonical} from '../canonical-json.mjs';
export async function executePredictionEvaluation({db,job,rootDir,nowIso=new Date().toISOString(),formalRunner=runFormalDailyLoop}={}){
 const storeId=job?.payload?.storeId;
 if(job?.type!=='PREDICTION_EVALUATE'||!storeId)throw new TypeError('prediction job is required');
 const refresh=db.prepare('SELECT * FROM prediction_refresh_state WHERE store_id=?').get(storeId);
 if(refresh?.active_job_id!==job.id)throw new Error('stale prediction evaluation job');
 const generation=refresh.generation,loaded=loadStoreDays(db,storeId,{limit:180});
 const throughDate=new Date(Date.parse(`${businessDateAt(nowIso)}T00:00:00Z`)-86400000).toISOString().slice(0,10);
 const comparison=scoreAvailableComparisonDays(db,{storeId,throughDate,nowIso});
 let formal={reason:'no_canonical_days'};
 if(loaded.days.length){
  const frontierDate=loaded.days.at(-1).date;
  refreshActiveStoreReadSnapshot(db,{storeId,days:loaded.days,frontierDate,nowIso});
  formal=await formalRunner({db,storeId,lineageId:'pre-v2-live',days:loaded.days,throughDate:frontierDate,rootDir,nowIso});
 }
 db.exec('BEGIN IMMEDIATE');
 let completion;
 try{completion=completePredictionEvaluation(db,{storeId,jobId:job.id,generation,nowIso});db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}
 return{storeId,comparison,formal,followupJobId:completion.job?.id??null,outputHash:hashCanonical({storeId,comparison,formalReason:formal.reason})};
}
