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

function scoreRowFromDb(row){
  if(!row)return null;
  return Object.freeze({
    predictionId:Number(row.prediction_id),storeId:row.store_id,targetDate:row.target_date,engine:row.engine,
    scorerVersion:row.scorer_version,outcomeProxyVersion:row.outcome_proxy_version,outcomeInputHash:row.outcome_input_hash,
    metrics:Object.freeze(safeJson(row.metrics_json,{})||{}),scoreHash:row.score_hash,scoredAt:row.scored_at
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
  return Object.freeze(db.prepare(`SELECT * FROM store_prediction_snapshots WHERE ${where.join(' AND ')} ORDER BY target_date DESC,created_at ASC,id ASC`).all(...params).map(rowFromDb));
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

function firstPredictionsForDay(db,storeId,targetDate){
  const rows=listLivePredictions(db,{storeId,targetDate});
  const first={};
  for(const row of rows)if(!first[row.engine])first[row.engine]=row;
  return first;
}

function persistPredictionScore(db,{prediction,outcomeRows,outcomeInputHash,nowIso}){
  const existing=scoreRowFromDb(db.prepare('SELECT * FROM store_prediction_scores WHERE prediction_id=?').get(prediction.id));
  if(existing){
    if(existing.outcomeInputHash!==outcomeInputHash)return Object.freeze({score:existing,conflict:true});
    return Object.freeze({score:existing,conflict:false});
  }
  const metrics=scorePredictionRows({predictionRows:prediction.rankings,outcomeRows}),metricsJson=canonicalJson(metrics);
  const scoreHash=hashCanonical({predictionId:prediction.id,payloadHash:prediction.payloadHash,scorerVersion:SCORER_VERSION,outcomeProxyVersion:OUTCOME_PROXY_VERSION,outcomeInputHash,metrics});
  db.prepare(`INSERT INTO store_prediction_scores(prediction_id,store_id,target_date,engine,scorer_version,outcome_proxy_version,outcome_input_hash,metrics_json,score_hash,scored_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(prediction.id,prediction.storeId,prediction.targetDate,prediction.engine,SCORER_VERSION,OUTCOME_PROXY_VERSION,outcomeInputHash,metricsJson,scoreHash,nowIso);
  return Object.freeze({score:scoreRowFromDb(db.prepare('SELECT * FROM store_prediction_scores WHERE prediction_id=?').get(prediction.id)),conflict:false});
}

function winnerFromScores(pre,current){
  if(!pre||!current)return null;
  const delta=Number(pre.metrics?.quality||0)-Number(current.metrics?.quality||0);
  if(Math.abs(delta)<=WIN_EPSILON)return 'tie';
  return delta>0?'pre_research':'current_shadow';
}

export function scoreLiveComparisonDay(db,{storeId,targetDate,outcomeRows,outcomeInputHash,nowIso=new Date().toISOString()}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId'),target=validDate(targetDate,'targetDate'),outcomeHash=requiredText(outcomeInputHash,'outcomeInputHash'),at=validIso(nowIso,'nowIso');
  if(!Array.isArray(outcomeRows)||!outcomeRows.length)throw new TypeError('outcomeRows are required');
  const existingHashes=db.prepare('SELECT DISTINCT outcome_input_hash AS hash FROM store_prediction_scores WHERE store_id=? AND target_date=?').all(id,target).map(row=>row.hash);
  if(existingHashes.some(hash=>hash!==outcomeHash))return Object.freeze({storeId:id,targetDate:target,winner:null,scores:Object.freeze({}),excludedReason:'outcome_hash_conflict'});
  const predictions=firstPredictionsForDay(db,id,target),scores={};let conflict=false;
  for(const engine of ['pre_research','current_shadow']){
    const prediction=predictions[engine];if(!prediction)continue;
    const result=persistPredictionScore(db,{prediction,outcomeRows,outcomeInputHash:outcomeHash,nowIso:at});
    scores[engine]=result.score;if(result.conflict)conflict=true;
  }
  if(conflict)return Object.freeze({storeId:id,targetDate:target,winner:null,scores:Object.freeze(scores),excludedReason:'outcome_hash_conflict'});
  const missing=!scores.pre_research?'missing_pre_research':!scores.current_shadow?'missing_current_shadow':null;
  return Object.freeze({storeId:id,targetDate:target,winner:winnerFromScores(scores.pre_research,scores.current_shadow),scores:Object.freeze(scores),excludedReason:missing});
}

function averageMetric(rows,engine){
  const values=rows.map(row=>row.scores?.[engine]?.metrics).filter(Boolean);
  const avg=selector=>values.length?values.reduce((sum,value)=>sum+Number(selector(value)||0),0)/values.length:0;
  return Object.freeze({
    days:values.length,quality:avg(value=>value.quality),coverage:avg(value=>value.coverage),rankCorrelation:avg(value=>value.rankCorrelation),
    top1:Object.freeze({rate:avg(value=>value.top1?.rate),lift:avg(value=>value.top1?.lift)}),
    top3:Object.freeze({rate:avg(value=>value.top3?.rate),lift:avg(value=>value.top3?.lift)}),
    top5:Object.freeze({rate:avg(value=>value.top5?.rate),lift:avg(value=>value.top5?.lift)})
  });
}

function comparisonRows(db,storeId,limit){
  const targetRows=db.prepare(`SELECT DISTINCT target_date FROM store_prediction_snapshots WHERE store_id=? ORDER BY target_date DESC LIMIT ?`).all(storeId,limit);
  return targetRows.map(({target_date:targetDate})=>{
    const predictions=firstPredictionsForDay(db,storeId,targetDate),scores={};
    for(const engine of ['pre_research','current_shadow']){
      const prediction=predictions[engine];if(!prediction)continue;
      const score=scoreRowFromDb(db.prepare('SELECT * FROM store_prediction_scores WHERE prediction_id=?').get(prediction.id));
      if(score)scores[engine]=score;
    }
    let excludedReason=null;
    if(!predictions.pre_research)excludedReason='missing_pre_research';
    else if(!predictions.current_shadow)excludedReason='missing_current_shadow';
    else if(!scores.pre_research||!scores.current_shadow)excludedReason='unscored';
    const winner=excludedReason?null:winnerFromScores(scores.pre_research,scores.current_shadow);
    return Object.freeze({targetDate,winner,excludedReason,scores:Object.freeze(scores),predictions:Object.freeze({
      pre_research:predictions.pre_research?Object.freeze({engineVersion:predictions.pre_research.engineVersion,modelFingerprint:predictions.pre_research.modelFingerprint,featureVersion:predictions.pre_research.featureVersion,sourceFrontierDate:predictions.pre_research.sourceFrontierDate,payloadHash:predictions.pre_research.payloadHash,createdAt:predictions.pre_research.createdAt}):null,
      current_shadow:predictions.current_shadow?Object.freeze({engineVersion:predictions.current_shadow.engineVersion,modelFingerprint:predictions.current_shadow.modelFingerprint,featureVersion:predictions.current_shadow.featureVersion,sourceFrontierDate:predictions.current_shadow.sourceFrontierDate,payloadHash:predictions.current_shadow.payloadHash,createdAt:predictions.current_shadow.createdAt}):null
    })});
  });
}

export function buildComparisonSummary(db,{storeId,limit=90}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId'),bounded=Math.max(1,Math.min(366,Math.trunc(Number(limit)||90))),rows=comparisonRows(db,id,bounded);
  const paired=rows.filter(row=>!row.excludedReason&&row.scores.pre_research&&row.scores.current_shadow),recent=paired.slice(0,30);
  const newEngine=averageMetric(paired,'pre_research'),currentEngine=averageMetric(paired,'current_shadow');
  const recentNew=averageMetric(recent,'pre_research'),recentCurrent=averageMetric(recent,'current_shadow');
  const counts={newWins:0,currentWins:0,ties:0};
  for(const row of paired){if(row.winner==='pre_research')counts.newWins+=1;else if(row.winner==='current_shadow')counts.currentWins+=1;else if(row.winner==='tie')counts.ties+=1}
  return Object.freeze({
    live:Object.freeze({days:paired.length,...counts,excluded:rows.length-paired.length,newEngine,currentEngine,
      recent30:Object.freeze({days:recent.length,newEngine:recentNew,currentEngine:recentCurrent,delta:recentNew.quality-recentCurrent.quality}),
      rows:Object.freeze(rows)}),
    historical:null
  });
}

export const __test={normalizeRanking,normalizeRankings,rowFromDb,scoreRowFromDb,topOverlap,spearmanCommon,winnerFromScores,averageMetric};
