import{originalModelSearchCalculation}from'./generated-model-search-kernel.mjs';
import{buildWalkForwardDataset,splitChronologicalSamples}from'./generated-research-dataset.mjs';
import{fingerprintModel}from'../../upstream/vps/src/research/model-search.mjs';
import{hashCanonical}from'../../upstream/vps/src/canonical-json.mjs';
import{openFrozenStoreHistory}from'./input-snapshot.mjs';
const failure=code=>Object.assign(Error(code),{code});
export async function requireResearchBacktest({db,job,snapshot}){
 const fixed=await db.prepare('SELECT * FROM sites_research_job_inputs WHERE job_id=?').bind(job.id).first();
 if(!fixed||fixed.input_hash!==snapshot.inputHash)throw failure('research_input_mismatch');
 const prior=await db.prepare("SELECT j.id FROM sites_analysis_jobs j JOIN sites_research_job_inputs i ON i.job_id=j.id WHERE j.store_id=? AND j.kind='research-backtest' AND j.state='succeeded' AND j.input_hash=? AND i.model_fingerprint=? AND i.frontier_date=? AND EXISTS(SELECT 1 FROM backtest_runs r JOIN sites_backtest_publications p ON p.run_id=r.id WHERE p.job_id=j.id AND r.split_kind='validation') ORDER BY j.id DESC LIMIT 1").bind(job.store_id,snapshot.inputHash,fixed.model_fingerprint,fixed.frontier_date).first();
 if(!prior)throw failure('research_backtest_required');return fixed;
}
export function calculateModelSearch({storeId,days,champion,frontierDate,round=0,onStage=()=>{}}){
 const eligible=days.filter(d=>String(d.date||'')<=frontierDate),dataset=buildWalkForwardDataset({storeId,days:eligible,minHistoryDays:4}),split=splitChronologicalSamples(dataset.samples),championFingerprint=fingerprintModel(champion);
 const base={storeId,championFingerprint,champion,frontierDate,round,datasetHash:dataset.inputHash,trainDates:[...split.trainDates],validationDates:[...split.validationDates],holdoutDates:[...split.holdoutDates],holdoutSealed:true,promoted:false,adoptionStatus:'unpromoted'};
 if(!split.train.length||!split.validation.length||!split.holdout.length)return{...base,status:'insufficient_data',axes:[],search:null,calculationHash:hashCanonical({storeId,championFingerprint,status:'insufficient_data'})};
 // Exact fixed MODEL_SEARCH parameters. Sealed holdout is never passed to either calculator.
 onStage('research-search:calculation-begin');const {minSupport,axes,search}=originalModelSearchCalculation({split,champion,round});onStage('research-search:calculation-complete');
 return{...base,status:'searched',minSupport,axes,search,calculationHash:hashCanonical({storeId,championFingerprint,round,axes,search})};
}
export async function runFrozenModelSearch({db,bucket,job,manifestKey,onStage=()=>{}}){
 const fixed=await requireResearchBacktest({db,job,snapshot:{inputHash:job.input_hash}}),champion=JSON.parse(fixed.model_json);
 if(fingerprintModel(champion)!==fixed.model_fingerprint)throw failure('research_model_hash_mismatch');
 const input=await openFrozenStoreHistory({bucket,manifestKey}),days=[];for await(const d of input.days)days.push(d);
 return{analysis:calculateModelSearch({storeId:job.store_id,days,champion,frontierDate:fixed.frontier_date,onStage}),inputHash:input.inputHash};
}
export async function modelSearchWrites({db,job,feature,key,at}){
 const fixed=await db.prepare('SELECT * FROM sites_research_job_inputs WHERE job_id=?').bind(job.id).first();
 if(!fixed||feature.storeId!==job.store_id||feature.championFingerprint!==fixed.model_fingerprint||fingerprintModel(feature.champion)!==fixed.model_fingerprint||feature.frontierDate!==fixed.frontier_date||feature.promoted!==false||feature.holdoutSealed!==true||feature.adoptionStatus!=='unpromoted'||!['searched','insufficient_data'].includes(feature.status))throw failure('research_search_result_invalid');
 const calculation=feature.status==='searched'?{storeId:feature.storeId,championFingerprint:feature.championFingerprint,round:feature.round,axes:feature.axes,search:feature.search}:{storeId:feature.storeId,championFingerprint:feature.championFingerprint,status:'insufficient_data'};
 if(hashCanonical(calculation)!==feature.calculationHash)throw failure('research_search_result_invalid');
 return[db.prepare("INSERT INTO sites_research_searches(job_id,store_id,input_hash,champion_fingerprint,candidate_fingerprint,round,calculation_hash,status,payload_key,created_at) SELECT id,?,?,?,?,?,?,?,?,? FROM sites_analysis_jobs WHERE id=? AND state='succeeded' AND result_key=? AND attempts=? ON CONFLICT(job_id) DO NOTHING").bind(job.store_id,job.input_hash,feature.championFingerprint,feature.search?.best?.model?.fingerprint??null,feature.round,feature.calculationHash,feature.status,key,at,job.id,key,job.attempts)];
}
