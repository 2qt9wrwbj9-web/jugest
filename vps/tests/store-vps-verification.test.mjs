import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createVerificationReader,renderVerificationResults,errorMessage} from '../../vps-ui-store-verify.mjs';
const comparison={
 live:{days:5,excluded:1,newWins:3,currentWins:1,ties:1,
  newEngine:{top1:{lift:2.3},top3:{lift:1.6},top5:{lift:1.2},rankCorrelation:.45,coverage:.9},
  currentEngine:{top1:{lift:1.1},top3:{lift:1.3},top5:{lift:1.0},rankCorrelation:.21,coverage:.8},
  rows:[{targetDate:'2026-10-08',winner:'pre_research',scores:{pre_research:{metrics:{quality:12}},current_shadow:{metrics:{quality:10}}}}]},
 historical:{processed:7,totalCandidates:10,scored:6,excluded:1,newWins:4,currentWins:2,ties:0,
  newEngine:{top1:{lift:1.8},top3:{lift:1.4},top5:{lift:1.1},coverage:.7},
  currentEngine:{top1:{lift:1.1},top3:{lift:1.0},top5:{lift:.9},coverage:.6},
  rows:[{targetDate:'2026-09-09',winner:'current_shadow',preMetrics:{quality:9},currentMetrics:{quality:13}}]}
};
test('VPS LIVE verification displays stored-only metrics and correct evaluation definitions',()=>{
 const html=renderVerificationResults(comparison,'live');
 for(const x of ['採点済み','5日','PRE版優勢','3日','現行版優勢','Top5 lift','1.20×','2026-10-08','PRE評価 12'])assert.ok(html.includes(x),x);
 assert.ok(!html.includes('モデル信頼度'),'legacy local model metric cannot masquerade as VPS metric');
 assert.ok(!html.includes('data-model-run'),'no synchronous run button');
 assert.ok(!html.includes('data-replay-run'),'no synchronous replay button');
});
test('historical walk-forward result is a separate, progress-aware read-only display',()=>{
 const html=renderVerificationResults(comparison,'historical');
 for(const x of ['7/10','6日','PRE版優勢','2026-09-09','過去検証','Top5 lift'])assert.ok(html.includes(x),x);
 assert.ok(!html.includes('この朝を再現'));
});
test('empty and unavailable results never show zero as legitimate scored performance',()=>{
 const live=renderVerificationResults({live:{days:0,excluded:3,rows:[]},historical:null},'live');
 assert.ok(live.includes('答え合わせを蓄積中'));
 assert.ok(!live.includes('Top5 lift'));
 const hist=renderVerificationResults({historical:null},'historical');
 assert.ok(hist.includes('過去検証の準備中'));
 const err=errorMessage({code:'vps_credentials_unavailable'});
 assert.ok(err.includes('Collector連携'));
 assert.ok(errorMessage({code:'vps_store_not_found'}).includes('店舗'));
});
test('renderer escapes text from VPS response, including diagnostic errors',()=>{
 const html=renderVerificationResults({live:{...comparison.live,rows:[{targetDate:'<img src=x onerror=alert(1)>',excludedReason:'<svg>'}]}},'live');
 assert.ok(!html.includes('<img'));
 assert.ok(html.includes('&lt;img'));
 assert.ok(!html.includes('<svg>'));
 const err=errorMessage(new Error('<script>alert(1)</script>'));
 assert.ok(!err.includes('<script>'));
});
test('VPS verification reader coalesces requests, caches per store and does not mutate state',async()=>{
 let now=1,calls=[];
 const client={async getResearchComparison(name,args){calls.push([name,args]);await Promise.resolve();return {comparison:{live:{days:name==='A'?1:7}}}}};
 const rd=createVerificationReader({client,clock:()=>now,ttlMs:1000});
 const [a,b]=await Promise.all([rd.read('A'),rd.read('A')]);
 assert.equal(a.live.days,1);assert.equal(b.live.days,1);assert.equal(calls.length,1);
 assert.equal((await rd.read('B')).live.days,7);assert.equal(calls.length,2);
 now+=100;assert.equal((await rd.read('A')).live.days,1);assert.equal(calls.length,2);
 await rd.read('A',{force:true});assert.equal(calls.length,3);
 now+=1100;assert.equal(rd.peek('A'),null,'expired cache must not render forever');await rd.read('A');assert.equal(calls.length,4);
 rd.clear('A');await rd.read('A');assert.equal(calls.length,5);
 assert.deepEqual(calls.map(x=>x[1]),Array(5).fill({limit:90}));
});
test('store UI does not expose synchronous legacy model or replay controls',()=>{
 const code=readFileSync(new URL('../../vps-ui-store-v2.mjs',import.meta.url),'utf8');
 assert.ok(code.includes("else if(kind==='verify')"),'verification is rendered separately from legacy screen');
 assert.ok(code.includes('verificationScreen(screen,shop,o)'));
 assert.ok(code.includes('verificationReader.read(shop,{force})'));
 const block=code.slice(code.indexOf('function verificationScreen'),code.indexOf('function repairRemoteTrendSummary'));
 assert.ok(!block.includes('data-model-run'));
 assert.ok(!block.includes('data-replay-run'));
 assert.ok(code.includes('VPS蓄積（台番傾向は未同期）'));
});
