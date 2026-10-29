// Exact rankRows/better from frozen holdout.mjs; generated, never approximate.
import{scoreSample}from'../../upstream/vps/src/research/model-search.mjs';
function rankRows(rows,model){
  const byDate=new Map();for(const row of rows){if(!byDate.has(row.targetDate))byDate.set(row.targetDate,[]);byDate.get(row.targetDate).push(row)}
  const out=[];for(const targetDate of [...byDate.keys()].sort()){const day=[...byDate.get(targetDate)].map(row=>({...row,predictionScore:scoreSample(row,model)})).sort((a,b)=>b.predictionScore-a.predictionScore||a.machineKey.localeCompare(b.machineKey));day.forEach((row,index)=>out.push({...row,rank:index+1}))}return out;
}
function better(a,b){if(!b)return true;for(const key of ['top3Lift','top5Lift','rankCorrelation']){const av=Number(a.score[key])||0,bv=Number(b.score[key])||0;if(av!==bv)return av>bv}return a.fingerprint.localeCompare(b.fingerprint)<0}
export{rankRows,better};
