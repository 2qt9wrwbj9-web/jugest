import {loadStoreDays} from './store-data.mjs';
import {scoreAvailableComparisonDays} from './comparison-refresh.mjs';
import {runFormalDailyLoop} from './daily-analysis.mjs';
import {completePredictionEvaluation} from './prediction-refresh-state.mjs';
import {refreshActiveStoreReadSnapshot} from '../research/store-read-output.mjs';
import {businessDateAt,operationalTargetDate,createRunClock} from '../research/prediction-policy.mjs';
import {saveEvaluationState} from '../research/evaluation-state.mjs';
import {hashCanonical} from '../canonical-json.mjs';
export async function executePredictionEvaluation({db,job,rootDir,nowIso=new Date().toISOString(),formalRunner=runFormalDailyLoop}={}){
 const storeId=job?.payload?.storeId;
 const clock=createRunClock(nowIso);
 if(job?.type!=='PREDICTION_EVALUATE'||!storeId)throw new TypeError('prediction job is required');
 const refresh=db.prepare('SELECT * FROM prediction_refresh_state WHERE store_id=?').get(storeId);
 if(refresh?.active_job_id!==job.id)throw new Error('stale prediction evaluation job');
 const generation=refresh.generation,loaded=loadStoreDays(db,storeId,{limit:180});
 const throughDate=new Date(Date.parse(`${businessDateAt(nowIso)}T00:00:00Z`)-86400000).toISOString().slice(0,10);
 const comparison=scoreAvailableComparisonDays(db,{storeId,throughDate,nowIso});
 let formal={reason:'no_canonical_days'},forecast={state:'unavailable',reason:'no_canonical_days'};
 if(loaded.days.length){
  const frontierDate=loaded.days.at(-1).date;
  try{
   const saved=refreshActiveStoreReadSnapshot(db,{storeId,days:loaded.days,frontierDate,nowIso:clock()});
   forecast={state:saved?'frozen':'unavailable',reason:saved?null:'no_active_model'};
  }catch(error){
   if(error.code!=='prediction_snapshot_conflict')throw error;
   forecast={state:'conflict',reason:'prediction_snapshot_conflict'};
  }
  saveEvaluationState(db,{storeId,targetDate:operationalTargetDate({frontierDate,nowIso:clock()}),series:'forecast:pre_research',...forecast,nowIso:clock()});
  formal=await formalRunner({db,storeId,lineageId:'pre-v2-live',days:loaded.days,throughDate:frontierDate,rootDir,nowIso:clock()});
 }
 db.exec('BEGIN IMMEDIATE');
 let completion;
 try{completion=completePredictionEvaluation(db,{storeId,jobId:job.id,generation,nowIso:clock()});db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}
 return{storeId,comparison,formal,forecast,followupJobId:completion.job?.id??null,outputHash:hashCanonical({storeId,comparison,formalReason:formal.reason,forecast})};
}
