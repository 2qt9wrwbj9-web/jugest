import test from 'node:test';
import assert from 'node:assert/strict';
import {createOperationsController,__test} from '../vps-ui-operations.mjs';
import {createVpsAnalyticsClient} from '../vps-browser-analytics.mjs';
import {openDatabase} from '../vps/src/db.mjs';
import {migrate} from '../vps/src/schema.mjs';
import {buildPredictionPerformance} from '../vps/src/research/prediction-performance.mjs';
const empty=()=>{const db=openDatabase(':memory:');try{migrate(db);return buildPredictionPerformance(db,{storeId:'empty',nowIso:'2026-10-09T02:00:00Z'})}finally{db.close()}};
test('performance with no evaluations shows unknown metrics and distinct pending states',()=>{
 const p=empty();p.rows=[{targetDate:'2026-10-10',state:'waiting_result',reason:'outcome_unavailable',predictions:{},performance:{}}];
 const html=__test.performanceHtml(p,'7');assert.match(html,/評価0件/);assert.match(html,/結果待ち/);assert.match(html,/実績がまだ届いていない/);
 assert.doesNotMatch(html,/>0\.0%/);assert.match(html,/設定は不明/);
});
test('collection HTML uses actual inspection and authorized retry actions while escaping source text',()=>{
 const html=__test.collectionHtml({summary:{targetStores:1,completeStores:0,pendingStores:1,missingMachines:null,unknownInventoryStores:1,retryQueued:0},stores:[{id:'a',name:'<img src=x onerror=alert(1)>',state:'needs_review',latestDate:'2026-10-08',integrity:{actualCount:2,expectedCount:3,missingFields:{diff:1},issues:[]},missingMachines:1,jobs:{},canRetry:{analysis:true,evaluation:false}}]},false);
 assert.match(html,/保存 2台・期待 3台/);assert.match(html,/差枚不明 1台/);assert.match(html,/data-vps-op-retry="analysis"/);assert.doesNotMatch(html,/data-vps-op-retry="evaluation"|<img /);assert.match(html,/&lt;img/);
});
test('changing periods limits the daily history and retains future result waiting',()=>{
 const p=empty(),today='2026-10-09';p.periods['7'].fromDate='2026-10-06';p.periods['7'].throughDate='2026-10-08';
 p.rows=['2026-10-10','2026-10-08','2026-10-06','2026-10-01'].map(targetDate=>({targetDate,state:targetDate>today?'waiting_result':'not_predicted',reason:null,performance:{},predictions:{}}));
 const html=__test.performanceHtml(p,'7');assert.match(html,/2026-10-10/);assert.match(html,/2026-10-06/);assert.doesNotMatch(html,/2026-10-01/);
});
test('a newer store request wins and an authorization failure clears earlier private data',async()=>{
 let release,fail=false;const p=empty();const api={getOperations:async()=>{if(fail)throw Object.assign(new Error('denied'),{code:'forbidden'});return{operations:{stores:[{id:'a',name:'店A'},{id:'b',name:'店B'}]}}},getPredictionPerformanceById:async id=>id==='a'?await new Promise(r=>{release=()=>r({performance:{...p,storeId:'a'}})}):({performance:{...p,storeId:'b'}})};
 const c=createOperationsController({getClient:()=>api});const first=c.open('performance');while(!release)await new Promise(r=>setImmediate(r));
 await c.selectStore('b');release();await first;assert.equal(c.state.performance.storeId,'b');assert.equal(c.state.busy,false);
 fail=true;await c.refresh();assert.equal(c.state.overview,null);assert.equal(c.state.performance,null);assert.match(c.html(),/権限がありません/);assert.doesNotMatch(c.html(),/店B/);
});
test('retry uses the existing API once, refreshes real status, and preserves POST protection on cookie fallback',async()=>{
 const calls=[],storage={getItem:()=>JSON.stringify({linked:true,channelId:'owner',receiverToken:'fixture'})};
 const client=createVpsAnalyticsClient({piaOnly:true,storage,fetchFn:async(url,options)=>{calls.push({url,options});return calls.length===1?Response.json({ok:false,code:'unauthorized'},{status:401}):Response.json({ok:true,queued:true})}});
 await client.retryStoreOperation('pia:35',{kind:'evaluation'});assert.equal(calls.length,2);assert.equal(calls[1].options.method,'POST');assert.equal(calls[1].options.headers['content-type'],'application/json');assert.equal(calls[1].options.headers['x-jugest-operations'],'1');assert.equal(calls[1].options.headers.authorization,'Bearer fixture');
 let requests=0;const c=createOperationsController({getClient:()=>({retryStoreOperation:async()=>{requests++;return{queued:true}},getOperations:async()=>({operations:{stores:[]}})})});await c.retry('a','evaluation');assert.equal(requests,1);assert.match(c.state.message,/登録/);assert.equal(c.state.busy,false);
});
test('a denied retry clears private state and access invalidation discards an in-flight response',async()=>{
 let release;const c=createOperationsController({getClient:()=>({retryStoreOperation:async()=>{throw Object.assign(new Error('denied'),{status:403})}})});
 c.state.overview={stores:[{id:'private',name:'秘密の店'}]};c.state.performance=empty();await c.retry('private','evaluation');assert.equal(c.state.overview,null);assert.equal(c.state.performance,null);
 const next=createOperationsController({getClient:()=>({getOperations:async()=>await new Promise(r=>{release=r})})});const running=next.refresh();next.invalidate();release({operations:{stores:[{name:'以前の秘密店'}]}});await running;assert.equal(next.state.overview,null);assert.equal(next.state.busy,false);
});
