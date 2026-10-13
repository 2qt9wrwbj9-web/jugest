import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRemoteStoreCache} from '../../vps-ui-remote-stores.mjs';
import {selectTrendDates,computeVpsTrend} from '../../vps-ui-remote-trend.mjs';

test('VPS date selection uses the latest calendar day, not an arbitrary number of records',()=>{
 const dates=['2026-10-12','2026-10-10','2026-09-12','2026-09-13','2026-10-12','bad'];
 assert.deepEqual(selectTrendDates(dates,'30'),['2026-10-12','2026-10-10','2026-09-13']);
 assert.deepEqual(selectTrendDates(dates,'all'),['2026-10-12','2026-10-10','2026-09-13','2026-09-12']);
 assert.deepEqual(selectTrendDates([],30),[]);
});

function piaClient({dates=['2026-10-12','2026-10-10','2026-09-12'],fail='' }={}){
 const calls=[],stats={inFlight:0,maxInFlight:0,judgeCalls:0};
 return {calls,stats,
 async listStores(){return [
  {id:'pia:35',name:'PIA大船1',latestDate:dates[0],source:'pia-public-ranking-top',visibility:'public'},
  {id:'private:1',name:'非公開店舗',latestDate:dates[0],source:'relay',visibility:'private'}
 ]},
 async getStoreDaysById(id){assert.equal(id,'pia:35');return {days:dates.map(date=>({date}))}},
 async getStoreDayById(id,date){
  assert.equal(id,'pia:35');calls.push(date);stats.inFlight++;stats.maxInFlight=Math.max(stats.maxInFlight,stats.inFlight);
  try{
   await new Promise(resolve=>setTimeout(resolve,1));
   if(date===fail)throw Object.assign(new Error('authorization revoked'),{status:403});
   return {day:{date,machines:[{machine:'my',sourceMachineName:'マイジャグラーV',tableNo:'3090',games:6000,bb:20,rb:17,diff:100}]}};
  }finally{stats.inFlight--}
 },
 async judgeMachines(){stats.judgeCalls++;return {machines:[]}}
 };
}

test('historical VPS day loading is read-only, bounded, cached and excludes private stores',async()=>{
 const client=piaClient(),cache=createRemoteStoreCache({client,eventTarget:new EventTarget()});
 await cache.refresh();assert.deepEqual(cache.getStores().map(x=>x.name),['PIA大船1']);
 assert.equal(client.calls.length,1,'only latest day is preloaded');
 const progress=[];
 const days=await cache.loadTrendDays('PIA大船1',{period:'30',onProgress:x=>progress.push(x)});
 assert.deepEqual(days.map(x=>x.date),['2026-10-12','2026-10-10']);
 assert.equal(progress.at(-1).total,2);
 assert.ok(client.stats.maxInFlight<=3);
 const previous=client.calls.length;
 days[0].rows[0].bb=999;
 const reread=await cache.loadTrendDays('PIA大船1',{period:'30'});
 assert.equal(client.calls.length,previous,'historical data stays in a separate in-memory cache');
 assert.equal(reread[0].rows[0].bb,20,'consumer mutations do not taint cache');
 assert.equal(cache.getDay('PIA大船1','2026-10-10').rows.length,0,'trend loading does not pre-populate the regular day cache');
 await assert.rejects(cache.loadTrendDays('非公開店舗',{}),/見つかりません/);
});

test('VPS trend uses JUGEST judgement output and same per-day unweighted ES/confidence aggregation',async()=>{
 const entries=[
  {date:'2026-10-12',rows:[
   {machine:'my',tableNo:'3090',machineName:'マイ',games:5000,bb:20,rb:18,diff:300},
   {machine:'fk',tableNo:'3091',games:0,bb:0,rb:0,diff:null},
   {machine:'my',tableNo:'3092',games:3000,bb:10,rb:7,diff:null}
  ]},
  {date:'2026-10-11',rows:[
   {machine:'my',tableNo:'3090',games:5000,bb:15,rb:16,diff:null},
   {machine:'my',tableNo:'3092',games:3000,bb:10,rb:7,diff:null}
  ]}
 ];
 const source=structuredClone(entries);let judges=0;
 const fakeJudge=input=>{
  judges++;
  assert.ok(input.diff===null||input.diff===300);
  if(input.tableNo==='3092')return {ok:false,errors:{result:'no-result'}};
  const hi=input.bb===20,q=hi?[0,0,0,0,0,1]:[1,0,0,0,0,0];
  return {ok:true,q,expectedSetting:hi?6:1,machineName:'マイジャグラーⅤ'};
 };
 const result=await computeVpsTrend({shop:'PIA大船1',days:entries,judge:fakeJudge,yieldFrame:async()=>{}});
 assert.equal(result.dayCount,2);
 assert.equal(result.rowCount,5);
 assert.equal(result.judgedRows,2);
 assert.equal(result.skippedRows,3);
 assert.equal(result.rows.length,1);
 assert.equal(result.rows[0].tableNo,'3090');
 assert.equal(result.rows[0].days,2);
 assert.equal(result.rows[0].avgES,3.5);
 assert.equal(result.rows[0].confidence,100);
 assert.equal(result.rows[0].latest,'2026-10-12');
 assert.equal(judges,4);
 assert.deepEqual(entries,source,'raw VPS days were not modified');
 const filtered=await computeVpsTrend({days:entries,machine:'fk',judge:fakeJudge,yieldFrame:async()=>{}});
 assert.equal(filtered.rowCount,1);
 assert.equal(filtered.rows.length,0);
});

test('VPS trend is cancellable without publishing a partial ranking',async()=>{
 const days=[{date:'2026-10-12',rows:[{machine:'my',tableNo:'1',games:4000,bb:12,rb:13,diff:null}]}];
 const result=await computeVpsTrend({days,judge:()=>{throw Error('must not run')},isCurrent:()=>false});
 assert.equal(result,null);
});

test('store UI replaces the disabled remote-only warning but preserves the original local trend route',()=>{
 const ui=readFileSync(new URL('../../vps-ui-store-v2.mjs',import.meta.url),'utf8');
 assert.ok(ui.includes('runRemoteTrend()'));
 assert.ok(ui.includes('remoteTrendCache(shop)'));
 assert.ok(ui.includes("getStoreTrendRoster?.(shop,{period:'all'})"),'local data always has precedence');
 assert.ok(ui.includes('event.stopImmediatePropagation()'),'remote-only click does not invoke the legacy empty-data calculation');
 assert.ok(!ui.includes("button.textContent='端末側のデータなし'"));
 assert.ok(!ui.includes('ensureExternalJudged'),'local heavy estimator is never implicitly run');
});
