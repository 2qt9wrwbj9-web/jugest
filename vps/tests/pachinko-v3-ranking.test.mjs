import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPachinkoRotationRanking,MIN_RANK_DAYS,MIN_DAILY_START} from '../../pachinko-rotation-ranking.mjs';
import {__test as ui} from '../../vps-ui-pachinko.mjs';
const sea='OUMI5_SPECIAL_ALTA',gh='TOKYO_GHOUL_399';
const dates=Array.from({length:30},(_,i)=>new Date(Date.UTC(2026,9,10-i)).toISOString().slice(0,10));
const row=(no,i,k,{status='verified',start=1000,model=sea,identity=no}={})=>({identity,machine_no:no,machine_model_key:model,business_date:dates[i],estimator_status:status,estimated_k:status==='verified'?k:null,candidate_k:status==='provisional'?k:null,sample_size:start,record_id:i+100});
test('rankings use median first and mean second, one valid day per machine/date',()=>{
 const r={dates,records:[...Array.from({length:12},(_,i)=>row('101',i,i===0?48:20)),...Array.from({length:14},(_,i)=>row('102',i,21)),row('102',0,88)]};
 const out=buildPachinkoRotationRanking(r);
 assert.equal(out.windowDays,30);assert.equal(out.ranked.length,2);assert.equal(out.ranked[0].machineNo,'102');
 assert.equal(out.ranked[0].medianK,21);assert.equal(out.ranked[0].meanK,21);
 assert.equal(out.ranked[0].verifiedDays,14,'duplicate day must not add a vote');
 assert.equal(out.ranked[1].medianK,20);
 assert.ok(out.ranked[1].meanK>out.ranked[1].medianK,'outlier changes mean, not median');
 assert.equal(MIN_RANK_DAYS,10);assert.equal(MIN_DAILY_START,500);
});
test('missing sample, short days and provisional values never enter verified ranking',()=>{
 const records=[...Array.from({length:9},(_,i)=>row('101',i,30)),
 ...Array.from({length:20},(_,i)=>row('102',i,30,{status:'provisional',model:gh})),
 ...Array.from({length:20},(_,i)=>row('103',i,55,{start:300})),
 row('104',0,77,{start:null})];
 const out=buildPachinkoRotationRanking({dates,records});
 assert.equal(out.ranked.length,0);
 assert.equal(out.provisional.length,1);assert.equal(out.provisional[0].machineNo,'102');
 assert.equal(out.provisional[0].referenceMedianK,30);assert.equal(out.provisional[0].verifiedDays,0);
 assert.equal(out.insufficient.length,1);assert.equal(out.insufficient[0].verifiedDays,9);
 assert.equal(out.observedMachines,4);
});
test('model filter respects actual model key and 30-day bounded window',()=>{
 const data={dates:[...dates,'2026-01-01'],records:[...Array.from({length:12},(_,i)=>row('101',i,22)),...Array.from({length:12},(_,i)=>row('102',i,29,{model:gh,status:'provisional'})),{...row('103',0,99),business_date:'2026-01-01'}]};
 assert.equal(buildPachinkoRotationRanking(data,{model:gh}).ranked.length,0);
 assert.equal(buildPachinkoRotationRanking(data,{model:gh}).provisional.length,1);
 assert.equal(buildPachinkoRotationRanking(data,{model:sea}).ranked.length,1);
 assert.equal(buildPachinkoRotationRanking(data,{model:sea}).observedMachines,1);
});
test('unified overview, data, ranking and yutime tabs share one in-store navigation',()=>{
 for(const active of ['overview','data','rank','yutime']){
  const html=ui.pachinkoStoreTabs(active);
  assert.ok(html.includes('p-store-tabs'));
  assert.ok(html.includes('data-workspace="store"'));
  assert.ok(html.includes('data-action="store-data"'));
  assert.ok(html.includes('data-pachinko-rank'));
  assert.ok(html.includes('data-pachinko-yutime'));
  assert.equal((html.match(/class="on"/g)||[]).length,1);
 }
 const matrix={models:[],dates,records:Array.from({length:11},(_,i)=>row('321',i,20.5)),roster:[]};
 const screen=ui.renderPachinkoRankState({rankMatrix:matrix,rankFilter:'',rankLoading:false,rankError:'',detail:null});
 assert.ok(screen.includes('PIA大船-P'));assert.ok(screen.includes('data-pachinko-rank-filter'));
 assert.ok(screen.includes('321番'));assert.ok(screen.includes('20.5'));
 assert.ok(screen.includes('p-rank-history'));assert.ok(screen.includes('日付確定'));
 assert.ok(!screen.includes('data-workspace="pachinko"'));
});

test('gaps in collected dates do not expand past the last 30 calendar days',()=>{const sparse=[dates[0],dates[1],'2026-07-01'];const out=buildPachinkoRotationRanking({dates:sparse,records:[row('101',0,30),row('101',1,30),{...row('101',0,99),business_date:'2026-07-01'}]});assert.equal(out.windowDays,2);assert.equal(out.observedMachines,1);assert.equal(out.insufficient[0].verifiedDays,2)});
