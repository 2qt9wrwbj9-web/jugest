import {getActiveStoreModel} from '../store-read-output.mjs';
import {startFormalLiveTrial} from './formal-start.mjs';
import {migratePreV2TrialStore} from './trial-store.mjs';

function requireDb(db){if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw new TypeError('database handle is required');return db}
function requireText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function requireDate(value,name){const text=requireText(value,name);if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(`${text}T00:00:00Z`)))throw new TypeError(`${name} must be YYYY-MM-DD`);return text}
function requireIso(value){const text=requireText(value,'nowIso');if(!Number.isFinite(Date.parse(text)))throw new TypeError('nowIso must be an ISO timestamp');return text}

function finalizedCandidate(db,{storeId,featureVersion}){
  const loop=db.prepare(`
    SELECT feature_version,state,holdout_finalized_at,holdout_winner_fingerprint
      FROM research_loops
     WHERE store_id=?
  `).get(storeId);
  if(!loop)return{reason:'no_research_loop',fingerprint:null};
  if(loop.feature_version!==featureVersion)return{reason:'feature_version_mismatch',fingerprint:null};
  if(loop.state!=='converged'||!loop.holdout_finalized_at||!loop.holdout_winner_fingerprint)return{reason:'holdout_not_finalized',fingerprint:null};
  return{reason:'ready',fingerprint:String(loop.holdout_winner_fingerprint)};
}

function pairWasTrialed(db,{storeId,lineageId,championFingerprint,challengerFingerprint}){
  return Boolean(db.prepare(`
    SELECT 1
      FROM pre_v2_formal_trials
     WHERE store_id=? AND lineage_id=?
       AND champion_fingerprint=? AND challenger_fingerprint=?
     LIMIT 1
  `).get(storeId,lineageId,championFingerprint,challengerFingerprint));
}

export function maybeStartFinalizedFormalTrial(db,{
  storeId,
  lineageId='pre-v2-live',
  featureVersion,
  days,
  frontierDate,
  nowIso=new Date().toISOString(),
}={}){
  requireDb(db);migratePreV2TrialStore(db);
  const store=requireText(storeId,'storeId');
  const lineage=requireText(lineageId,'lineageId');
  const version=requireText(featureVersion,'featureVersion');
  const frontier=requireDate(frontierDate,'frontierDate');
  const at=requireIso(nowIso);

  const candidate=finalizedCandidate(db,{storeId:store,featureVersion:version});
  if(candidate.reason!=='ready')return Object.freeze({reason:candidate.reason,scoredTargetDate:null,nextTargetDate:null,trial:null});

  const active=getActiveStoreModel(db,{storeId:store});
  if(!active)return Object.freeze({reason:'no_active_champion',scoredTargetDate:null,nextTargetDate:null,trial:null});
  if(active.featureVersion!==version)return Object.freeze({reason:'feature_version_mismatch',scoredTargetDate:null,nextTargetDate:null,trial:null});
  if(active.fingerprint===candidate.fingerprint)return Object.freeze({reason:'no_distinct_challenger',scoredTargetDate:null,nextTargetDate:null,trial:null});
  if(pairWasTrialed(db,{storeId:store,lineageId:lineage,championFingerprint:active.fingerprint,challengerFingerprint:candidate.fingerprint})){
    return Object.freeze({reason:'candidate_already_trialed',scoredTargetDate:null,nextTargetDate:null,trial:null});
  }

  const started=startFormalLiveTrial(db,{
    storeId:store,lineageId:lineage,challengerFingerprint:candidate.fingerprint,
    featureVersion:version,days,frontierDate:frontier,nowIso:at,
  });
  return Object.freeze({
    reason:started.reason,
    scoredTargetDate:null,
    nextTargetDate:started.targetDate??null,
    trial:started.trial??null,
  });
}

export const __test={finalizedCandidate,pairWasTrialed};
