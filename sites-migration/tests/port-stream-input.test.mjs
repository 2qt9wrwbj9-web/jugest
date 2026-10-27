import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runAnalysisAudit} from '../lib/analysis/runtime-node.mjs';
import {fileURLToPath} from 'node:url';
const fixture=JSON.parse(readFileSync(new URL('../dev/fixture-data.json',import.meta.url)));
test('streamed original normalizer preserves complete model and stage values',async()=>{
 const {runCompiledStoreModelStream}=await import('../lib/analysis/compiled-worker.mjs');
 assert.equal(typeof runCompiledStoreModelStream,'function');
 const options={shop:'移植検証・第一店舗',sourceStoreId:'dev-store-one',targetDate:'2026-02-19'};
 const original=await runAnalysisAudit({...options,days:fixture.days,rootDir:fileURLToPath(new URL('../upstream/',import.meta.url)),captureStages:true});
 const {encodeStage,hashStage}=await import('../lib/analysis/stage-hash.mjs');
 const stages={};async function* days(){for(const day of fixture.days)yield structuredClone(day)}
 const result=await runCompiledStoreModelStream({...options,days:days(),onStage:(name,value)=>{if(value!==undefined)stages[name]=hashStage(encodeStage(value))}});
 assert.deepEqual(JSON.parse(JSON.stringify(result)),original.model);
 assert.deepEqual(stages,original.stages);
});
test('streamed standard store analysis keeps original saved analysis contract',async()=>{
 const {runCompiledStoreAnalysisStream}=await import('../lib/analysis/compiled-worker.mjs');
 const {runExistingStoreAnalysis}=await import('../upstream/vps/src/analysis/runtime-adapter.mjs');
 const options={period:'180',minG:'2000',maxDims:'1',minDays:'4'},shop='移植検証・第一店舗';
 const expected=await runExistingStoreAnalysis({rootDir:fileURLToPath(new URL('../upstream/',import.meta.url)),shop,sourceStoreId:'dev-store-one',days:fixture.days,options});
 async function* days(){yield* fixture.days}
 const actual=await runCompiledStoreAnalysisStream({shop,sourceStoreId:'dev-store-one',days:days(),options});
 assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected);
});

test('daily receipt input hash keeps original descriptor semantics with streamed days',async()=>{const {originalDailyInputHash}=await import('../lib/analysis/original-input-hash.mjs');const {hashCanonical}=await import('../upstream/vps/src/canonical-json.mjs');async function* days(){yield* fixture.days}assert.equal(await originalDailyInputHash({storeId:'dev-store-one',days:days()}),hashCanonical({storeId:'dev-store-one',analysisVersion:'vps-runtime-v1',options:{period:'180',minG:'2000',maxDims:'1',minDays:'4'},days:fixture.days}))});
