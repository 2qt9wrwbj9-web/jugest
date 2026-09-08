import test from 'node:test';
import assert from 'node:assert/strict';
import {bootJugestResearchRuntime} from '../research/axis-auto-selector/jugest-headless.mjs';
import {buildHistoricalSampleBundle} from '../research/axis-auto-selector/historical-builder.mjs';
import {makeRawPredictionHistory,predictionHistorySpec,predictionTargets} from './helpers/axis-auto-selector-baseline.mjs';

test('historical builder replays current JUGEST v4PredictStore with only pre-target raw history',async()=>{
 const runtime=await bootJugestResearchRuntime();
 const days=makeRawPredictionHistory(predictionHistorySpec),target=predictionTargets(predictionHistorySpec).historical;
 const bundle=buildHistoricalSampleBundle({store:predictionHistorySpec.shop,days,runtime,startDate:target,endDate:target,minPriorDays:20});
 assert.equal(bundle.samples.length,1);
 const sample=bundle.samples[0];
 assert.equal(sample.targetDate,target);
 assert.ok(sample.trainingCutoff<target);
 assert.ok(sample.rows.length>=10);
 assert.ok(sample.rows.every(row=>Number.isFinite(row.controlScore)&&Number.isInteger(row.controlRank)));
 assert.ok(sample.rows.every(row=>Number.isFinite(row.axes['practical-v1'])&&Number.isFinite(row.axes['model-v1'])&&Number.isFinite(row.axes['strict-v1'])));
 assert.ok(sample.rows.every(row=>Number.isFinite(row.actualES)&&Number.isFinite(row.actualP4)));
});
