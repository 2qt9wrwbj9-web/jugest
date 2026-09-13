import {canonicalJson} from '../canonical-json.mjs';
import {enqueueJob} from '../queue.mjs';
import {baselineModel,fingerprintModel,shouldConverge} from '../research/model-search.mjs';
import {finalizeSealedHoldout} from '../research/holdout.mjs';

const BACKTEST_PRIORITY=50;
const MODEL_SEARCH_PRIORITY=60;
const BACKTEST_LEASE_MIB=768;
const MODEL_SEARCH_LEASE_MIB=896;

function requiredText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function date(value,name){const text=requiredText(value,name);if(!/^\d{4}-\d{2}-\d{2}$/.test(text))throw new TypeError(`${name} must be YYYY-MM-DD`);return text}
function iso(value){const text=requiredText(value,'nowIso');if(!Number.isFinite(Date.parse(text)))throw new TypeError('nowIso must be ISO date-time');return text}
function json(text,fallback={}){try{return JSON.parse(text)}catch{return fallback}}

export function getResearchLoop(db,{storeId}={}){
  const id=requiredText(storeId,'storeId');
  const row=db.prepare('SELECT * FROM research_loops WHERE store_id=?').get(id);if(!row)return null;
  return Object.freeze({storeId:row.store_id,featureVersion:row.feature_version,currentFingerprint:row.current_fingerprint??null,bestFingerprint:row.best_fingerprint??null,generation:Number(row.generation)||0,noImproveCount:Number(row.no_improve_count)||0,repeatedFingerprint:row.repeated_fingerprint??null,state:row.state,lastError:row.last_error??null,frontierDate:row.frontier_date??null,searchRound:Number(row.search_round)||0,holdoutFinalizedAt:row.holdout_finalized_at??null,holdoutWinnerFingerprint:row.holdout_winner_fingerprint??null,updatedAt:row.updated_at});
}

export function getResearchChampion(db,{storeId}={}){
  const id=requiredText(storeId,'storeId');
  const row=db.prepare("SELECT * FROM research_model_registry WHERE store_id=? AND status='research_champion' ORDER BY generation DESC,updated_at DESC LIMIT 1").get(id);if(!row)return null;
  return Object.freeze({storeId:id,fingerprint:row.fingerprint,model:json(row.model_json,{}),parentFingerprint:row.parent_fingerprint??null,generation:Number(row.generation)||0,validationScore:row.validation_score==null?null:Number(row.validation_score),holdoutScore:row.holdout_score==null?null:Number(row.holdout_score),scores:json(row.score_json,{}),createdAt:row.created_at,updatedAt:row.updated_at});
}

function ensureBaselineChampion(db,{storeId,nowIso}){
  let champion=getResearchChampion(db,{storeId});if(champion)return champion;
  const model=baselineModel(),fingerprint=fingerprintModel(model);
  db.prepare(`INSERT OR IGNORE INTO research_model_registry(store_id,fingerprint,model_json,parent_fingerprint,generation,status,validation_score,holdout_score,score_json,created_at,updated_at)
    VALUES(?,?,?,NULL,0,'research_champion',NULL,NULL,'{}',?,?)`).run(storeId,fingerprint,canonicalJson(model),nowIso,nowIso);
  db.prepare("UPDATE research_model_registry SET status='research_champion',updated_at=? WHERE store_id=? AND fingerprint=?").run(nowIso,storeId,fingerprint);
  return getResearchChampion(db,{storeId});
}

function scheduleBacktest(db,{storeId,featureVersion,frontierDate,modelFingerprint,generation,nowIso}){
  return enqueueJob(db,{type:'BACKTEST',priority:BACKTEST_PRIORITY,idempotencyKey:`backtest:${storeId}:${frontierDate}:${modelFingerprint}:g${generation}`,payload:{storeId,featureVersion,frontierDate,modelFingerprint,generation},sizeClass:'large',estimatedLeaseMiB:BACKTEST_LEASE_MIB,maxAttempts:3,createdAtIso:nowIso});
}
function scheduleModelSearch(db,{storeId,featureVersion,frontierDate,modelFingerprint,generation,round,nowIso}){
  return enqueueJob(db,{type:'MODEL_SEARCH',priority:MODEL_SEARCH_PRIORITY,idempotencyKey:`model-search:${storeId}:${frontierDate}:${modelFingerprint}:g${generation}:r${round}`,payload:{storeId,featureVersion,frontierDate,modelFingerprint,generation,round},sizeClass:'large',estimatedLeaseMiB:MODEL_SEARCH_LEASE_MIB,maxAttempts:3,createdAtIso:nowIso});
}

