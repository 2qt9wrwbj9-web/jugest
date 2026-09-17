function requirePositiveInteger(value,name){
  const n=Number(value);
  if(!Number.isInteger(n)||n<1)throw new TypeError(`${name} must be a positive integer`);
  return n;
}

function normalizeRanking(rankedKeys,name='rankedKeys'){
  if(!Array.isArray(rankedKeys))throw new TypeError(`${name} must be an array`);
  const keys=rankedKeys.map((value,index)=>{
    const key=String(value??'').trim();
    if(!key)throw new TypeError(`${name}[${index}] must be a non-empty key`);
    return key;
  });
  if(new Set(keys).size!==keys.length)throw new RangeError(`${name} must not contain duplicate machine keys`);
  return keys;
}

function normalizeTruth(truth){
  if(!(truth instanceof Map))throw new TypeError('truth must be a Map');
  const normalized=new Map();
  for(const [rawKey,rawGain] of truth.entries()){
    const key=String(rawKey??'').trim();
    if(!key)throw new TypeError('truth keys must be non-empty');
    if(normalized.has(key))throw new RangeError(`truth must not contain duplicate normalized machine key ${key}`);
    const gain=Number(rawGain);
    if(!Number.isFinite(gain))throw new TypeError(`truth relevance for ${key} must be finite`);
    if(gain<0)throw new RangeError(`truth relevance for ${key} must be nonnegative`);
    normalized.set(key,gain);
  }
  return normalized;
}

function discount(rank){return 1/Math.log2(rank+1)}

function dcgFor(keys,truth,kEff){
  let dcg=0;
  for(let index=0;index<kEff;index+=1){
    const key=keys[index];
    if(!truth.has(key))throw new RangeError(`ranking key ${key} is missing from truth`);
    dcg+=Number(truth.get(key))*discount(index+1);
  }
  return dcg;
}

function linearNdcgNormalized(keys,gains,k){
  const limit=requirePositiveInteger(k,'k');
  const kEff=Math.min(limit,keys.length,gains.size);
  if(kEff===0)return Object.freeze({score:null,informative:false,dcg:0,idcg:0,kEff:0});

  const dcg=dcgFor(keys,gains,kEff);
  const ideal=[...gains.entries()]
    .sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])))
    .slice(0,kEff)
    .map(([key])=>key);
  const idcg=dcgFor(ideal,gains,kEff);
  if(!(idcg>0))return Object.freeze({score:null,informative:false,dcg,idcg:0,kEff});

  const raw=dcg/idcg;
  const score=Math.max(0,Math.min(1,raw));
  return Object.freeze({score,informative:true,dcg,idcg,kEff});
}

export function linearNdcg(rankedKeys,truth,k=10){
  const keys=normalizeRanking(rankedKeys);
  const gains=normalizeTruth(truth);
  return linearNdcgNormalized(keys,gains,k);
}

function sameMachineSet(a,b){
  if(a.length!==b.length)return false;
  const set=new Set(a);
  return b.every(key=>set.has(key));
}

function sameTruthMachineSet(ranking,truth){
  if(ranking.length!==truth.size)return false;
  const set=new Set(ranking);
  return [...truth.keys()].every(key=>set.has(key));
}

export function pairedNdcgDelta(challengerKeys,championKeys,truth,k=10){
  const challengerRanking=normalizeRanking(challengerKeys,'challengerKeys');
  const championRanking=normalizeRanking(championKeys,'championKeys');
  const gains=normalizeTruth(truth);
  if(!sameMachineSet(challengerRanking,championRanking))throw new RangeError('challenger and champion must rank the exact same machine set');
  if(!sameTruthMachineSet(challengerRanking,gains))throw new RangeError('challenger, champion, and truth must use the exact same machine set');

  const challenger=linearNdcgNormalized(challengerRanking,gains,k);
  const champion=linearNdcgNormalized(championRanking,gains,k);
  if(!challenger.informative||!champion.informative){
    return Object.freeze({informative:false,delta:0,challenger,champion});
  }
  const delta=challenger.score-champion.score;
  if(delta<-1-1e-12||delta>1+1e-12)throw new RangeError(`paired NDCG delta out of bounds: ${delta}`);
  return Object.freeze({informative:true,delta,challenger,champion});
}
