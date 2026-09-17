import {hashCanonical} from '../../canonical-json.mjs';
import {pairedNdcgDelta} from './ndcg.mjs';
import {buildRelevanceTruth} from './outcome.mjs';
import {loadFormalPrediction} from './formal-prediction-store.mjs';
import {applyFormalDay} from './trial.mjs';
import {appendTrialDay,loadTrialRecord} from './trial-store.mjs';

function requireDb(db){
  if(!db||typeof db.prepare!=='function')throw new TypeError('database handle is required');
  return db;
}

function requireText(value,name){
  const text=String(value??'').trim();
  if(!text)throw new TypeError(`${name} is required`);
  return text;
}

function requireTrialNumber(value){
  const number=Number(value);
  if(!Number.isInteger(number)||number<1)throw new TypeError('trialNumber must be a positive integer');
  return number;
}

function requireDate(value,name='targetDate'){
  const text=requireText(value,name);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(`${text}T00:00:00Z`)))throw new TypeError(`${name} must be YYYY-MM-DD`);
  return text;
}

function existingDayRow(db,{storeId,lineageId,trialNumber,targetDate}){
  return db.prepare(`
    SELECT * FROM pre_v2_formal_trial_days
     WHERE store_id=? AND lineage_id=? AND trial_number=? AND target_date=?
  `).get(storeId,lineageId,trialNumber,targetDate)??null;
}

function existingOutcomeRow(db,{storeId,lineageId,trialNumber,targetDate}){
  return db.prepare(`
    SELECT * FROM pre_v2_formal_outcomes
     WHERE store_id=? AND lineage_id=? AND trial_number=? AND target_date=?
  `).get(storeId,lineageId,trialNumber,targetDate)??null;
}

function normalizeJudgedRows(judgedRows){
  if(!Array.isArray(judgedRows))throw new TypeError('judgedRows must be an array');
  return judgedRows.map((row,index)=>{
    if(!row||typeof row!=='object'||Array.isArray(row))throw new TypeError(`judgedRows[${index}] must be an object`);
    const tableNo=requireText(row.tableNo,`judgedRows[${index}].tableNo`);
    const machine=requireText(row.machine,`judgedRows[${index}].machine`);
    if(!Array.isArray(row.q))throw new TypeError(`judgedRows[${index}].q must be an array`);
    const q=row.q.map(Number);
    if(q.some(value=>!Number.isFinite(value)))throw new TypeError(`judgedRows[${index}].q must contain finite values`);
    const expectedSetting=Number(row.expectedSetting);
    if(!Number.isFinite(expectedSetting))throw new TypeError(`judgedRows[${index}].expectedSetting must be finite`);
    return{tableNo,machine,q,expectedSetting};
  }).sort((a,b)=>a.tableNo.localeCompare(b.tableNo,undefined,{numeric:true}));
}

function evidenceView(row){
  if(!row)return null;
  return{
    top10:Object.freeze({delta:Number(row.top10_delta),informative:Boolean(row.top10_informative)}),
    top5:Object.freeze({delta:Number(row.top5_delta),informative:Boolean(row.top5_informative)}),
  };
}

export function scoreFormalTargetDay(db,{
  storeId,
  lineageId,
  trialNumber,
  targetDate,
  judgedRows,
  nowIso,
}={}){
  requireDb(db);
  const store=requireText(storeId,'storeId');
  const lineage=requireText(lineageId,'lineageId');
  const number=requireTrialNumber(trialNumber);
  const date=requireDate(targetDate);
  const frozenOutcomeRows=normalizeJudgedRows(judgedRows);
  const outcomeHash=hashCanonical(frozenOutcomeRows);

  const key={storeId:store,lineageId:lineage,trialNumber:number};
  const current=loadTrialRecord(db,key);
  if(!current)throw new Error(`formal trial not found: ${store}/${lineage}/${number}`);

  const duplicate=existingDayRow(db,{...key,targetDate:date});
  if(duplicate){
    const storedOutcome=existingOutcomeRow(db,{...key,targetDate:date});
    if(!storedOutcome||storedOutcome.outcome_hash!==outcomeHash)throw new Error(`formal outcome conflict: ${date}`);
    const evidence=evidenceView(duplicate);
    return Object.freeze({
      inserted:false,
      ...evidence,
      trial:current,
      championPrediction:loadFormalPrediction(db,{...key,targetDate:date,role:'champion'}),
      challengerPrediction:loadFormalPrediction(db,{...key,targetDate:date,role:'challenger'}),
    });
  }

  const championPrediction=loadFormalPrediction(db,{...key,targetDate:date,role:'champion'});
  if(!championPrediction)throw new Error(`champion formal prediction missing for ${date}`);
  const challengerPrediction=loadFormalPrediction(db,{...key,targetDate:date,role:'challenger'});
  if(!challengerPrediction)throw new Error(`challenger formal prediction missing for ${date}`);

  const championKeys=championPrediction.rankings.map(row=>row.machineKey);
  const challengerKeys=challengerPrediction.rankings.map(row=>row.machineKey);
  const truth=buildRelevanceTruth({judgedRows:frozenOutcomeRows,expectedMachineKeys:championKeys});

  const top10=pairedNdcgDelta(challengerKeys,championKeys,truth,10);
  const top5=pairedNdcgDelta(challengerKeys,championKeys,truth,5);
  const day={
    targetDate:date,
    top10Delta:top10.informative?top10.delta:0,
    top5Delta:top5.informative?top5.delta:0,
    top10Informative:top10.informative,
    top5Informative:top5.informative,
  };

  const nextTrial=applyFormalDay(current.trial,day);
  const appended=appendTrialDay(db,{trial:nextTrial,day,outcomeRows:frozenOutcomeRows,nowIso});
  const savedTrial=appended.trial??loadTrialRecord(db,key);

  return Object.freeze({
    inserted:appended.inserted,
    top10,
    top5,
    trial:savedTrial,
    championPrediction,
    challengerPrediction,
  });
}

export const __test={existingDayRow,existingOutcomeRow,normalizeJudgedRows,evidenceView};
