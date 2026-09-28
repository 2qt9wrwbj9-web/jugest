import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,plain} from './helpers/runtime.mjs';

const SHOP='PIA大船1',TARGET='2026-09-28';

function shift(date,days){
  const d=new Date(date+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}
function qFor(setting,boost=0){
  const q=Array.from({length:6},(_,i)=>Math.exp(-Math.pow((i+1-setting)/1.25,2)));
  q[Math.max(0,Math.min(5,Math.round(setting)-1))]*=1+boost;
  const sum=q.reduce((a,b)=>a+b,0);
  return q.map(x=>x/sum);
}
function machineRow(dayIndex,tableIndex,{extreme=false}={}){
  const machines=['my','im','go','fk'],machine=machines[tableIndex%machines.length];
  const base=extreme?5.9:2.4+((dayIndex*3+tableIndex*5)%24)/10;
  const q=qFor(Math.max(1,Math.min(6,base)),(tableIndex%3)*.08);
  const expectedSetting=q.reduce((s,v,i)=>s+v*(i+1),0);
  const p4=q.slice(3).reduce((a,b)=>a+b,0),p5=q.slice(4).reduce((a,b)=>a+b,0),p6=q[5];
  const games=extreme?9200:4200+((dayIndex*211+tableIndex*137)%3100);
  const rate=155-Math.round((expectedSetting-1)*8);
  const bonuses=Math.max(1,Math.round(games/rate));
  const rb=Math.max(0,Math.round(bonuses*(.42+(tableIndex%4)*.04)));
  const bb=Math.max(0,bonuses-rb);
  const diff=extreme?5200:Math.round((expectedSetting-3.2)*720+((tableIndex%5)-2)*110);
  return {machine,machineName:machine,tableNo:String(3101+tableIndex),games,bb,rb,diff,q,expectedSetting,p4,p5,p6};
}
function day(date,dayIndex,{extreme=false}={}){
  return {id:`${SHOP}-${date}`,date,shop:SHOP,source:'test',machines:Array.from({length:16},(_,i)=>machineRow(dayIndex,i,{extreme}))};
}
function history(count){
  return Array.from({length:count},(_,i)=>day(shift(TARGET,-count+i),i));
}
function compact(rank){
  if(!rank)return null;
  return plain({score:rank.score,go:rank.go,tier:rank.tier,shortHistory:rank.shortHistory||false,pred:{
    trainingDays:rank.pred?.trainingDays,shortHistory:rank.pred?.shortHistory||false,champion:rank.pred?.champion??null,
    championLabel:rank.pred?.championLabel,reliability:rank.pred?.reliability,
    rows:(rank.pred?.rows||[]).slice(0,8).map(r=>({machine:r.machine,tableNo:r.tableNo,rank:r.rank,aimScore:r.aimScore,predP4:r.predP4,predES:r.predES,rootConfidence:r.rootConfidence}))
  },portfolio:(rank.portfolio||[]).map(r=>({machine:r.machine,tableNo:r.tableNo,aimScore:r.aimScore,predP4:r.predP4,predES:r.predES}))});
}

test('legacy prediction is unavailable through 6 days and available from 7 through 44 days',async()=>{
  const {ctx}=await boot({loadApp:false}),v4=ctx.V4_SHORT_TEST;
  assert.equal(v4.legacyStoreRank(SHOP,TARGET,history(6)),null);
  for(const n of [7,10,30,36,44]){
    v4.invalidate();
    const rank=v4.legacyStoreRank(SHOP,TARGET,history(n));
    assert.ok(rank,`${n} days should produce a legacy prediction`);
    assert.equal(rank.shortHistory,true);
    assert.equal(rank.pred.shortHistory,true);
    assert.equal(rank.pred.trainingDays,n);
    assert.equal(rank.pred.champion,null,'short mode must not invent a strict Champion');
    assert.notEqual(rank.tier,'validated','short mode must not claim validated');
    assert.ok(rank.portfolio.length>0,`${n} days should produce candidates`);
    for(const row of rank.portfolio){
      for(const key of ['aimScore','predP4','predES','rootConfidence'])assert.ok(Number.isFinite(row[key]),`${n}d ${key} must be finite`);
    }
  }
});

test('45 and 90 day legacy routing is exactly the existing full-history path',async()=>{
  const {ctx}=await boot({loadApp:false}),v4=ctx.V4_SHORT_TEST;
  for(const n of [45,90]){
    const src=history(n);
    v4.invalidate();const legacy=compact(v4.legacyStoreRank(SHOP,TARGET,src));
    v4.invalidate();const existing=compact(v4.storeRank(SHOP,TARGET,src));
    assert.deepEqual(legacy,existing,`${n} days must delegate to the unchanged existing path`);
    assert.equal(legacy?.shortHistory,false);
  }
});

test('target-day and future rows never enter short-history training',async()=>{
  const {ctx}=await boot({loadApp:false}),v4=ctx.V4_SHORT_TEST;
  const base=history(10);
  v4.invalidate();const a=compact(v4.legacyStoreRank(SHOP,TARGET,base));
  const contaminated=[...base,day(TARGET,100,{extreme:true}),day(shift(TARGET,1),101,{extreme:true}),day(shift(TARGET,7),107,{extreme:true})];
  v4.invalidate();const b=compact(v4.legacyStoreRank(SHOP,TARGET,contaminated));
  assert.deepEqual(b,a,'same-day and future data must not change the prediction');
});

test('legacy plan result exposes the 7-day threshold and short-mode metadata',async()=>{
  const {ctx}=await boot({loadApp:false}),v4=ctx.V4_SHORT_TEST;
  let r=v4.legacyPlan(SHOP,TARGET,{},history(6));
  assert.equal(r.available,false);assert.equal(r.trainingDays,6);assert.equal(r.minimumDays,7);assert.equal(r.reason,'insufficient-history');
  v4.invalidate();r=v4.legacyPlan(SHOP,TARGET,{},history(7));
  assert.equal(r.available,true);assert.equal(r.shortHistory,true);assert.equal(r.trainingDays,7);assert.equal(r.status,'SHORT_HISTORY');
  assert.equal(r.championLabel,'保留（短期履歴）');assert.ok(r.candidates.length>0);assert.ok(r.candidates.every(x=>x.shortHistory));
});

test('short-history confidence grows conservatively and never reaches full-history trust',async()=>{
  const {ctx}=await boot({loadApp:false}),v4=ctx.V4_SHORT_TEST;
  const trusts=[];
  for(const n of [7,10,30,44]){
    v4.invalidate();const pred=v4.shortPredictStore(SHOP,TARGET,history(n));
    assert.ok(pred);trusts.push(pred.shortHistoryTrust);
    assert.ok(pred.shortHistoryTrust>=.10&&pred.shortHistoryTrust<.80);
    assert.ok(pred.reliability<=.42);
  }
  for(let i=1;i<trusts.length;i++)assert.ok(trusts[i]>trusts[i-1]);
});
