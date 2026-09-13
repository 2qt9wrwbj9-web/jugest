import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {ensureHistoricalComparisonRun,persistHistoricalComparisonDay} from '../src/research/historical-comparison.mjs';
import {buildHistoricalComparisonSummary} from '../src/research/historical-summary.mjs';
import {SCORER_VERSION} from '../src/research/live-comparison.mjs';

const NOW='2026-09-13T12:00:00.000Z';
function date(index){return new Date(Date.UTC(2026,0,1)+index*86400000).toISOString().slice(0,10)}
function metric(quality){return {machineCount:10,coverage:1,rankCorrelation:quality/100,quality,top1:{rate:.2,lift:2},top3:{rate:.5,lift:1.6},top5:{rate:.6,lift:1.2}}}
function seedHistoricalFixture(){
  const db=openDatabase(':memory:');migrate(db);
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s','研究店','{}',NOW,NOW);
  const days=Array.from({length:10},(_,i)=>({date:date(i),machines:[{tableNo:'101',diff:i*10}]}));
  const run=ensureHistoricalComparisonRun(db,{storeId:'s',days,nowIso:NOW});
  persistHistoricalComparisonDay(db,{runId:run.id,storeId:'s',targetDate:date(7),preMetrics:metric(130),currentMetrics:metric(100),winner:'pre_research',outcomeInputHash:'o7',preState:{fingerprint:'fp7'},scorerVersion:SCORER_VERSION,createdAt:NOW});
  persistHistoricalComparisonDay(db,{runId:run.id,storeId:'s',targetDate:date(8),preMetrics:metric(90),currentMetrics:metric(120),winner:'current_shadow',outcomeInputHash:'o8',preState:{fingerprint:'fp8'},scorerVersion:SCORER_VERSION,createdAt:NOW});
  persistHistoricalComparisonDay(db,{runId:run.id,storeId:'s',targetDate:date(9),excludedReason:'missing_current_shadow',preState:{fingerprint:'fp9'},scorerVersion:SCORER_VERSION,createdAt:NOW});
  return db;
}

test('historical summary aggregates only scored walk-forward rows and keeps exclusions separate',()=>{
  const db=seedHistoricalFixture();
  const summary=buildHistoricalComparisonSummary(db,{storeId:'s'});
  assert.equal(summary.scored,2);
  assert.equal(summary.excluded,1);
  assert.equal(summary.newWins,1);
  assert.equal(summary.currentWins,1);
  assert.equal(summary.ties,0);
  assert.equal(summary.newEngine.days,2);
  assert.equal(summary.currentEngine.days,2);
  assert.equal(summary.rows.length,3);
  assert.equal(summary.rows[0].targetDate,date(9));
  db.close();
});

test('historical summary never falls back to LIVE rows and returns null with no historical run',()=>{
  const db=openDatabase(':memory:');migrate(db);
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('empty','空店','{}',NOW,NOW);
  assert.equal(buildHistoricalComparisonSummary(db,{storeId:'empty'}),null);
  db.close();
});
