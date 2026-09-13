import {canonicalJson,hashCanonical} from '../canonical-json.mjs';

export const SCORER_VERSION='pre-shadow-scorer-v1';
export const OUTCOME_PROXY_VERSION='canonical-diff-proxy-v1';
export const WIN_EPSILON=1e-6;

const ENGINES=new Set(['pre_research','current_shadow']);

function requiredText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function validDate(value,name){const text=requiredText(value,name);if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(`${text}T00:00:00Z`)))throw new TypeError(`${name} must be YYYY-MM-DD`);return text}
function validIso(value,name='createdAt'){const text=requiredText(value,name);if(!Number.isFinite(Date.parse(text)))throw new TypeError(`${name} must be ISO date-time`);return text}
function finite(value,name){const n=Number(value);if(!Number.isFinite(n))throw new TypeError(`${name} must be finite`);return n}
function safeJson(text,fallback=null){try{return JSON.parse(text)}catch{return fallback}}

function normalizeRanking(row,index){
  const machineKey=requiredText(row?.machineKey??row?.machine_key??row?.tableNo??row?.table_no,'rankings.machineKey');
  const tableNo=requiredText(row?.tableNo??row?.table_no??machineKey,'rankings.tableNo');
  const machineName=requiredText(row?.machineName??row?.machine_name??row?.sourceMachineName??'unknown','rankings.machineName');
  const rank=Number.isFinite(Number(row?.rank))&&Number(row.rank)>0?Math.trunc(Number(row.rank)):index+1;
  const score=finite(row?.score??-rank,'rankings.score');
  return Object.freeze({machineKey,tableNo,machineName,rank,score});
}
function normalizeRankings(rows){
  if(!Array.isArray(rows)||!rows.length)throw new TypeError('rankings are required');
  return Object.freeze(rows.map(normalizeRanking).sort((a,b)=>a.rank-b.rank||b.score-a.score||a.machineKey.localeCompare(b.machineKey)));
}

function rowFromDb(row){
  if(!row)return null;
  const payload=safeJson(row.payload_json,{rankings:[]})||{rankings:[]};
  return Object.freeze({
    id:Number(row.id),storeId:row.store_id,targetDate:row.target_date,engine:row.engine,engineVersion:row.engine_version,
    modelFingerprint:row.model_fingerprint||'',featureVersion:row.feature_version??null,sourceFrontierDate:row.source_frontier_date,
    inputHash:row.input_hash,payloadHash:row.payload_hash,createdAt:row.created_at,
    rankings:Object.freeze(Array.isArray(payload.rankings)?payload.rankings.map((item,index)=>Object.freeze(normalizeRanking(item,index))):[])
  });
}

export function persistLivePrediction(db,{storeId,targetDate,engine,engineVersion,modelFingerprint='',featureVersion=null,sourceFrontierDate,inputHash,rankings,createdAt=new Date().toISOString()}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId'),target=validDate(targetDate,'targetDate'),kind=requiredText(engine,'engine');
  if(!ENGINES.has(kind))throw new TypeError('engine is invalid');
  const version=requiredText(engineVersion,'engineVersion'),fingerprint=String(modelFingerprint??'').trim(),frontier=validDate(sourceFrontierDate,'sourceFrontierDate'),input=requiredText(inputHash,'inputHash'),at=validIso(createdAt);
  if(frontier>=target)throw new TypeError('sourceFrontierDate must be before targetDate');
  const normalized=normalizeRankings(rankings),payload=Object.freeze({rankings:normalized}),payloadJson=canonicalJson(payload),payloadHash=hashCanonical(payload);
  const result=db.prepare(`INSERT INTO store_prediction_snapshots(store_id,target_date,engine,engine_version,model_fingerprint,feature_version,source_frontier_date,input_hash,payload_json,payload_hash,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(store_id,target_date,engine,engine_version,model_fingerprint) DO NOTHING`)
    .run(id,target,kind,version,fingerprint,featureVersion==null?null:String(featureVersion),frontier,input,payloadJson,payloadHash,at);
  const row=db.prepare(`SELECT * FROM store_prediction_snapshots WHERE store_id=? AND target_date=? AND engine=? AND engine_version=? AND model_fingerprint=?`).get(id,target,kind,version,fingerprint);
  return Object.freeze({inserted:Number(result.changes||0)>0,row:rowFromDb(row)});
}

