// Exact pure calculation block extracted from fixed MODEL_SEARCH worker.
import{discoverAxes}from'../../upstream/vps/src/research/axis-discovery.mjs';
import{searchModels}from'../../upstream/vps/src/research/model-search.mjs';
function adaptiveMinSupport(sampleCount){return Math.max(8,Math.min(30,Math.floor(Math.max(1,sampleCount)*.02)))}
export function originalModelSearchCalculation({split,champion,round}){
    const minSupport=adaptiveMinSupport(split.train.length),axes=discoverAxes(split.train,{minSupport,maxAxes:32,fdrQ:.10,foldCount:4,maxPairSeeds:8}),search=searchModels({champion,axes,train:split.train,validation:split.validation,round,maxCandidates:128});
return{minSupport,axes,search};}
