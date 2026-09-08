import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {boot,memoryStorage,plain} from './helpers/runtime.mjs';
import {
  STATE_KEY,EXTERNAL_DB_KEY,predictionHistorySpec,makeRawPredictionHistory,
  packPredictionHistory,makeStoredState,predictionTargets
} from './helpers/axis-auto-selector-baseline.mjs';
import {createAxisRegistry} from '../research/axis-auto-selector/registry.mjs';
import {axisSignalsFromPredictionRow} from '../research/axis-auto-selector/jugest-adapter.mjs';
import {runShadowEvaluation} from '../research/axis-auto-selector/shadow.mjs';

const VISIBLE_FIELDS=['rank','aimScore','hybridScore','predP4','predES','practicalSignal','modelSignal','strictSignal'];
const dayMs=86400000;
const ymd=ms=>new Date(ms).toISOString().slice(0,10);

function compactVisible(result){
  return result.rows.map(row=>({
    machine:row.machine,
    tableNo:String(row.tableNo),
    ...Object.fromEntries(VISIBLE_FIELDS.map(field=>[field,row[field]]))
  }));
}

function makeShadowSamples(predictionRows,registry){
  const start=Date.parse('2026-03-01T00:00:00Z');
  return Array.from({length:24},(_,dayIndex)=>{
    const target=start+dayIndex*dayMs;
    const rows=predictionRows.map((row,rowIndex)=>{
      const practical=Number.isFinite(row.practicalSignal)?row.practicalSignal:0;
      return axisSignalsFromPredictionRow({
        ...plain(row),
        actualES:1+5*practical+rowIndex*1e-6,
        actualP4:practical
      },registry);
    });
    return{
      targetDate:ymd(target),
      trainingCutoff:ymd(target-dayMs),
      sourceSignature:`runtime-parity-${dayIndex}`,
      rows
    };
  });
}

test('phase-1 shadow evaluation cannot alter current JUGEST prediction output or v4HybridProfiles storage',async()=>{
  const rawHistory=makeRawPredictionHistory(predictionHistorySpec);
  const storage=memoryStorage({[STATE_KEY]:makeStoredState(predictionHistorySpec)});
  storage.idb=new Map([[EXTERNAL_DB_KEY,packPredictionHistory(rawHistory)]]);
  const {ctx}=await boot({storage,loadApp:false});
  const targetDate=predictionTargets(predictionHistorySpec).forward;

  const before=ctx.V4_TEST.predictStore(predictionHistorySpec.shop,targetDate);
  assert.ok(before?.rows?.length>=10,'current prediction must exist');
  const beforeVisible=plain(compactVisible(before));
  const stateBefore=storage.getItem(STATE_KEY);

  const registry=createAxisRegistry();
  const samples=makeShadowSamples(before.rows,registry);
  const samplesBefore=JSON.stringify(samples);
  const dir=await mkdtemp(join(tmpdir(),'jugest-axis-runtime-parity-'));
  const profilePath=join(dir,'shadow-profiles.json');
  const shadow=await runShadowEvaluation({
    store:predictionHistorySpec.shop,
    samples,
    registry,
    profilePath,
    trainedAt:'2026-09-08T00:00:00.000Z'
  });

  assert.equal(shadow.shadowOnly,true);
  assert.equal(JSON.stringify(samples),samplesBefore,'shadow execution must not mutate copied current signals');
  assert.equal(storage.getItem(STATE_KEY),stateBefore,'existing localStorage state including v4HybridProfiles must remain byte-identical');
  const shadowFile=await readFile(profilePath,'utf8');
  assert.doesNotMatch(shadowFile,/v4HybridProfiles|juggler_tool_state_v33/,'shadow profile storage must remain isolated');

  const after=ctx.V4_TEST.predictStore(predictionHistorySpec.shop,targetDate);
  assert.deepEqual(plain(compactVisible(after)),beforeVisible,'current visible ranking/signals must remain unchanged after shadow execution');
  assert.equal(storage.getItem(STATE_KEY),stateBefore,'second current prediction must still not observe shadow profile storage');
});
