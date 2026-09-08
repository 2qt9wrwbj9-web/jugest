import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {boot,memoryStorage,plain} from './helpers/runtime.mjs';
import {
 BASE_COMMIT,STATE_KEY,EXTERNAL_DB_KEY,makeRawPredictionHistory,
 normalizePredictionHistory,packPredictionHistory,makeStoredState,
 encodeNonFinite,compactPrediction
} from './helpers/axis-auto-selector-baseline.mjs';

const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/axis-auto-selector-baseline.json',import.meta.url)));
const encodedPlain=value=>plain(encodeNonFinite(value));

function compactStoredWeights(result){
 return{
  weights:result.weights,
  mode:result.mode,
  reason:result.reason,
  samples:result.samples,
  stored:result.stored||false,
  trainedAt:result.trainedAt??null,
  trainedTo:result.trainedTo??null
 };
}

test('immutable fixture identifies the untouched runtime baseline',()=>{
 assert.equal(baseline.baseCommit,BASE_COMMIT);
 assert.deepEqual(baseline.fallbackWeights,{practical:.55,model:.30,strict:.15});
 assert.deepEqual(baseline.predictionCases.map(x=>x.name),[
  'custom-source-fallback',
  'fresh-stored-profile',
  'historical-target-rejects-newer-profile'
 ]);
});

test('current hybrid normalization and utility outputs match the captured control',async()=>{
 const {ctx}=await boot({loadApp:false});
 assert.deepEqual(
  plain(ctx.V4_TEST.hybridNormWeights({practical:.55,model:.30,strict:.15})),
  baseline.fallbackWeights
 );
 for(const fixture of baseline.utilityCases){
  const actual=ctx.V4_TEST.hybridEvaluate(fixture.samples,fixture.weights);
  assert.deepEqual(encodedPlain(actual),fixture.expected,fixture.name);
 }
});

test('current prediction ordering, scores, signals and stored-profile behavior match the captured control',async()=>{
 const rawHistory=makeRawPredictionHistory(baseline.predictionHistory);
 const baseRuntime=await boot({loadApp:false});
 const customHistory=normalizePredictionHistory(baseRuntime.ctx.V4_TEST,baseline.predictionHistory);

 const storedStorage=memoryStorage({[STATE_KEY]:makeStoredState(baseline.predictionHistory)});
 storedStorage.idb=new Map([[EXTERNAL_DB_KEY,packPredictionHistory(rawHistory)]]);
 const storedRuntime=await boot({storage:storedStorage,loadApp:false});

 for(const fixture of baseline.predictionCases){
  const runtime=fixture.sourceMode==='custom'?baseRuntime:storedRuntime;
  const sourceDays=fixture.sourceMode==='custom'?customHistory:undefined;
  assert.ok(['custom','stored'].includes(fixture.sourceMode),`${fixture.name}: known source mode`);
  const result=sourceDays
   ?runtime.ctx.V4_TEST.predictStore(baseline.predictionHistory.shop,fixture.targetDate,sourceDays,{noCache:true})
   :runtime.ctx.V4_TEST.predictStore(baseline.predictionHistory.shop,fixture.targetDate);
  assert.ok(result,`${fixture.name}: prediction exists`);
  assert.deepEqual(encodedPlain(compactPrediction(result)),fixture.expected,fixture.name);

  const storedWeights=sourceDays
   ?runtime.ctx.V4_TEST.hybridStoredWeights(baseline.predictionHistory.shop,fixture.targetDate,sourceDays)
   :runtime.ctx.V4_TEST.hybridStoredWeights(baseline.predictionHistory.shop,fixture.targetDate);
  assert.deepEqual(
   encodedPlain(compactStoredWeights(storedWeights)),
   fixture.expected.ranking.hybridOptimization,
   `${fixture.name}: stored weight selection`
  );
 }
});
