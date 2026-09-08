import test from 'node:test';
import assert from 'node:assert/strict';
import {planParallelism,partitionTargetIndices,buildHistoricalSampleBundleParallel} from '../research/axis-auto-selector/historical-parallel.mjs';
import {bootJugestResearchRuntime} from '../research/axis-auto-selector/jugest-headless.mjs';
import {buildHistoricalSampleBundle} from '../research/axis-auto-selector/historical-builder.mjs';
import {makeRawPredictionHistory,predictionHistorySpec} from './helpers/axis-auto-selector-baseline.mjs';

function shift(date,days){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}

test('parallel planner respects CPU, memory and max-worker bounds',()=>{
 const plan=planParallelism({requested:'auto',cpuCount:8,rowCount:54000,targetCount:100,memoryBudgetMB:1024,maxWorkers:4});
 assert.equal(plan.workers,2);
 assert.equal(plan.cpuCap,4);
 assert.equal(plan.memoryCap,2);
 assert.ok(plan.estimatedWorkerMB>340&&plan.estimatedWorkerMB<350);
 const low=planParallelism({requested:'auto',cpuCount:8,rowCount:54000,targetCount:100,memoryBudgetMB:300,maxWorkers:8});
 assert.equal(low.workers,1);
 const explicit=planParallelism({requested:8,cpuCount:16,rowCount:1000,targetCount:2,memoryBudgetMB:4096,maxWorkers:8});
 assert.equal(explicit.workers,2);
});

test('target partitioning is contiguous, balanced and deterministic',()=>{
 const chunks=partitionTargetIndices([24,25,26,27,28,29,30,31],3);
 assert.deepEqual(chunks,[[24,25,26],[27,28,29],[30,31]]);
});

test('weighted target partitioning balances growing historical replay cost without breaking chronology',()=>{
 const chunks=partitionTargetIndices([0,1,2,3,4,5],2,{costs:[1,2,3,4,5,6]});
 assert.deepEqual(chunks,[[0,1,2,3],[4,5]]);
});

test('parallel historical builder is semantically identical to sequential current JUGEST replay',async()=>{
 const days=makeRawPredictionHistory(predictionHistorySpec).sort((a,b)=>a.date.localeCompare(b.date));
 const end=days.at(-1).date,start=shift(end,-3);
 const runtime=await bootJugestResearchRuntime({rootDir:process.cwd()});
 const sequential=buildHistoricalSampleBundle({store:predictionHistorySpec.shop,days,runtime,startDate:start,endDate:end,minPriorDays:20});
 const parallel=await buildHistoricalSampleBundleParallel({store:predictionHistorySpec.shop,days,startDate:start,endDate:end,minPriorDays:20,workers:2,memoryBudgetMB:4096,rootDir:process.cwd()});
 assert.deepEqual(parallel.samples,sequential.samples);
 assert.deepEqual(parallel.source,sequential.source);
 assert.deepEqual(parallel.range,sequential.range);
 assert.deepEqual(parallel.buildAudit.skipped,sequential.buildAudit.skipped);
 assert.equal(parallel.buildAudit.execution.mode,'parallel');
 assert.equal(parallel.buildAudit.execution.workers,2);
});

test('fast runner recycles the worker after every target while keeping bounded concurrency',async()=>{
 const days=makeRawPredictionHistory(predictionHistorySpec).sort((a,b)=>a.date.localeCompare(b.date));
 const end=days.at(-1).date,start=shift(end,-3);
 const bundle=await buildHistoricalSampleBundleParallel({store:predictionHistorySpec.shop,days,startDate:start,endDate:end,minPriorDays:20,workers:2,memoryBudgetMB:4096,rootDir:process.cwd()});
 const execution=bundle.buildAudit.execution;
 assert.equal(execution.workerLifecycle,'per-target');
 assert.equal(execution.workers,2);
 assert.equal(execution.tasks,4);
 assert.equal(execution.chunks.length,4);
 assert.ok(execution.chunks.every(chunk=>chunk.targetCount===1&&chunk.startDate===chunk.endDate));
});