export function ensureResearchCycle(db,{storeId,featureVersion,frontierDate,nowIso}={}){
  const id=requiredText(storeId,'storeId'),version=requiredText(featureVersion,'featureVersion'),frontier=date(frontierDate,'frontierDate'),at=iso(nowIso);
  const champion=ensureBaselineChampion(db,{storeId:id,nowIso:at});
  const existing=getResearchLoop(db,{storeId:id});
  if(!existing){
    db.prepare(`INSERT INTO research_loops(store_id,feature_version,current_fingerprint,best_fingerprint,generation,no_improve_count,repeated_fingerprint,state,last_error,frontier_date,search_round,updated_at)
      VALUES(?,?,?,?,0,0,NULL,'running',NULL,?,0,?)`).run(id,version,champion.fingerprint,champion.fingerprint,frontier,at);
  }else if(existing.frontierDate!==frontier){
    db.prepare(`UPDATE research_loops SET feature_version=?,current_fingerprint=?,best_fingerprint=?,no_improve_count=0,repeated_fingerprint=NULL,state='running',last_error=NULL,frontier_date=?,search_round=0,holdout_finalized_at=NULL,holdout_winner_fingerprint=NULL,updated_at=? WHERE store_id=?`)
      .run(version,champion.fingerprint,champion.fingerprint,frontier,at,id);
  }else{
    db.prepare("UPDATE research_loops SET state='running',last_error=NULL,updated_at=? WHERE store_id=?").run(at,id);
  }
  const loop=getResearchLoop(db,{storeId:id});
  const job=scheduleBacktest(db,{storeId:id,featureVersion:version,frontierDate:frontier,modelFingerprint:champion.fingerprint,generation:loop.generation,nowIso:at});
  return {loop,champion,job};
}

export function recordBacktestCompletion(db,{storeId,frontierDate,modelFingerprint,nowIso}={}){
  const id=requiredText(storeId,'storeId'),frontier=date(frontierDate,'frontierDate'),fingerprint=requiredText(modelFingerprint,'modelFingerprint'),at=iso(nowIso);
  const loop=getResearchLoop(db,{storeId:id});if(!loop)throw Object.assign(new Error('research loop missing'),{code:'research_loop_missing'});
  if(loop.frontierDate&&loop.frontierDate!==frontier)return {loop,job:null,stale:true};
  const round=loop.searchRound;
  const job=scheduleModelSearch(db,{storeId:id,featureVersion:loop.featureVersion,frontierDate:frontier,modelFingerprint:fingerprint,generation:loop.generation,round,nowIso:at});
  return {loop,job,stale:false};
}

function upsertCandidate(db,{storeId,model,parentFingerprint,generation,status,validationScore,scoreJson,nowIso}){
  const fingerprint=fingerprintModel(model);
  db.prepare(`INSERT INTO research_model_registry(store_id,fingerprint,model_json,parent_fingerprint,generation,status,validation_score,holdout_score,score_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,NULL,?,?,?)
    ON CONFLICT(store_id,fingerprint) DO UPDATE SET parent_fingerprint=COALESCE(research_model_registry.parent_fingerprint,excluded.parent_fingerprint),generation=MAX(research_model_registry.generation,excluded.generation),status=excluded.status,validation_score=excluded.validation_score,score_json=excluded.score_json,updated_at=excluded.updated_at`)
    .run(storeId,fingerprint,canonicalJson(model),parentFingerprint,generation,status,validationScore,canonicalJson(scoreJson??{}),nowIso,nowIso);
  return fingerprint;
}

