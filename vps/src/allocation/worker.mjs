import {parentPort,workerData} from 'node:worker_threads';
import '../../../store-day-allocation.js';
import {captureAllocationLikelihoods} from './likelihoods.mjs';

function approximateReference(result){
  const clear=event=>({...event,logEValue:null,logThreshold:null,logNullMaximum:null,logDetectionLikelihood:null,modelPass:false,strongEnabled:false,eValueAvailable:false,eRegistered:false});
  return {...result,approximate:true,primary:false,strongEnabled:false,
    bands:result.bands.map(band=>({...band,events:band.events.map(clear)})),
    detail:result.detail?clear(result.detail):null,
    assumptions:{...result.assumptions,calibrated:false,detectionMixture:null},
    warnings:['差枚を含む従来の比較値による参考推定です。正規化した観測分布としての校正はしていません。主計算とは合算しません。']};
}

try{
  const {rootDir,groups,familySize,alpha,detail}=workerData;
  const results=[];
  for(const group of groups){
    try{
    const captured=await captureAllocationLikelihoods({rootDir,rows:group.rows});
    const selected=detail?.machine===group.machine?{band:detail.band,kind:detail.kind,count:detail.count}:null;
    const result=globalThis.JUGESTStoreDayAllocation.analyzeMachine({rows:captured.rows,familySize,alpha,detail:selected});
    if(!result.ok)throw new Error('allocation_model_unavailable');
    const methodCounts={};let reverseDiffN=0,warningN=0;
    for(const row of captured.rows){const method=row.individual?.method||'unplayed';methodCounts[method]=(methodCounts[method]||0)+1;if(method==='reverse-diff')reverseDiffN++;if(row.individual?.reverseWarn)warningN++}
    let differenceReference={available:false,approximate:true,diffN:group.diffN??0,reverseDiffN,warningN,methodCounts,reason:group.diffN?'difference_fallback_bonus_only':'difference_unavailable',result:null};
    if(reverseDiffN){
      const reference=globalThis.JUGESTStoreDayAllocation.analyzeMachine({rows:captured.rows.map(({bonusLogs,...row})=>row),familySize,alpha,detail:selected});
      if(reference.ok)differenceReference={...differenceReference,available:true,reason:null,result:approximateReference(reference)};
      else differenceReference.reason='difference_calculation_unavailable';
    }
    results.push({machine:group.machine,result,differenceReference,rows:captured.rows,tableHash:captured.tableHash,sourceHash:captured.sourceHash});
    }catch{results.push({machine:group.machine,errorCode:'calculation_failed',result:null,rows:group.rows})}
  }
  parentPort.postMessage({ok:true,results});
}catch{parentPort.postMessage({ok:false,code:'allocation_calculation_failed'})}
