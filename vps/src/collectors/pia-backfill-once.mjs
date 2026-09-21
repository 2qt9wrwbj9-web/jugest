import {fetchPiaPublicSnapshot,normalizePiaJugglerRow,PIA_ENDPOINT,PIA_PARSER_BUILD,PIA_SOURCE_STORE_ID,PIA_STORE_NAME} from './pia-public.mjs';
import {ingestCollectorDay} from '../ingest/canonical-ingest.mjs';

export const PIA_BACKFILL_ANCHOR_DATE='2026-09-21';
export const PIA_BACKFILL_WINDOW_DAYS=30;

function shiftDate(date,delta){const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10)}
function expectedDates(anchorDate=PIA_BACKFILL_ANCHOR_DATE,windowDays=PIA_BACKFILL_WINDOW_DAYS){return Array.from({length:windowDays},(_,i)=>shiftDate(anchorDate,i-(windowDays-1)))}
function groupRows(ranking=[]){const map=new Map();for(const row of ranking){const key=String(row?.machine_no??'');if(!key)continue;if(!map.has(key))map.set(key,[]);map.get(key).push(row)}return map}
function sameCore(a,b){return String(a?.tableNo??'')===String(b?.tableNo??'')&&String(a?.machine??'')===String(b?.machine??'')&&Number(a?.games)===Number(b?.games)&&Number(a?.bb)===Number(b?.bb)&&Number(a?.rb)===Number(b?.rb)&&Number(a?.diff)===Number(b?.diff)}

export function shouldBackfillPiaRollingHistory(db,{anchorDate=PIA_BACKFILL_ANCHOR_DATE,windowDays=PIA_BACKFILL_WINDOW_DAYS}={}){
  const dates=expectedDates(anchorDate,windowDays),existing=new Set(db.prepare('SELECT business_date FROM store_days WHERE store_id=?').all(PIA_SOURCE_STORE_ID).map(row=>String(row.business_date)));
  if(!existing.has(anchorDate))return {attempt:false,reason:'anchor_missing',anchorDate};
  const missing=dates.filter(date=>!existing.has(date));
  return missing.length?{attempt:true,reason:'missing_history',anchorDate,from:dates[0],to:dates.at(-1),missing}:{attempt:false,reason:'complete',anchorDate,from:dates[0],to:dates.at(-1)};
}

export async function backfillPiaRollingHistory(db,{rawRoot,fetchImpl=fetch,nowIso=new Date().toISOString(),minMachineCount=80,anchorDate=PIA_BACKFILL_ANCHOR_DATE,windowDays=PIA_BACKFILL_WINDOW_DAYS}={}){
  const decision=shouldBackfillPiaRollingHistory(db,{anchorDate,windowDays});
  if(!decision.attempt)return {...decision,status:'skipped'};
  const snapshot=await fetchPiaPublicSnapshot({fetchImpl,minMachineCount});
  const expectedSnapshotDate=shiftDate(anchorDate,1);
  if(snapshot.snapshotDate!==expectedSnapshotDate)throw new Error(`PIA backfill snapshot date mismatch: expected ${expectedSnapshotDate}, got ${snapshot.snapshotDate}`);
  const allGroups=groupRows(snapshot.data.ranking),supported=[...allGroups.values()].filter(rows=>normalizePiaJugglerRow(rows.at(-1)));
  const anchorRows=db.prepare('SELECT payload_json FROM machine_day_data WHERE store_id=? AND business_date=? ORDER BY machine_key').all(PIA_SOURCE_STORE_ID,anchorDate).map(row=>JSON.parse(row.payload_json));
  if(anchorRows.length<Math.min(20,minMachineCount))throw new Error(`PIA backfill anchor machine count too small: ${anchorRows.length}`);
  const latestByTable=new Map(supported.map(rows=>{const row=normalizePiaJugglerRow(rows.at(-1));return [row?.tableNo,row]}).filter(([key])=>key));
  const matches=anchorRows.filter(row=>sameCore(row,latestByTable.get(String(row.tableNo)))).length,anchorCoverage=anchorRows.length?matches/anchorRows.length:0;
  if(anchorCoverage<0.98)throw new Error(`PIA backfill anchor mismatch: ${matches}/${anchorRows.length}`);
  const dates=expectedDates(anchorDate,windowDays),missing=new Set(decision.missing),priorStore=db.prepare('SELECT source_metadata_json,updated_at FROM stores WHERE id=?').get(PIA_SOURCE_STORE_ID);
  const results=[];
  try{
    for(let i=0;i<dates.length-1;i++){
      const date=dates[i];if(!missing.has(date))continue;
      const machines=supported.map(rows=>normalizePiaJugglerRow(rows[i])).filter(Boolean).sort((a,b)=>Number(a.tableNo)-Number(b.tableNo)||a.tableNo.localeCompare(b.tableNo));
      const coverage=anchorRows.length?machines.length/anchorRows.length:0;if(coverage<0.90)throw new Error(`PIA backfill normalized coverage too low for ${date}: ${machines.length}/${anchorRows.length}`);
      const rawRows=[...allGroups.values()].map(rows=>rows[i]).filter(Boolean);
      const day={date,source:'pia-public',sourceUrl:PIA_ENDPOINT,parserBuild:PIA_PARSER_BUILD,machines,quality:{score:Math.round(coverage*100),grade:coverage>=0.98?'A':coverage>=0.95?'B':'C',warnings:[`30日履歴を${anchorDate}実績で固定したバックフィル`],totalMachines:machines.length,parserBuild:PIA_PARSER_BUILD}};
      const rawText=JSON.stringify({status:0,ranking:rawRows,server_date_time:snapshot.data.server_date_time,backfill:{snapshotDate:snapshot.snapshotDate,anchorBusinessDate:anchorDate,historyIndex:i,windowDays}});
      const ingested=await ingestCollectorDay(db,{rawRoot,source:'pia-public-ranking-top',sourceStoreId:PIA_SOURCE_STORE_ID,shop:PIA_STORE_NAME,date,parserBuild:PIA_PARSER_BUILD,revision:1,day,rawText,nowIso,sourceMetadata:{visibility:'public',publicStoreId:35,endpoint:PIA_ENDPOINT,snapshotDate:snapshot.snapshotDate,historyWindowDays:windowDays,backfill:true,backfillAnchorDate:anchorDate}});
      results.push({date,machineCount:machines.length,changed:ingested.changed,jobId:ingested.jobId});
    }
  }finally{
    if(priorStore)db.prepare('UPDATE stores SET source_metadata_json=?,updated_at=? WHERE id=?').run(priorStore.source_metadata_json,priorStore.updated_at,PIA_SOURCE_STORE_ID);
  }
  const remaining=shouldBackfillPiaRollingHistory(db,{anchorDate,windowDays});
  if(remaining.attempt)throw new Error(`PIA backfill incomplete: ${remaining.missing.join(',')}`);
  return {status:'backfilled',anchorDate,snapshotDate:snapshot.snapshotDate,from:dates[0],to:dates.at(-1),anchorMatches:matches,anchorMachineCount:anchorRows.length,addedDays:results.length,results};
}

export const __test={shiftDate,expectedDates,groupRows,sameCore};
