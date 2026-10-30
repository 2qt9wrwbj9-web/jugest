// Exact source formal prediction row mapping.
function rowToPrediction(row){
  if(!row)return null;
  return Object.freeze({
    storeId:row.store_id,lineageId:row.lineage_id,trialNumber:Number(row.trial_number),
    targetDate:row.target_date,role:row.role,modelFingerprint:row.model_fingerprint,
    sourceFrontierDate:row.source_frontier_date,machineSetHash:row.machine_set_hash,
    rankings:Object.freeze(JSON.parse(row.rankings_json).map(item=>Object.freeze(item))),
    predictionHash:row.prediction_hash,createdAt:row.created_at,
  });
}


export{rowToPrediction};
