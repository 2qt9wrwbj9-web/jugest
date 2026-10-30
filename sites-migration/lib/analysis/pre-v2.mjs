import{activeModelView}from'../active-model-view.mjs';
import{rowToPrediction}from'./generated-pre-prediction-view.mjs';
// Async D1 persistence for the fixed PRE v2 contracts. Pure calculations and
// input validation are reused from the original source, without new criteria.
import{canonicalJson,hashCanonical}from'../../upstream/vps/src/canonical-json.mjs';
import{fingerprintModel}from'../../upstream/vps/src/research/model-search.mjs';
import{buildStoreReadPayload}from'../../upstream/vps/src/research/store-read-output.mjs';
import{__test as sourceStart,PRE_V2_SCORER_VERSION}from'../../upstream/vps/src/research/pre-v2/formal-start.mjs';
import{__test as sourceModel}from'../../upstream/vps/src/research/pre-v2/formal-model-store.mjs';
import{__test as sourcePrediction}from'../../upstream/vps/src/research/pre-v2/formal-prediction-store.mjs';
import{__test as sourceEvaluation}from'../../upstream/vps/src/research/pre-v2/formal-evaluation.mjs';
import{startFormalTrial,applyFormalDay}from'../../upstream/vps/src/research/pre-v2/trial.mjs';
import{buildRelevanceTruth}from'../../upstream/vps/src/research/pre-v2/outcome.mjs';
import{pairedNdcgDelta}from'../../upstream/vps/src/research/pre-v2/ndcg.mjs';
import{requireTrialShape,requireIsoTimestamp,rowToRecord,sameImmutableIdentity,evidenceForTrial}from'./generated-pre-trial-kernel.mjs';
import{createPrePlan,observe,insertRow,writeSql,commitPrePlan}from'./pre-atomic.mjs';
const required=(v,n)=>{const s=String(v??'').trim();if(!s)throw TypeError(`${n} is required`);return s};
const date=(v,n)=>{const s=required(v,n);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z')))throw TypeError(`${n} must be YYYY-MM-DD`);return s};
const iso=v=>{const s=required(v,'nowIso');if(!Number.isFinite(Date.parse(s)))throw TypeError('nowIso must be an ISO timestamp');return s};
const role=v=>{const s=required(v,'role');if(!['champion','challenger'].includes(s))throw RangeError('role must be champion or challenger');return s};
const number=v=>{const n=Number(v);if(!Number.isInteger(n)||n<1)throw TypeError('trialNumber must be a positive integer');return n};
const trialIdentity=o=>[required(o.storeId,'storeId'),required(o.lineageId,'lineageId'),number(o.trialNumber)];
function modelRow({trial,role:kind,model,featureVersion,nowIso}){
 const k=sourceModel.trialKey(trial),r=role(kind),version=required(featureVersion,'featureVersion'),at=iso(nowIso);
 if(!model||typeof model!=='object'||Array.isArray(model))throw TypeError('model must be an object');
 const fp=r==='champion'?k.championFingerprint:k.challengerFingerprint;
 if(fingerprintModel(model)!==fp)throw Error(`${r} formal model fingerprint does not match frozen trial fingerprint`);
 return{store_id:k.storeId,lineage_id:k.lineageId,trial_number:k.trialNumber,role:r,model_fingerprint:fp,feature_version:version,model_json:canonicalJson(model),model_hash:hashCanonical(model),created_at:at};
}
function predictionRow({trial,prediction,nowIso}){
 const n=sourcePrediction.normalizePrediction(trial,prediction),at=iso(nowIso);
 const hash=hashCanonical({targetDate:n.targetDate,role:n.role,modelFingerprint:n.modelFingerprint,sourceFrontierDate:n.sourceFrontierDate,machineSetHash:n.machineSetHash,rankings:n.rankings});
 return{store_id:n.storeId,lineage_id:n.lineageId,trial_number:n.trialNumber,target_date:n.targetDate,role:n.role,model_fingerprint:n.modelFingerprint,source_frontier_date:n.sourceFrontierDate,machine_set_hash:n.machineSetHash,rankings_json:canonicalJson(n.rankings),prediction_hash:hash,created_at:at};
}
function trialRow(trial,nowIso){requireTrialShape(trial);const at=requireIsoTimestamp(nowIso);return{store_id:trial.storeId,lineage_id:trial.lineageId,trial_number:trial.trialNumber,trial_version:trial.version,scorer_version:trial.scorerVersion,sequential_version:trial.top10.version,promotion_alpha:trial.promotionAlpha,safety_alpha:trial.safetyAlpha,champion_fingerprint:trial.championFingerprint,challenger_fingerprint:trial.challengerFingerprint,machine_set_hash:trial.machineSetHash,status:trial.status,decision:trial.decision,state_json:canonicalJson(trial),state_hash:hashCanonical(trial),started_at:at,updated_at:at,decision_at:trial.status==='running'?null:at,decision_target_date:trial.decisionTargetDate??null}}
export async function loadFormalModelSnapshot(db,options){const key=[...trialIdentity(options),role(options.role)];return sourceModel.rowToSnapshot(await db.prepare('SELECT * FROM pre_v2_formal_models WHERE store_id=? AND lineage_id=? AND trial_number=? AND role=?').bind(...key).first())}
export async function loadFormalPrediction(db,options){const key=[...trialIdentity(options),date(options.targetDate,'targetDate'),role(options.role)];return rowToPrediction(await db.prepare('SELECT * FROM pre_v2_formal_predictions WHERE store_id=? AND lineage_id=? AND trial_number=? AND target_date=? AND role=?').bind(...key).first())}
export async function loadTrialRecord(db,options){return rowToRecord(await db.prepare('SELECT * FROM pre_v2_formal_trials WHERE store_id=? AND lineage_id=? AND trial_number=?').bind(...trialIdentity(options)).first())}
export async function persistFormalModelSnapshot(db,options){
 const row=modelRow(options),plan=await createPrePlan(db,row.store_id),old=(await observe(plan,db,'pre_v2_formal_models','store_id=? AND lineage_id=? AND trial_number=? AND role=?',[row.store_id,row.lineage_id,row.trial_number,row.role]))[0];
 if(old){const loaded=sourceModel.rowToSnapshot(old);if(loaded.modelFingerprint!==row.model_fingerprint||loaded.featureVersion!==row.feature_version||loaded.modelHash!==row.model_hash)throw Error(`formal model snapshot conflict: ${row.store_id}/${row.lineage_id}/${row.trial_number}/${row.role}`);return{inserted:false,row:loaded}}
 insertRow(plan,'pre_v2_formal_models',row);await commitPrePlan(db,plan);return{inserted:true,row:sourceModel.rowToSnapshot(row)};
}
export async function persistFormalPrediction(db,options){
 const row=predictionRow(options),plan=await createPrePlan(db,row.store_id),old=(await observe(plan,db,'pre_v2_formal_predictions','store_id=? AND lineage_id=? AND trial_number=? AND target_date=? AND role=?',[row.store_id,row.lineage_id,row.trial_number,row.target_date,row.role]))[0];
 if(old){const loaded=rowToPrediction(old);if(loaded.predictionHash!==row.prediction_hash)throw Error(`formal prediction conflict: ${row.store_id}/${row.lineage_id}/${row.trial_number}/${row.target_date}/${row.role}`);return{inserted:false,row:loaded}}
 insertRow(plan,'pre_v2_formal_predictions',row);await commitPrePlan(db,plan);return{inserted:true,row:rowToPrediction(row)};
}
export async function planFormalLiveTrial(db,{storeId,lineageId,challengerFingerprint,featureVersion,days,frontierDate,nowIso,scorerVersion=PRE_V2_SCORER_VERSION}={},plan=null){
 const store=required(storeId,'storeId'),lineage=required(lineageId,'lineageId'),challengerFp=required(challengerFingerprint,'challengerFingerprint'),version=required(featureVersion,'featureVersion'),frontier=date(frontierDate,'frontierDate'),at=iso(nowIso),scorer=required(scorerVersion,'scorerVersion'),eligible=sourceStart.requireDays(days,frontier);plan??=await createPrePlan(db,store);
 const storeRow=(await observe(plan,db,'stores','id=?',[store]))[0];if(!storeRow)throw Error(`store missing: ${store}`);
 const active=(await observe(plan,db,'active_store_models'))[0];if(!active)throw Error(`active Champion model missing for store ${store}`);if(active.feature_version!==version)throw Error(`feature version mismatch: active=${active.feature_version} requested=${version}`);
 const model=activeModelView(active,store).model;if(fingerprintModel(model)!==active.fingerprint)throw Error('active Champion fingerprint does not match stored model');
 const challenger=(await observe(plan,db,'research_model_registry','store_id=? AND fingerprint=?',[store,challengerFp]))[0];if(!challenger)throw Error(`research Challenger model missing: ${challengerFp}`);if(challenger.status!=='research_champion')throw Error(`research Challenger must be research_champion; got ${challenger.status}`);
 const challengeModel=sourceStart.parseModel(challenger.model_json,'Challenger');if(fingerprintModel(challengeModel)!==challenger.fingerprint)throw Error('research Challenger fingerprint does not match stored model');if(challenger.fingerprint===active.fingerprint)throw Error('formal Challenger must be distinct from active Champion');
 const championPayload=buildStoreReadPayload({storeId:store,modelFingerprint:active.fingerprint,model,featureVersion:version,frontierDate:frontier,days:eligible,holdoutScore:active.holdout_score}),challengerPayload=buildStoreReadPayload({storeId:store,modelFingerprint:challenger.fingerprint,model:challengeModel,featureVersion:version,frontierDate:frontier,days:eligible});
 if(championPayload.status!=='ready'||!championPayload.rankings.length)throw Error('active Champion produced no formal prediction');if(challengerPayload.status!=='ready'||!challengerPayload.rankings.length)throw Error('research Challenger produced no formal prediction');if(championPayload.targetDate!==challengerPayload.targetDate)throw Error('formal prediction target date mismatch');
 const targetDate=championPayload.targetDate,keys=championPayload.rankings.map(r=>String(r.machineKey));if(!sourceStart.sameSet(keys,challengerPayload.rankings.map(r=>String(r.machineKey))))throw Error('Champion and Challenger must predict the exact same machine set');const machineSetHash=hashCanonical([...keys].sort());
 const running=(await observe(plan,db,'pre_v2_formal_trials',"store_id=? AND lineage_id=? AND status='running'",[store,lineage])).sort((a,b)=>b.trial_number-a.trial_number)[0];
 if(running){const record=rowToRecord(running),t=record.trial;if(t.championFingerprint!==active.fingerprint||t.challengerFingerprint!==challenger.fingerprint||t.machineSetHash!==machineSetHash||t.scorerVersion!==scorer)throw Error('a different running formal trial already exists for this store and lineage');
  const key={storeId:store,lineageId:lineage,trialNumber:t.trialNumber,targetDate},cp=await loadFormalPrediction(db,{...key,role:'champion'}),xp=await loadFormalPrediction(db,{...key,role:'challenger'});if(!cp||!xp)throw Error('running formal trial exists but frozen target predictions are incomplete');return{plan,result:{started:false,reason:'already_running',targetDate,trial:record,championPrediction:cp,challengerPrediction:xp}};
 }
 const prior=await observe(plan,db,'pre_v2_formal_trials','store_id=? AND lineage_id=? AND trial_number=(SELECT MAX(trial_number) FROM pre_v2_formal_trials WHERE store_id=? AND lineage_id=?)',[store,lineage,store,lineage]);const trialNumber=Number(prior[0]?.trial_number??0)+1;
 const trial=startFormalTrial({storeId:store,lineageId:lineage,trialNumber,championFingerprint:active.fingerprint,challengerFingerprint:challenger.fingerprint,machineSetHash,scorerVersion:scorer}),record=trialRow(trial,at),models=[modelRow({trial,role:'champion',model,featureVersion:version,nowIso:at}),modelRow({trial,role:'challenger',model:challengeModel,featureVersion:version,nowIso:at})],predictions=[predictionRow({trial,prediction:sourceStart.targetPrediction('champion',championPayload),nowIso:at}),predictionRow({trial,prediction:sourceStart.targetPrediction('challenger',challengerPayload),nowIso:at})];
 insertRow(plan,'pre_v2_formal_trials',record);for(const row of models)insertRow(plan,'pre_v2_formal_models',row);for(const row of predictions)insertRow(plan,'pre_v2_formal_predictions',row);
 return{plan,result:{started:true,reason:'started',targetDate,trial:rowToRecord(record),championPrediction:rowToPrediction(predictions[0]),challengerPrediction:rowToPrediction(predictions[1])}};
}
export async function startFormalLiveTrial(db,options){return executeSourcePlan(db,()=>planFormalLiveTrial(db,options),options)}
export async function planMaybeStartFinalizedTrial(db,{storeId,lineageId='pre-v2-live',featureVersion,days,frontierDate,nowIso=new Date().toISOString()}={}){
 const store=required(storeId,'storeId'),lineage=required(lineageId,'lineageId'),version=required(featureVersion,'featureVersion'),frontier=date(frontierDate,'frontierDate'),at=iso(nowIso),plan=await createPrePlan(db,store),loop=(await observe(plan,db,'research_loops'))[0];
 const stopped=reason=>({plan,result:{reason,scoredTargetDate:null,nextTargetDate:null,trial:null}});
 if(!loop)return stopped('no_research_loop');if(loop.feature_version!==version)return stopped('feature_version_mismatch');if(loop.state!=='converged'||!loop.holdout_finalized_at||!loop.holdout_winner_fingerprint)return stopped('holdout_not_finalized');
 const active=(await observe(plan,db,'active_store_models'))[0];if(!active)return stopped('no_active_champion');if(active.feature_version!==version)return stopped('feature_version_mismatch');if(active.fingerprint===loop.holdout_winner_fingerprint)return stopped('no_distinct_challenger');
 const pair=await observe(plan,db,'pre_v2_formal_trials','store_id=? AND lineage_id=? AND champion_fingerprint=? AND challenger_fingerprint=?',[store,lineage,active.fingerprint,loop.holdout_winner_fingerprint]);if(pair.length)return stopped('candidate_already_trialed');
 const started=await planFormalLiveTrial(db,{storeId:store,lineageId:lineage,challengerFingerprint:loop.holdout_winner_fingerprint,featureVersion:version,days,frontierDate:frontier,nowIso:at},plan);
 return{plan,result:{reason:started.result.reason,scoredTargetDate:null,nextTargetDate:started.result.targetDate??null,trial:started.result.trial??null}};
}
export async function maybeStartFinalizedFormalTrial(db,options){return executeSourcePlan(db,()=>planMaybeStartFinalizedTrial(db,options),options)}
export async function planScoreFormalTargetDay(db,{storeId,lineageId,trialNumber,targetDate,judgedRows,nowIso}={}){
 const [store,lineage,n]=trialIdentity({storeId,lineageId,trialNumber}),target=date(targetDate,'targetDate'),frozen=sourceEvaluation.normalizeJudgedRows(judgedRows),outcomeHash=hashCanonical(frozen),key={storeId:store,lineageId:lineage,trialNumber:n},plan=await createPrePlan(db,store),current=(await observe(plan,db,'pre_v2_formal_trials','store_id=? AND lineage_id=? AND trial_number=?',[store,lineage,n]))[0];
 if(!current)throw Error(`formal trial not found: ${store}/${lineage}/${n}`);const record=rowToRecord(current),dayWhere='store_id=? AND lineage_id=? AND trial_number=? AND target_date=?',dayValues=[store,lineage,n,target],duplicate=(await observe(plan,db,'pre_v2_formal_trial_days',dayWhere,dayValues))[0],outcome=(await observe(plan,db,'pre_v2_formal_outcomes',dayWhere,dayValues))[0];
 const pair=await observe(plan,db,'pre_v2_formal_predictions',dayWhere,dayValues),champion=rowToPrediction(pair.find(r=>r.role==='champion')),challenger=rowToPrediction(pair.find(r=>r.role==='challenger'));
 if(duplicate){if(!outcome||outcome.outcome_hash!==outcomeHash)throw Error(`formal outcome conflict: ${target}`);return{plan,result:{inserted:false,...sourceEvaluation.evidenceView(duplicate),trial:record,championPrediction:champion,challengerPrediction:challenger}}}
 if(!champion)throw Error(`champion formal prediction missing for ${target}`);if(!challenger)throw Error(`challenger formal prediction missing for ${target}`);
 const truth=buildRelevanceTruth({judgedRows:frozen,expectedMachineKeys:champion.rankings.map(r=>r.machineKey)}),top10=pairedNdcgDelta(challenger.rankings.map(r=>r.machineKey),champion.rankings.map(r=>r.machineKey),truth,10),top5=pairedNdcgDelta(challenger.rankings.map(r=>r.machineKey),champion.rankings.map(r=>r.machineKey),truth,5),day={targetDate:target,top10Delta:top10.informative?top10.delta:0,top5Delta:top5.informative?top5.delta:0,top10Informative:top10.informative,top5Informative:top5.informative},next=applyFormalDay(record.trial,day),at=requireIsoTimestamp(nowIso);
 if(!sameImmutableIdentity(record.trial,next))throw Error('formal trial immutable metadata conflict');if(outcome&&outcome.outcome_hash!==outcomeHash)throw Error(`formal outcome conflict: ${target}`);
 if(!outcome)insertRow(plan,'pre_v2_formal_outcomes',{store_id:store,lineage_id:lineage,trial_number:n,target_date:target,judged_rows_json:canonicalJson(frozen),outcome_hash:outcomeHash,created_at:at});
 const evidence=evidenceForTrial(next);insertRow(plan,'pre_v2_formal_trial_days',{store_id:store,lineage_id:lineage,trial_number:n,target_date:target,top10_delta:day.top10Delta,top5_delta:day.top5Delta,top10_informative:day.top10Informative?1:0,top5_informative:day.top5Informative?1:0,top10_log_e:next.top10.logE,top10_max_log_e:next.top10.maxLogE,top5_degradation_log_e:next.top5Degradation.logE,top5_degradation_max_log_e:next.top5Degradation.maxLogE,evidence_json:canonicalJson(evidence),evidence_hash:hashCanonical(evidence),state_hash_after:hashCanonical(next),created_at:at});
 const updated={...current,status:next.status,decision:next.decision,state_json:canonicalJson(next),state_hash:hashCanonical(next),updated_at:at,decision_at:next.status==='running'?current.decision_at:current.decision_at??at,decision_target_date:next.decisionTargetDate??null};writeSql(plan,'UPDATE pre_v2_formal_trials SET status=?,decision=?,state_json=?,state_hash=?,updated_at=?,decision_at=?,decision_target_date=? WHERE store_id=? AND lineage_id=? AND trial_number=? AND state_hash=?',[updated.status,updated.decision,updated.state_json,updated.state_hash,at,updated.decision_at,updated.decision_target_date,store,lineage,n,current.state_hash]);
 return{plan,result:{inserted:true,top10,top5,trial:rowToRecord(updated),championPrediction:champion,challengerPrediction:challenger}};
}
export async function scoreFormalTargetDay(db,options){return executeSourcePlan(db,()=>planScoreFormalTargetDay(db,options),options)}
// Same daily ordering as the source: wait for the sealed target, judge exactly
// that day, append evidence with CAS, then freeze the next prediction pair.
export async function planFormalLiveTrialDay(db,{storeId,lineageId='pre-v2-live',days,throughDate,nowIso,judgementRunner}={}){
 const store=required(storeId,'storeId'),lineage=required(lineageId,'lineageId'),through=date(throughDate,'throughDate');if(!Array.isArray(days)||!days.length)throw TypeError('days are required');
 const canonical=days.filter(d=>d&&String(d.date||'')<=through).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));if(!canonical.length||canonical.at(-1).date!==through)throw Error(`throughDate is not present in canonical days: ${through}`);
 let plan=await createPrePlan(db,store);const running=(await observe(plan,db,'pre_v2_formal_trials',"store_id=? AND lineage_id=? AND status='running'",[store,lineage])).sort((a,b)=>b.trial_number-a.trial_number)[0];
 if(!running)return{plan,result:{reason:'no_running_trial',scoredTargetDate:null,nextTargetDate:null,trial:null}};
 let record=rowToRecord(running);const key={storeId:store,lineageId:lineage,trialNumber:record.trial.trialNumber},where='store_id=? AND lineage_id=? AND trial_number=? AND (? IS NULL OR target_date>?)',params=[store,lineage,key.trialNumber,record.trial.lastTargetDate??null,record.trial.lastTargetDate??null],pendingRows=await observe(plan,db,'pre_v2_formal_predictions',where,params),dates=[...new Set(pendingRows.map(r=>r.target_date))].sort();
 if(dates.length>1)throw Error('formal trial has multiple outstanding prediction targets');const pending=dates[0]??null;if(pending&&pendingRows.length!==2)throw Error(`formal trial has incomplete prediction pair for ${pending}`);
 if(pending&&pending>through)return{plan,result:{reason:'waiting_for_target',scoredTargetDate:null,nextTargetDate:pending,trial:record}};
 let scoredTargetDate=null;
 if(pending){const truthDays=canonical.filter(d=>d.date<=pending);if(!truthDays.some(d=>d.date===pending))throw Error(`frozen formal target is missing from canonical days: ${pending}`);const identity=(await observe(plan,db,'stores','id=?',[store]))[0];if(!identity)throw Error(`store not found: ${store}`);if(typeof judgementRunner!=='function')throw Error('formal_judgement_runner_required');
  const judged=await judgementRunner({shop:required(identity.name,'store.name'),sourceStoreId:store,days:truthDays,targetDate:pending});if(!judged||judged.date!==pending||!Array.isArray(judged.rows))throw Error(`formal judgement runner did not return exact target ${pending}`);
  const scored=await planScoreFormalTargetDay(db,{...key,targetDate:pending,judgedRows:judged.rows,nowIso});if(scored.plan.revision!==plan.revision)throw Error('stale formal trial state writer');scored.plan.reads.unshift(...plan.reads);plan=scored.plan;record=scored.result.trial;scoredTargetDate=pending;
  if(record.trial.status!=='running')return{plan,result:{reason:record.trial.status,scoredTargetDate,nextTargetDate:null,trial:record}};
 }
 const models=await observe(plan,db,'pre_v2_formal_models','store_id=? AND lineage_id=? AND trial_number=?',[store,lineage,key.trialNumber]),champion=sourceModel.rowToSnapshot(models.find(r=>r.role==='champion')),challenger=sourceModel.rowToSnapshot(models.find(r=>r.role==='challenger'));if(!champion||!challenger)throw Error('formal model snapshots are incomplete');if(champion.featureVersion!==challenger.featureVersion)throw Error('formal model feature version mismatch');
 const cp=buildStoreReadPayload({storeId:store,modelFingerprint:champion.modelFingerprint,model:champion.model,featureVersion:champion.featureVersion,frontierDate:through,days:canonical}),xp=buildStoreReadPayload({storeId:store,modelFingerprint:challenger.modelFingerprint,model:challenger.model,featureVersion:challenger.featureVersion,frontierDate:through,days:canonical});
 if(cp.status!=='ready'||!cp.rankings.length)throw Error('champion formal prediction is unavailable');if(xp.status!=='ready'||!xp.rankings.length)throw Error('challenger formal prediction is unavailable');if(cp.targetDate!==xp.targetDate)throw Error('formal prediction target mismatch');if(!sourceStart.sameSet(cp.rankings.map(r=>String(r.machineKey)).sort(),xp.rankings.map(r=>String(r.machineKey)).sort()))throw Error('formal Champion and Challenger must rank the exact same machine set for each target day');
 const existing=await observe(plan,db,'pre_v2_formal_predictions','store_id=? AND lineage_id=? AND trial_number=? AND target_date=?',[store,lineage,key.trialNumber,cp.targetDate]);
 for(const [kind,payload]of [['champion',cp],['challenger',xp]]){const row=predictionRow({trial:record.trial,prediction:sourceStart.targetPrediction(kind,payload),nowIso}),old=existing.find(r=>r.role===kind);if(old&&old.prediction_hash!==row.prediction_hash)throw Error(`formal prediction conflict: ${store}/${lineage}/${key.trialNumber}/${cp.targetDate}/${kind}`);if(!old)insertRow(plan,'pre_v2_formal_predictions',row)}
 return{plan,result:{reason:scoredTargetDate?'advanced':'prediction_frozen',scoredTargetDate,nextTargetDate:cp.targetDate,trial:record}};
}
export async function advanceFormalLiveTrialDay(db,options){return executeSourcePlan(db,()=>planFormalLiveTrialDay(db,options),options)}
export const __test={modelRow,predictionRow,trialRow};

async function executeSourcePlan(db,build,options){for(let attempt=0;attempt<3;attempt++){const built=await build();try{if(built.plan.writes.length)await commitPrePlan(db,built.plan,options);return built.result}catch(error){if(attempt===2||!String(error?.message).includes('sites_pre_fence_valid'))throw error}}}
