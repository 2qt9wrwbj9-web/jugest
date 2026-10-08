import {canonicalJson,hashCanonical} from '../canonical-json.mjs';
import {inspectDay,readDayIntegrity,saveDayIntegrity} from '../ingest/day-integrity.mjs';
export function migrateEvaluationState(db){
  db.exec(`CREATE TABLE IF NOT EXISTS prediction_evaluation_state(
    store_id TEXT NOT NULL,target_date TEXT NOT NULL,series TEXT NOT NULL,
    state TEXT NOT NULL,reason TEXT,normalized_hash TEXT,outcome_hash TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL,
    PRIMARY KEY(store_id,target_date,series),FOREIGN KEY(store_id) REFERENCES stores(id));
    CREATE INDEX IF NOT EXISTS prediction_evaluation_pending_idx ON prediction_evaluation_state(store_id,state,target_date);`);
}
export function saveEvaluationState(db,{storeId,targetDate,series='live',state,reason=null,normalizedHash=null,outcomeHash=null,details={},nowIso=new Date().toISOString()}={}){
  db.prepare(`INSERT INTO prediction_evaluation_state VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(store_id,target_date,series) DO UPDATE SET
    state=excluded.state,reason=excluded.reason,normalized_hash=excluded.normalized_hash,outcome_hash=excluded.outcome_hash,details_json=excluded.details_json,updated_at=excluded.updated_at`)
    .run(storeId,targetDate,series,state,reason,normalizedHash,outcomeHash,canonicalJson(details),nowIso);
}
export function readEvaluationState(db,{storeId,targetDate,series='live'}={}){
  const r=db.prepare('SELECT * FROM prediction_evaluation_state WHERE store_id=? AND target_date=? AND series=?').get(storeId,targetDate,series);
  return r?{state:r.state,reason:r.reason,normalizedHash:r.normalized_hash,outcomeHash:r.outcome_hash,details:JSON.parse(r.details_json),updatedAt:r.updated_at}:null;
}
export function loadEvaluationDay(db,{storeId,targetDate,nowIso=new Date().toISOString()}={}){
  const day=db.prepare('SELECT * FROM store_days WHERE store_id=? AND business_date=?').get(storeId,targetDate);
  if(!day)return{state:'waiting_result',reason:'outcome_unavailable',day:null};
  const machines=db.prepare('SELECT payload_json FROM machine_day_data WHERE store_id=? AND business_date=? ORDER BY machine_key').all(storeId,targetDate).map(r=>JSON.parse(r.payload_json));
  let check=readDayIntegrity(db,{storeId,date:targetDate});
  if(!check||check.normalizedHash!==day.normalized_payload_hash){
    check=inspectDay(db,{storeId,date:targetDate,day:{machines},nowIso,allowExistingDayInventory:false});
    saveDayIntegrity(db,{storeId,date:targetDate,normalizedHash:day.normalized_payload_hash,check,nowIso});
  }
  const state=check.status==='unpublished'||check.status==='provisional'?'waiting_result':'data_insufficient';
  if(day.quality_status!=='valid'||!check.eligibleForEvaluation)return{state,reason:`integrity_${check.status}`,day,check,machines};
  const outcomeRows=machines.map(row=>({machineKey:String(row.tableNo??row.table_no).trim(),outcomeScore:Number(row.diff),machineName:String(row.sourceMachineName??row.machineName??row.machine).trim()}));
  // Keep the existing score hash input exactly; identity is an additional gate.
  const outcomeInputHash=hashCanonical({storeId,targetDate,normalizedPayloadHash:String(day.normalized_payload_hash??''),sourceHash:String(day.source_hash??''),outcomeRows:outcomeRows.map(({machineKey,outcomeScore})=>({machineKey,outcomeScore}))});
  return{state:'ready',reason:null,day,check,machines,outcomeRows,outcomeInputHash};
}
