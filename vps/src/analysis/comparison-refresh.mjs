import {hashCanonical} from '../canonical-json.mjs';
import {scoreLiveComparisonDay} from '../research/live-comparison.mjs';

function requiredText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function validDate(value,name){const text=requiredText(value,name);if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(`${text}T00:00:00Z`)))throw new TypeError(`${name} must be YYYY-MM-DD`);return text}
function validIso(value){const text=requiredText(value,'nowIso');if(!Number.isFinite(Date.parse(text)))throw new TypeError('nowIso must be ISO date-time');return text}
function safeJson(text){try{return JSON.parse(text)}catch{return null}}

function loadCanonicalOutcome(db,{storeId,targetDate}){
  const day=db.prepare(`SELECT normalized_payload_hash,source_hash,quality_status FROM store_days
    WHERE store_id=? AND business_date=? LIMIT 1`).get(storeId,targetDate);
  if(!day||day.quality_status!=='valid')return null;
  const rawRows=db.prepare(`SELECT machine_key,payload_json FROM machine_day_data
    WHERE store_id=? AND business_date=? ORDER BY machine_key`).all(storeId,targetDate);
  const outcomeRows=[];
  for(const row of rawRows){
    const payload=safeJson(row.payload_json);if(!payload)continue;
    const machineKey=String(payload.tableNo??payload.table_no??row.machine_key??'').trim();
    const outcomeScore=Number(payload.diff);
    if(!machineKey||!Number.isFinite(outcomeScore))continue;
    outcomeRows.push(Object.freeze({machineKey,outcomeScore}));
  }
  if(!outcomeRows.length)return null;
  const input=Object.freeze({storeId,targetDate,normalizedPayloadHash:String(day.normalized_payload_hash??''),sourceHash:String(day.source_hash??''),outcomeRows:Object.freeze(outcomeRows)});
  return Object.freeze({outcomeRows:Object.freeze(outcomeRows),outcomeInputHash:hashCanonical(input)});
}

export function scoreAvailableComparisonDays(db,{storeId,throughDate,nowIso=new Date().toISOString()}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId'),through=validDate(throughDate,'throughDate'),at=validIso(nowIso);
  const targets=db.prepare(`SELECT DISTINCT target_date FROM store_prediction_snapshots
    WHERE store_id=? AND target_date<=? ORDER BY target_date ASC`).all(id,through).map(row=>row.target_date);
  let scored=0,excluded=0;
  const rows=[];
  for(const targetDate of targets){
    const outcome=loadCanonicalOutcome(db,{storeId:id,targetDate});
    if(!outcome){excluded+=1;rows.push(Object.freeze({targetDate,status:'excluded',reason:'outcome_unavailable'}));continue}
    const comparison=scoreLiveComparisonDay(db,{storeId:id,targetDate,outcomeRows:outcome.outcomeRows,outcomeInputHash:outcome.outcomeInputHash,nowIso:at});
    if(!comparison||comparison.excludedReason){excluded+=1;rows.push(Object.freeze({targetDate,status:'excluded',reason:comparison?.excludedReason??'comparison_unavailable',outcomeInputHash:outcome.outcomeInputHash}));continue}
    scored+=1;rows.push(Object.freeze({targetDate,status:'scored',winner:comparison.winner,outcomeInputHash:outcome.outcomeInputHash}));
  }
  return Object.freeze({storeId:id,throughDate:through,scored,excluded,rows:Object.freeze(rows)});
}

export const __test={loadCanonicalOutcome};