export function recordModelSearchCompletion(db,{storeId,frontierDate,championFingerprint,candidateModel=null,improved=false,validationScore=null,scoreJson={},days=null,nowIso}={}){
  const id=requiredText(storeId,'storeId'),frontier=date(frontierDate,'frontierDate'),championFp=requiredText(championFingerprint,'championFingerprint'),at=iso(nowIso);
  const loop=getResearchLoop(db,{storeId:id});if(!loop)throw Object.assign(new Error('research loop missing'),{code:'research_loop_missing'});
  if(loop.frontierDate&&loop.frontierDate!==frontier)return {loop,job:null,stale:true,converged:false};
  const proposedFp=candidateModel?fingerprintModel(candidateModel):null;
  const seenRows=db.prepare('SELECT fingerprint FROM research_model_registry WHERE store_id=?').all(id);
  const seen=new Set(seenRows.map(row=>row.fingerprint));
  const repeated=Boolean(proposedFp&&seen.has(proposedFp)&&proposedFp!==championFp);

  if(improved&&candidateModel&&!repeated&&proposedFp!==championFp){
    const nextGeneration=loop.generation+1;
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare("UPDATE research_model_registry SET status='historical',updated_at=? WHERE store_id=? AND status='research_champion'").run(at,id);
      const fp=upsertCandidate(db,{storeId:id,model:candidateModel,parentFingerprint:championFp,generation:nextGeneration,status:'research_champion',validationScore,scoreJson,nowIso:at});
      db.prepare(`UPDATE research_loops SET current_fingerprint=?,best_fingerprint=?,generation=?,no_improve_count=0,repeated_fingerprint=NULL,state='running',search_round=0,updated_at=? WHERE store_id=?`)
        .run(fp,fp,nextGeneration,at,id);
      db.exec('COMMIT');
    }catch(error){try{db.exec('ROLLBACK')}catch{}throw error}
    const next=getResearchLoop(db,{storeId:id});
    const job=scheduleBacktest(db,{storeId:id,featureVersion:next.featureVersion,frontierDate:frontier,modelFingerprint:next.currentFingerprint,generation:next.generation,nowIso:at});
    return {loop:next,job,stale:false,converged:false,promotedFingerprint:next.currentFingerprint};
  }

  if(candidateModel&&proposedFp!==championFp){upsertCandidate(db,{storeId:id,model:candidateModel,parentFingerprint:championFp,generation:loop.generation,status:'rejected',validationScore,scoreJson,nowIso:at})}
  const noImprove=loop.noImproveCount+1;
  const convergence=shouldConverge({seenFingerprints:repeated?new Set([proposedFp]):new Set(),proposedFingerprint:proposedFp,noImproveCount:noImprove});
  if(convergence){
    db.prepare(`UPDATE research_loops SET no_improve_count=?,repeated_fingerprint=?,state='converged',updated_at=? WHERE store_id=?`).run(noImprove,convergence.reason==='repeat'?proposedFp:null,at,id);
    const holdout=Array.isArray(days)?finalizeSealedHoldout(db,{storeId:id,days,frontierDate:frontier,nowIso:at}):null;
    return {loop:getResearchLoop(db,{storeId:id}),job:null,stale:false,converged:true,reason:convergence.reason,holdout};
  }
  const nextRound=loop.searchRound+1;
  db.prepare(`UPDATE research_loops SET no_improve_count=?,search_round=?,state='running',updated_at=? WHERE store_id=?`).run(noImprove,nextRound,at,id);
  const next=getResearchLoop(db,{storeId:id});
  const job=scheduleModelSearch(db,{storeId:id,featureVersion:next.featureVersion,frontierDate:frontier,modelFingerprint:championFp,generation:next.generation,round:nextRound,nowIso:at});
  return {loop:next,job,stale:false,converged:false};
}

export const __test={BACKTEST_PRIORITY,MODEL_SEARCH_PRIORITY,BACKTEST_LEASE_MIB,MODEL_SEARCH_LEASE_MIB,ensureBaselineChampion,scheduleBacktest,scheduleModelSearch};
