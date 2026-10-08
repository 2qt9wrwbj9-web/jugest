import {hashCanonical,canonicalJson} from '../canonical-json.mjs';

export function migrateDayIntegrity(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS store_day_integrity (
      store_id TEXT NOT NULL,business_date TEXT NOT NULL,normalized_hash TEXT NOT NULL,
      check_json TEXT NOT NULL,checked_at TEXT NOT NULL,
      PRIMARY KEY(store_id,business_date),
      FOREIGN KEY(store_id,business_date) REFERENCES store_days(store_id,business_date) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS ingest_receipts (
      store_id TEXT NOT NULL,business_date TEXT NOT NULL,normalized_hash TEXT NOT NULL,
      source TEXT NOT NULL,raw_artifact_path TEXT,decision TEXT NOT NULL,check_json TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(store_id,business_date,normalized_hash)
    );
    CREATE INDEX IF NOT EXISTS ingest_receipts_store_seen_idx ON ingest_receipts(store_id,last_seen_at DESC);
  `);
}

export function numericValue(value){
  if(value==null||typeof value==='boolean'||String(value).trim()==='')return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
}
export function machineIdentity(row){
  return {key:String(row?.tableNo??row?.table_no??'').trim(),name:String(row?.sourceMachineName??row?.machineName??row?.machine??'').trim()};
}
function parse(text){try{return JSON.parse(text)}catch{return null}}
function keysForRows(rows){return rows.map(machineIdentity).map(x=>x.key).filter(Boolean).sort()}
function recentInventory(db,storeId,date,allowExistingDay){
  const dates=db.prepare("SELECT business_date FROM store_days WHERE store_id=? AND business_date<=? AND quality_status='valid' ORDER BY business_date DESC LIMIT 7").all(storeId,date);
  const machineStmt=db.prepare('SELECT payload_json FROM machine_day_data WHERE store_id=? AND business_date=? ORDER BY machine_key');
  const sets=dates.filter(d=>allowExistingDay||d.business_date!==date).map(d=>({date:d.business_date,keys:keysForRows(machineStmt.all(storeId,d.business_date).map(row=>parse(row.payload_json)).filter(Boolean))}));
  const same=sets.find(row=>row.date===date);if(same?.keys.length)return {keys:same.keys,basis:'previous_same_day'};
  if(sets.length<3)return null;
  const counts=new Map();for(const row of sets){const key=canonicalJson(row.keys),entry=counts.get(key)??{keys:row.keys,n:0};entry.n++;counts.set(key,entry)}
  const stable=[...counts.values()].sort((a,b)=>b.n-a.n)[0];
  return stable.n>=3&&stable.n/sets.length>=.75?{keys:stable.keys,basis:'stable_recent_inventory'}:null;
}

export function inspectDay(db,{storeId,date,day,nowIso=new Date().toISOString(),expectedMachineKeys=null,allowExistingDayInventory=true}={}){
  const machines=Array.isArray(day?.machines)?day.machines:[],quality=day?.quality??{};
  const issues=[],missingFields={tableNo:0,machine:0,games:0,bb:0,rb:0,diff:0},counts=new Map();
  let badCounters=0;
  for(const row of machines){
    const identity=machineIdentity(row);if(!identity.key)missingFields.tableNo++;else counts.set(identity.key,(counts.get(identity.key)??0)+1);
    if(!identity.name)missingFields.machine++;
    for(const field of ['games','bb','rb','diff'])if(numericValue(row?.[field])===null)missingFields[field]++;
    const nums=['games','bb','rb'].map(k=>numericValue(row?.[k]));
    if(nums.some(n=>n!==null&&(!Number.isInteger(n)||n<0))||(nums.every(n=>n!==null)&&nums[1]+nums[2]>nums[0]))badCounters++;
  }
  const duplicateKeys=[...counts].filter(([,n])=>n>1).map(([key])=>key).sort(),actualKeys=[...counts.keys()].sort();
  let expected=expectedMachineKeys??quality.expectedMachineKeys??day?.expectedMachineKeys,inventoryBasis='source';
  if(!Array.isArray(expected)){
    const recent=recentInventory(db,storeId,date,allowExistingDayInventory);expected=recent?.keys??null;inventoryBasis=recent?.basis??'unknown';
  }else expected=expected.map(k=>String(k).trim());
  const invalidInventory=expected!==null&&(expected.some(k=>!k)||new Set(expected).size!==expected.length);
  if(expected)expected=[...new Set(expected)].sort();
  const explicitCount=numericValue(quality.expectedMachineCount??day?.expectedMachineCount);
  let expectedCount=expected?.length??null;
  if(expectedCount===null&&Number.isInteger(explicitCount)&&explicitCount>=0){expectedCount=explicitCount;inventoryBasis='source_count'}
  const actualSet=new Set(actualKeys),missingKeys=(expected??[]).filter(key=>!actualSet.has(key));
  const jstToday=new Date(Date.parse(nowIso)+9*3600000).toISOString().slice(0,10);
  const publicationStatus=String(quality.publicationStatus??day?.publicationStatus??'').trim();
  const provisional=date>=jstToday||['in_progress','provisional'].includes(publicationStatus);
  const unpublished=publicationStatus==='unpublished';
  const invalid=!machines.length||missingFields.tableNo>0||missingFields.machine>0||['games','bb','rb'].some(k=>missingFields[k]>0)||badCounters>0||duplicateKeys.length>0||invalidInventory;
  const missingInventory=missingKeys.length>0||(expectedCount!==null&&actualKeys.length<expectedCount);
  if(invalid)issues.push('識別・必須数値・重複を確認してね');
  if(missingInventory)issues.push(inventoryBasis==='source'||inventoryBasis==='source_count'?'取得対象の台が欠けている':'欠損または台構成変更の確認が必要');
  if(missingFields.diff)issues.push(`差枚不明${missingFields.diff}台（0枚とは別）`);
  if(provisional)issues.push('営業日途中または確定前');
  if(unpublished)issues.push('取得元未公開');
  if(inventoryBasis==='unknown')issues.push('対象台集合は未確認');
  const eligibleForAnalysis=!invalid&&!missingInventory&&!provisional&&!unpublished;
  const eligibleForEvaluation=eligibleForAnalysis&&missingFields.diff===0&&expectedCount!==null;
  const status=unpublished?'unpublished':invalid?'invalid':provisional?'provisional':missingInventory||missingFields.diff?'partial':expectedCount===null?'unverified':'complete';
  return Object.freeze({version:'day-integrity-v1',status,inventoryBasis,expectedCount,actualCount:actualKeys.length,
    expectedKeys:expected,actualKeys,missingKeys,duplicateKeys,missingFields,badCounters,publicationStatus:provisional?'in_progress':unpublished?'unpublished':'final',
    eligibleForAnalysis,eligibleForEvaluation,issues,checkedAt:nowIso,inventoryHash:hashCanonical(actualKeys)});
}

export function readDayIntegrity(db,{storeId,date}={}){
  const row=db.prepare('SELECT normalized_hash,check_json,checked_at FROM store_day_integrity WHERE store_id=? AND business_date=?').get(storeId,date);
  return row?{...parse(row.check_json),normalizedHash:row.normalized_hash,checkedAt:row.checked_at}:null;
}
export function saveDayIntegrity(db,{storeId,date,normalizedHash,check,nowIso}={}){
  db.prepare(`INSERT INTO store_day_integrity VALUES(?,?,?,?,?) ON CONFLICT(store_id,business_date) DO UPDATE SET normalized_hash=excluded.normalized_hash,check_json=excluded.check_json,checked_at=excluded.checked_at`)
    .run(storeId,date,normalizedHash,canonicalJson(check),nowIso);
}
export function saveIngestReceipt(db,{storeId,date,normalizedHash,source,rawArtifactPath,accepted,check,nowIso}={}){
  db.prepare(`INSERT INTO ingest_receipts VALUES(?,?,?,?,?,?,?,?,?,1) ON CONFLICT(store_id,business_date,normalized_hash) DO UPDATE SET decision=excluded.decision,check_json=excluded.check_json,last_seen_at=excluded.last_seen_at,attempts=ingest_receipts.attempts+1`)
    .run(storeId,date,normalizedHash,source,rawArtifactPath,accepted?'accepted':'quarantined',canonicalJson(check),nowIso,nowIso);
}