export function listLivePredictions(db,{storeId,targetDate=null,engine=null}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId'),where=['store_id=?'],params=[id];
  if(targetDate!=null){where.push('target_date=?');params.push(validDate(targetDate,'targetDate'))}
  if(engine!=null){const kind=requiredText(engine,'engine');if(!ENGINES.has(kind))throw new TypeError('engine is invalid');where.push('engine=?');params.push(kind)}
  return Object.freeze(db.prepare(`SELECT * FROM store_prediction_snapshots WHERE ${where.join(' AND ')} ORDER BY target_date DESC,id ASC`).all(...params).map(rowFromDb));
}

function normalizeOutcome(row,index){
  const machineKey=requiredText(row?.machineKey??row?.machine_key??row?.tableNo??row?.table_no??index,'outcomeRows.machineKey');
  const outcomeScore=Number(row?.outcomeScore??row?.outcome_score??row?.diff);
  return Number.isFinite(outcomeScore)?Object.freeze({machineKey,outcomeScore}):null;
}
function topOverlap(predicted,actual,k){
  const count=Math.min(k,actual.length);if(!count)return Object.freeze({overlap:0,rate:0,lift:0});
  const actualSet=new Set(actual.slice(0,count).map(row=>row.machineKey));
  const overlap=predicted.slice(0,count).filter(row=>actualSet.has(row.machineKey)).length;
  const rate=overlap/count,expected=count/Math.max(1,actual.length);
  return Object.freeze({overlap,rate,lift:expected>0?rate/expected:0});
}
function spearmanCommon(predicted,actual){
  const actualRank=new Map(actual.map((row,index)=>[row.machineKey,index+1]));
  const common=predicted.filter(row=>actualRank.has(row.machineKey));
  const n=common.length;if(n<2)return n===1?1:0;
  const commonActual=[...common].sort((a,b)=>(actualRank.get(a.machineKey)??Infinity)-(actualRank.get(b.machineKey)??Infinity));
  const reducedActualRank=new Map(commonActual.map((row,index)=>[row.machineKey,index+1]));
  let sum=0;
  for(let index=0;index<n;index+=1){const d=(index+1)-(reducedActualRank.get(common[index].machineKey)??n);sum+=d*d}
  return 1-(6*sum)/(n*(n*n-1));
}

export function scorePredictionRows({predictionRows,outcomeRows}={}){
  if(!Array.isArray(predictionRows))throw new TypeError('predictionRows must be an array');
  if(!Array.isArray(outcomeRows))throw new TypeError('outcomeRows must be an array');
  const actual=outcomeRows.map(normalizeOutcome).filter(Boolean).sort((a,b)=>b.outcomeScore-a.outcomeScore||a.machineKey.localeCompare(b.machineKey));
  const actualKeys=new Set(actual.map(row=>row.machineKey));
  const predicted=predictionRows.map(normalizeRanking).filter(row=>actualKeys.has(row.machineKey)).sort((a,b)=>a.rank-b.rank||b.score-a.score||a.machineKey.localeCompare(b.machineKey));
  const machineCount=actual.length,coverage=machineCount?predicted.length/machineCount:0;
  const top1=topOverlap(predicted,actual,1),top3=topOverlap(predicted,actual,3),top5=topOverlap(predicted,actual,5),rankCorrelation=spearmanCommon(predicted,actual);
  return Object.freeze({machineCount,coverage,top1,top3,top5,rankCorrelation,quality:top3.lift*100+top5.lift*10+rankCorrelation});
}

export const __test={normalizeRanking,normalizeRankings,rowFromDb,topOverlap,spearmanCommon};
