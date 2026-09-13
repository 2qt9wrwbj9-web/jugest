import {canonicalJson,hashCanonical} from '../canonical-json.mjs';

const WINDOWS=Object.freeze([1,3,7,14,30,90,180]);
const DIMENSIONS=Object.freeze(['weekday','date_last_digit','machine_name','table_no','table_last_digit']);

function requiredText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function validDate(value,name){const text=requiredText(value,name);if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(`${text}T00:00:00Z`)))throw new TypeError(`${name} must be YYYY-MM-DD`);return text}
function finiteOrNull(value){const n=Number(value);return Number.isFinite(n)?n:null}
function machineName(machine){return String(machine?.sourceMachineName??machine?.machineName??machine?.machine??machine?.category??'unknown').trim()||'unknown'}
function tableNo(machine,index){return String(machine?.tableNo??machine?.table_no??machine?.machineKey??machine?.machine_key??index).trim()}
function weekday(date){return String(new Date(`${date}T00:00:00Z`).getUTCDay())}
function lastDigit(value){const m=String(value).match(/(\d)(?!.*\d)/);return m?m[1]:'other'}

function normalizeRecords(days){
  const records=[];
  for(const day of days){
    const date=String(day?.date??'');
    const machines=Array.isArray(day?.machines)?day.machines:[];
    for(let index=0;index<machines.length;index+=1){
      const machine=machines[index];
      records.push(Object.freeze({
        date,
        tableNo:tableNo(machine,index),
        machineName:machineName(machine),
        games:finiteOrNull(machine?.games),
        bb:finiteOrNull(machine?.bb),
        rb:finiteOrNull(machine?.rb),
        diff:finiteOrNull(machine?.diff)
      }));
    }
  }
  records.sort((a,b)=>a.date.localeCompare(b.date)||a.tableNo.localeCompare(b.tableNo)||a.machineName.localeCompare(b.machineName));
  return records;
}

function sumFinite(records,key){return records.reduce((sum,row)=>Number.isFinite(row[key])?sum+row[key]:sum,0)}
function meanFinite(records,key){const values=records.map(row=>row[key]).filter(Number.isFinite);return values.length?values.reduce((a,b)=>a+b,0)/values.length:null}
function summarize(records){
  const diffs=records.map(row=>row.diff).filter(Number.isFinite);
  return Object.freeze({
    gamesSum:sumFinite(records,'games'),
    gamesMean:meanFinite(records,'games'),
    bbSum:sumFinite(records,'bb'),
    rbSum:sumFinite(records,'rb'),
    diffSum:sumFinite(records,'diff'),
    positiveDiffRate:diffs.length?diffs.filter(n=>n>0).length/diffs.length:null,
    observedRows:records.length
  });
}

function groupDefinitions(records){
  const defs=[
    ['weekday',row=>weekday(row.date)],
    ['date_last_digit',row=>lastDigit(row.date)],
    ['machine_name',row=>row.machineName],
    ['table_no',row=>row.tableNo],
    ['table_last_digit',row=>lastDigit(row.tableNo)]
  ];
  const groups=[];
  for(const [dimensionKey,getValue] of defs){
    const map=new Map();
    for(const row of records){
      const value=String(getValue(row));
      if(!map.has(value))map.set(value,[]);
      map.get(value).push(row);
    }
    for(const value of [...map.keys()].sort())groups.push({dimensionKey,dimensionValue:value,records:map.get(value)});
  }
  return groups;
}

function uniqueMachineCount(records){return new Set(records.map(row=>row.tableNo)).size}
function uniqueDayCount(records){return new Set(records.map(row=>row.date)).size}

export function buildStoreFeatureRows({storeId,days,featureVersion,asOfDate}={}){
  const id=requiredText(storeId,'storeId');
  const version=requiredText(featureVersion,'featureVersion');
  const cutoff=validDate(asOfDate,'asOfDate');
  const eligible=[...(Array.isArray(days)?days:[])]
    .filter(day=>day&&String(day.date||'')<=cutoff)
    .sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const rows=[];
  for(const windowDays of WINDOWS){
    const selectedDays=eligible.slice(-windowDays);
    const records=normalizeRecords(selectedDays);
    for(const group of groupDefinitions(records)){
      const metrics=summarize(group.records);
      const inputHash=hashCanonical({
        storeId:id,featureVersion:version,asOfDate:cutoff,windowDays,
        dimensionKey:group.dimensionKey,dimensionValue:group.dimensionValue,
        records:group.records
      });
      rows.push(Object.freeze({
        storeId:id,featureVersion:version,asOfDate:cutoff,
        dimensionKey:group.dimensionKey,dimensionValue:group.dimensionValue,windowDays,
        dayCount:uniqueDayCount(group.records),machineCount:uniqueMachineCount(group.records),rowCount:group.records.length,
        metrics,inputHash
      }));
    }
  }
  rows.sort((a,b)=>a.windowDays-b.windowDays||a.dimensionKey.localeCompare(b.dimensionKey)||a.dimensionValue.localeCompare(b.dimensionValue));
  return rows;
}

export function persistStoreFeatureRows(db,rows,{updatedAt=new Date().toISOString()}={}){
  if(!db?.prepare||!db?.exec)throw new TypeError('db is required');
  if(!Array.isArray(rows))throw new TypeError('rows must be an array');
  if(!Number.isFinite(Date.parse(updatedAt)))throw new TypeError('updatedAt must be ISO date-time');
  const slices=new Map();
  for(const row of rows){
    const key=`${requiredText(row.storeId,'row.storeId')}\u0000${requiredText(row.featureVersion,'row.featureVersion')}\u0000${validDate(row.asOfDate,'row.asOfDate')}`;
    slices.set(key,[row.storeId,row.featureVersion,row.asOfDate]);
  }
  const stmt=db.prepare(`INSERT INTO store_feature_snapshots(
    store_id,feature_version,as_of_date,dimension_key,dimension_value,window_days,day_count,machine_count,row_count,metrics_json,input_hash,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(store_id,feature_version,as_of_date,dimension_key,dimension_value,window_days) DO UPDATE SET
    day_count=excluded.day_count,machine_count=excluded.machine_count,row_count=excluded.row_count,
    metrics_json=excluded.metrics_json,input_hash=excluded.input_hash,updated_at=excluded.updated_at`);
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const [storeId,featureVersion,asOfDate] of slices.values())db.prepare('DELETE FROM store_feature_snapshots WHERE store_id=? AND feature_version=? AND as_of_date=?').run(storeId,featureVersion,asOfDate);
    for(const row of rows){
      stmt.run(
        requiredText(row.storeId,'row.storeId'),requiredText(row.featureVersion,'row.featureVersion'),validDate(row.asOfDate,'row.asOfDate'),
        requiredText(row.dimensionKey,'row.dimensionKey'),requiredText(row.dimensionValue,'row.dimensionValue'),Number(row.windowDays)||0,
        Number(row.dayCount)||0,Number(row.machineCount)||0,Number(row.rowCount)||0,canonicalJson(row.metrics??{}),requiredText(row.inputHash,'row.inputHash'),updatedAt
      );
    }
    db.exec('COMMIT');
    return rows.length;
  }catch(error){try{db.exec('ROLLBACK')}catch{}throw error}
}

export const __test={WINDOWS,DIMENSIONS,normalizeRecords,summarize,groupDefinitions,weekday,lastDigit};
