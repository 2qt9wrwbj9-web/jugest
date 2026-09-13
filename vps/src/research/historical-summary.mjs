function requiredText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function safeJson(text,fallback=null){try{return JSON.parse(text)}catch{return fallback}}
function averageMetric(rows,key){
  const values=rows.map(row=>row[key]).filter(Boolean);
  const avg=selector=>values.length?values.reduce((sum,value)=>sum+Number(selector(value)||0),0)/values.length:0;
  return Object.freeze({
    days:values.length,
    quality:avg(value=>value.quality),
    coverage:avg(value=>value.coverage),
    rankCorrelation:avg(value=>value.rankCorrelation),
    top1:Object.freeze({rate:avg(value=>value.top1?.rate),lift:avg(value=>value.top1?.lift)}),
    top3:Object.freeze({rate:avg(value=>value.top3?.rate),lift:avg(value=>value.top3?.lift)}),
    top5:Object.freeze({rate:avg(value=>value.top5?.rate),lift:avg(value=>value.top5?.lift)})
  });
}
function normalizedDay(row){
  return Object.freeze({
    targetDate:row.target_date,
    winner:row.winner??null,
    excludedReason:row.excluded_reason??null,
    outcomeInputHash:row.outcome_input_hash??null,
    preMetrics:safeJson(row.pre_metrics_json,null),
    currentMetrics:safeJson(row.current_metrics_json,null),
    preFingerprint:row.pre_fingerprint??null,
    preFeatureVersion:row.pre_feature_version??null,
    preFrontierDate:row.pre_frontier_date??null,
    scorerVersion:row.scorer_version,
    createdAt:row.created_at
  });
}

export function buildHistoricalComparisonSummary(db,{storeId,limit=90}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  const id=requiredText(storeId,'storeId'),bounded=Math.max(1,Math.min(366,Math.trunc(Number(limit)||90)));
  const run=db.prepare("SELECT * FROM historical_comparison_runs WHERE store_id=? AND state<>'stale' ORDER BY id DESC LIMIT 1").get(id);
  if(!run)return null;
  const rows=db.prepare('SELECT * FROM historical_comparison_days WHERE run_id=? ORDER BY target_date DESC LIMIT ?').all(run.id,bounded).map(normalizedDay);
  const paired=rows.filter(row=>!row.excludedReason&&row.preMetrics&&row.currentMetrics),recent=paired.slice(0,30);
  const counts={newWins:0,currentWins:0,ties:0};
  for(const row of paired){if(row.winner==='pre_research')counts.newWins+=1;else if(row.winner==='current_shadow')counts.currentWins+=1;else if(row.winner==='tie')counts.ties+=1}
  const newEngine=averageMetric(paired,'preMetrics'),currentEngine=averageMetric(paired,'currentMetrics'),recentNew=averageMetric(recent,'preMetrics'),recentCurrent=averageMetric(recent,'currentMetrics');
  const processed=Number(run.processed_count)||0,totalCandidates=Number(run.total_candidates)||0;
  return Object.freeze({
    runId:Number(run.id),state:run.state,replayVersion:run.replay_version,
    snapshotFirstDate:run.snapshot_first_date??null,snapshotLastDate:run.snapshot_last_date??null,nextTargetDate:run.next_target_date??null,
    totalCandidates,processed,progress:totalCandidates?processed/totalCandidates:1,
    scored:paired.length,excluded:rows.length-paired.length,...counts,newEngine,currentEngine,
    recent30:Object.freeze({days:recent.length,newEngine:recentNew,currentEngine:recentCurrent,delta:recentNew.quality-recentCurrent.quality}),
    rows:Object.freeze(rows)
  });
}

export const __test={averageMetric,normalizedDay};
