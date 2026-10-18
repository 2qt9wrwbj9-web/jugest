import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {boot,plain} from './helpers/runtime.mjs';
import {patchJugestIndexSource} from '../vps/src/ui-source-patch.mjs';
import {patchStoreAnalysisApp} from '../build-store-analysis-view.mjs';
import {patchAnalysisJitterApp} from '../build-analysis-jitter-fix.mjs';
import {__test as storeV2} from '../vps-ui-store-v2.mjs';
import '../store-day-allocation.js';

const viewFile='store-day-allocation-view.js';
const q=[.1,.1,.1,.2,.2,.3];
const event=count=>({kind:'atLeast',count,priorProbability:.25,posteriorProbability:.9,logBF:2,logEValue:1,logThreshold:8,modelPass:false,strongEnabled:false,baselines:[{id:'low-heavy',weights:[.7,.2,.1,0,0,0],logBF:1.2},{id:'middle-heavy',weights:[.1,.1,.6,.1,.05,.05],logBF:.7},{id:'some-high',weights:[.5,.1,.1,.1,.1,.1],logBF:.3}]});
function report(date='2026-10-16'){
 const row={id:'my:101',tableNo:'101',machine:'my',input:{games:5000,bb:20,rb:18,diff:null},individual:{q:q.slice()}};
 const bands=['456','56','6'].map(id=>({id,distribution:[.1,.3,.6],priorDistribution:[.4,.3,.3],expected:1.5,median:2,interval:{lo:0,hi:2},sensitivityRange:{lo:0,hi:2},events:{all:event(2),half:event(1),third:event(1)}}));
 return {ok:true,store:{id:'s1',name:'テスト店'},date,snapshot:{inputHash:'input-a',sourceRevision:'r1',observedAt:`${date}T22:00:00+09:00`,status:'final'},roster:{status:'partial'},quality:{},familySize:27,alpha:.05,strongEnabled:false,groups:[{machine:'my',machineName:'マイジャグラーⅤ',nInstalled:2,nObserved:2,eligible:true,reasons:[],rows:[row,{...row,id:'my:102',tableNo:'102'}],zeroGamesN:1,lowGamesN:1,diffN:0,result:{ok:true,version:'test-v1',n:2,strongEnabled:false,bands}},{machine:'go',machineName:'ゴーゴージャグラー3',nInstalled:3,nObserved:2,eligible:false,reasons:[{code:'missing_rows',message:'台番201のGが不明'}],rows:[]},{machine:'im',machineName:'アイムジャグラー',nInstalled:null,nObserved:1,eligible:false,reasons:['roster_unverified'],rows:[]}],unsupported:[{machineName:'未対応<機種>',tableNo:'999'}]};
}
function withDetail(base,machine='my',kind='exact',count=1,band='456'){
 const value=structuredClone(base),group=value.groups.find(g=>g.machine===machine);
 group.result.detail={band,kind,count,priorProbability:.3,posteriorProbability:.5,logBF:1.1,logEValue:kind==='exact'?null:1,rows:group.rows.map(row=>({...row,conditionalQ:[0,0,0,.4,.3,.3],conditional:[0,0,0,.4,.3,.3],logBFInfluence:.2}))};
 return value;
}
async function ready({getAllocation=async()=>report(),patched=false}={}){
 const runtime=await boot({htmlSource:patched?patchJugestIndexSource(fs.readFileSync('index.html','utf8')):null,loadApp:!patched});
 if(fs.existsSync(viewFile))vm.runInContext(fs.readFileSync(viewFile,'utf8'),runtime.ctx,{filename:viewFile});
 assert.ok(runtime.ctx.JUGESTStoreDayAllocationView,'allocation display is loaded independently from legacy judgement');
 if(patched){vm.runInContext(patchAnalysisJitterApp(patchStoreAnalysisApp(fs.readFileSync('app-v510.js','utf8'))),runtime.ctx);runtime.app=new (runtime.ctx.customElements.get('jugest-app'))()}
 runtime.ctx.JUGEST_VPS_ANALYTICS_CLIENT={getAllocation};
 runtime.ctx.JUGEST_CORE_BRIDGE={...runtime.bridge,getStoreDates:()=>['2026-10-16','2026-10-15'],getStoreDay:()=>{throw Error('Allocation must not use fallback day data')},getActiveStore:()=>runtime.app.state.activeStore,getStores:()=>[{name:'テスト店'},{name:'別店舗'}]};
 runtime.app.state.activeStore='テスト店';runtime.app.state.storeDate='2026-10-16';
 return runtime;
}
function control(attr,value){return {value,closest:s=>s===`[${attr}]`?{value}:null}}
function change(app,attr,value){return app.onChange({target:control(attr,value)})}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}

test('allocation entry preserves selected store and exact day without reading legacy fallback data',async()=>{
 const calls=[],{app}=await ready({getAllocation:async(...args)=>{calls.push(args);return report(args[1])}});
 assert.match(app.renderStoreTabs('data'),/data-action="store-allocation"/);
 app.state.storeDate='2026-10-01';app.handleAction('store-allocation');
 assert.equal(app.state.storeDate,'2026-10-01');assert.equal(app.state.screen,'allocation');
 assert.match(app.mount.innerHTML,/この日の投入を調べる/);assert.match(app.mount.innerHTML,/2026-10-01/);
 await app.runAllocation();assert.equal(calls[0][0],'テスト店');assert.equal(calls[0][1],'2026-10-01');
 assert.equal(app.allocation.report.date,'2026-10-01');
});

test('complete, held, unknown-installation and unsupported groups remain visible without event percentages',async()=>{
 const {app}=await ready();app.handleAction('store-allocation');await app.runAllocation();
 const html=app.mount.innerHTML;
 for(const text of ['設定4以上','2 / 2台','全体推定を保留','台番201のGが不明','設置台数未確認','未対応&lt;機種&gt;','90%区間','仮定変更の範囲','未校正','全台','半分以上','1/3以上','未稼働'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/成立確率|90\.0%|強い候補|認定|確定|modelPass|roster_unverified/);
 assert.match(html,/比較する仮説数[^<]*27/);
});

test('sorting, band and machine filters preserve full family size and ordinary q',async()=>{
 const value=report(),before=plain(value),calls=[],{app}=await ready({getAllocation:async(...args)=>{calls.push(args);return value}});
 app.handleAction('store-allocation');await app.runAllocation();
 change(app,'data-allocation-sort','name');change(app,'data-allocation-filter','my');change(app,'data-allocation-band','6');
 assert.equal(calls.length,1);assert.equal(app.allocation.report.familySize,27);assert.deepEqual(plain(value),before);
 assert.match(app.mount.innerHTML,/設定6/);assert.match(app.mount.innerHTML,/比較する仮説数[^<]*27/);
 assert.doesNotMatch(app.mount.innerHTML,/data-allocation-machine="go"/);
});

test('date changes abort pending work and stale success cannot restore previous results',async()=>{
 const first=deferred(),calls=[],{app}=await ready({getAllocation:(...args)=>{calls.push(args);return calls.length===1?first.promise:Promise.resolve(report(args[1]))}});
 app.handleAction('store-allocation');const pending=app.runAllocation();await flush();
 change(app,'data-store-date','2026-10-15');assert.equal(calls[0][2].signal.aborted,true);assert.equal(app.allocation.report,null);
 await app.runAllocation();first.resolve(report());await pending;
 assert.equal(app.allocation.report.date,'2026-10-15');assert.doesNotMatch(app.mount.innerHTML,/2026-10-16T/);
});

test('a response for a different exact day is refused and canonical failures never fall back locally',async()=>{
 const {app}=await ready({getAllocation:async()=>report('2026-10-15')});app.handleAction('store-allocation');await app.runAllocation();
 assert.equal(app.allocation.report,null);assert.match(app.mount.innerHTML,/営業日|一致/);
 app.allocation.error='';app.state.storeDate='2026-10-15';app.bridge().getStoreDay=()=>{throw Error('no fallback')};
 app.allocation.report=report();app.invalidateAllocation();assert.equal(app.allocation.report,null);
});

test('detail separates ordinary q from conditional q and submits exact and at-least counts explicitly',async()=>{
 const calls=[],base=report(),before=plain(base),{app}=await ready({getAllocation:async(...args)=>{calls.push(args);const options=args[2];return options.detail?withDetail(base,options.machine,options.kind,options.count,options.band):base}});
 app.handleAction('store-allocation');await app.runAllocation();await app.openAllocationMachine('my');
 assert.match(app.mount.innerHTML,/台数分布|通常の各台判別|仮説を仮定した配分|通常配分との比較|低設定中心|中間中心|一部高設定/);
 change(app,'data-allocation-kind','exact');change(app,'data-allocation-count','1');await flush();
 assert.equal(calls.at(-1)[2].kind,'exact');assert.equal(calls.at(-1)[2].count,1);assert.equal(calls.at(-1)[2].detail,true);
 assert.match(app.mount.innerHTML,/ちょうど1台/);assert.match(app.mount.innerHTML,/固定台数の慎重比較は対象外/);
 change(app,'data-allocation-kind','atLeast');await flush();assert.equal(calls.at(-1)[2].kind,'atLeast');
 assert.match(app.mount.innerHTML,/1台以上/);assert.deepEqual(plain(base),before);assert.deepEqual(plain(app.allocation.report.groups[0].rows[0].individual.q),q);
});

test('new group selection, back navigation and data refresh invalidate obsolete detail requests',async()=>{
 const detail=deferred(),calls=[],{app}=await ready({getAllocation:(...args)=>{calls.push(args);return args[2].detail?detail.promise:Promise.resolve(report())}});
 app.handleAction('store-allocation');await app.runAllocation();const pending=app.openAllocationMachine('my');await flush();
 await app.openAllocationMachine('go');assert.equal(calls[1][2].signal.aborted,true);
 detail.resolve(withDetail(report()));await pending;assert.equal(app.allocation.machine,'go');assert.equal(app.allocation.detail,null);
 app.navigate('store');assert.equal(app.allocation.loading,false);
 app.handleAction('store-allocation');app._boundAllocationUpdate();assert.equal(app.allocation.report,null);
});

test('server messages, store and machine names are escaped and allocation state is never saved',async()=>{
 const data=report();data.groups[0].machineName='<img src=x onerror=alert(1)>';data.groups[1].reasons=[{message:'<script>bad()</script>'}];
 const {app,storage}=await ready({getAllocation:async()=>data});app.handleAction('store-allocation');await app.runAllocation();app.persist();
 assert.match(app.mount.innerHTML,/&lt;img/);assert.match(app.mount.innerHTML,/&lt;script&gt;/);assert.doesNotMatch(app.mount.innerHTML,/<img src=x|<script>bad/);
 const saved=JSON.parse(storage.getItem('jugest:v510:ui'));assert.equal('allocation'in saved,false);assert.doesNotMatch(JSON.stringify(saved),/input-a|conditionalQ|familySize/);
});

test('VPS patched app retains allocation entry, exact-day transport and legacy build anchors',async()=>{
 const {app}=await ready({patched:true});app.handleAction('store-allocation');await app.runAllocation();
 assert.match(app.mount.innerHTML,/投入分析|未校正/);assert.equal(app.allocation.report.familySize,27);
 const html=fs.readFileSync('index.html','utf8'),build=fs.readFileSync('build.mjs','utf8');
 assert.match(html,/<script src="\.\/store-day-allocation-view\.js"><\/script>/);assert.match(build,/'store-day-allocation-view\.js'/);assert.match(build,/'vps-browser-analytics\.mjs'/);
});

test('VPS store v2 retains the allocation entry next to daily machine data',()=>{
 assert.match(storeV2.nav('data'),/data-action="store-data"[\s\S]*data-action="store-allocation"[\s\S]*data-action="store-trend"/);
});

test('switching exact zero to at-least clamps the count to one before requesting detail',async()=>{
 const calls=[],base=report(),{app}=await ready({getAllocation:async(shop,date,options)=>{calls.push(options);return options.detail?withDetail(base,options.machine,options.kind,options.count,options.band):base}});
 app.handleAction('store-allocation');await app.runAllocation();await app.openAllocationMachine('my');
 change(app,'data-allocation-kind','exact');await flush();change(app,'data-allocation-count','0');await flush();assert.equal(calls.at(-1).count,0);
 change(app,'data-allocation-kind','atLeast');await flush();assert.equal(calls.at(-1).count,1);
 assert.doesNotMatch(app.mount.innerHTML,/<option value="0"[^>]*>0台<\/option>/);
});

test('the real allocation engine event array renders thresholds and selects a valid detail count',async()=>{
 const base=report(),group=base.groups[0],rows=group.rows.map(row=>({...row,bonusLogs:[-5,-4,-3,-2,-1,0]})),calls=[];
 group.result=globalThis.JUGESTStoreDayAllocation.analyzeMachine({rows,familySize:27});assert.equal(group.result.ok,true);
 assert.ok(Array.isArray(group.result.bands[0].events));
 const {app}=await ready({getAllocation:async(shop,date,options)=>{calls.push(options);const value=structuredClone(base);if(options.detail)value.groups[0].result=globalThis.JUGESTStoreDayAllocation.analyzeMachine({rows,familySize:27,detail:options});return value}});
 app.handleAction('store-allocation');await app.runAllocation();assert.match(app.mount.innerHTML,/2台以上/);assert.doesNotMatch(app.mount.innerHTML,/—台以上/);
 await app.openAllocationMachine('my');assert.equal(calls.at(-1).count,1);assert.ok(app.allocation.detail);
 assert.match(app.mount.innerHTML,/低設定中心|中間中心|一部高設定/);
 for(const block of app.mount.innerHTML.matchAll(/<details class="allocation-baseline">[\s\S]*?<\/details>/g))assert.doesNotMatch(block[0],/未算出/);
 assert.match(app.mount.innerHTML,/設定4以上の投入台数0〜2台を同じ重み/);assert.match(app.mount.innerHTML,/設定1〜3の重み/);assert.match(app.mount.innerHTML,/設定1〜6の重み/);
});

test('held row details explain missing observed fields without converting them to zero',async()=>{
 const base=report(),group=base.groups[1];group.reasons=['missing_games'];group.rows=[{id:'go:201',tableNo:'201',input:{games:null,bb:2,rb:null,diff:null},eligible:false,reasons:['missing_games','missing_rb']}];
 const {app}=await ready({getAllocation:async()=>base});app.handleAction('store-allocation');await app.runAllocation();await app.openAllocationMachine('go');
 assert.match(app.mount.innerHTML,/通常Gが欠けて/);assert.match(app.mount.innerHTML,/RBが欠けて/);assert.match(app.mount.innerHTML,/実測 —G/);assert.doesNotMatch(app.mount.innerHTML,/実測 0G/);
});

async function realClientApp(fetchFn){
 const runtime=await boot({loadApp:false});
 vm.runInContext(fs.readFileSync(viewFile,'utf8'),runtime.ctx,{filename:path.resolve(viewFile)});
 vm.runInContext(fs.readFileSync('app-v510.js','utf8'),runtime.ctx,{filename:path.resolve('app-v510.js'),importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
 runtime.app=new (runtime.ctx.customElements.get('jugest-app'))();runtime.app.state.activeStore='テスト店';runtime.app.state.storeDate='2026-10-16';
 runtime.ctx.JUGEST_CORE_BRIDGE={...runtime.bridge,getStoreDates:()=>['2026-10-16','2026-10-15']};
 const originalFetch=globalThis.fetch;globalThis.fetch=fetchFn;
 return {...runtime,restore(){globalThis.fetch=originalFetch}};
}
const jsonResponse=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});

test('default allocation transport uses the real cookie-only client without requiring Receiver credentials',async()=>{
 const calls=[],runtime=await realClientApp(async(url,options)=>{calls.push({url,options});return jsonResponse(url.endsWith('/stores')?{ok:true,stores:[{id:'s1',name:'テスト店'}]}:report())});
 try{
  runtime.app.handleAction('store-allocation');await runtime.app.runAllocation();
  assert.equal(calls.length,2,'store resolution and exact-day allocation read use the signed-in cookie transport');assert.equal(calls[0].url,'/api/vps/allocation/stores');
  for(const {options} of calls){assert.equal(options.credentials,'same-origin');assert.equal(options.headers.authorization,undefined);assert.ok(options.signal)}
  assert.match(calls[1].url,/\/stores\/s1\/days\/2026-10-16\/allocation$/);assert.ok(runtime.app.allocation.report);
 }finally{runtime.restore()}
});

test('the real allocation client propagates cancellation and never displays an aborted date',async()=>{
 const calls=[],started=deferred(),runtime=await realClientApp(async(url,options)=>{
  calls.push({url,options});if(url.endsWith('/stores'))return jsonResponse({ok:true,stores:[{id:'s1',name:'テスト店'}]});
  if(url.includes('2026-10-16')){started.resolve();return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true}))}
  return jsonResponse(report('2026-10-15'));
 });
 try{
  runtime.app.handleAction('store-allocation');const pending=runtime.app.runAllocation();
  await Promise.race([started.promise,new Promise(resolve=>setTimeout(resolve,1000))]);assert.equal(calls.length,2);
  change(runtime.app,'data-store-date','2026-10-15');await pending;assert.equal(calls[1].options.signal.aborted,true);assert.equal(runtime.app.allocation.error,'');
  await runtime.app.runAllocation();assert.equal(runtime.app.allocation.report.date,'2026-10-15');
 }finally{runtime.restore()}
});

test('read-only viewers are told when an owner or administrator has not saved this analysis',async()=>{
 const {app,ctx}=await ready({getAllocation:async()=>{throw Object.assign(new Error('not ready'),{code:'allocation_result_not_ready',status:409})}});
 app.handleAction('store-allocation');await app.runAllocation();assert.match(app.mount.innerHTML,/所有者または管理者の分析結果をまだ保存していません/);
 app.allocation.report=report();ctx.JUGEST_VPS_ANALYTICS_CLIENT={getAllocation:async()=>{throw Object.assign(new Error('not ready'),{code:'allocation_result_not_ready',status:409})}};
 await app.openAllocationMachine('my');assert.match(app.mount.innerHTML,/計算後に再度開いてください/);
});

test('difference-inclusive reference remains separate from primary bonus results with its actual coverage and fallback',async()=>{
 const base=report(),group=base.groups[0],rows=group.rows.map(row=>({...row,bonusLogs:[0,-1,-2,-3,-4,-5]}));
 const reference=globalThis.JUGESTStoreDayAllocation.analyzeMachine({rows,familySize:27});
 group.differenceReference={available:true,diffN:1,reverseDiffN:1,warningN:1,methodCounts:{'reverse-diff':1,'bonus-only':1},result:{...reference,approximate:true,primary:false}};
 const before=plain(base),{app}=await ready({getAllocation:async(shop,date,options)=>options.detail?withDetail(base,options.machine,options.kind,options.count,options.band):base});
 app.handleAction('store-allocation');await app.runAllocation();assert.match(app.mount.innerHTML,/差枚込み参考あり/);assert.doesNotMatch(app.mount.innerHTML,/差枚込みの推定台数/);
 await app.openAllocationMachine('my');
 assert.match(app.mount.innerHTML,/主計算：ボーナス/);assert.match(app.mount.innerHTML,/差枚込み：近似参考/);assert.match(app.mount.innerHTML,/差枚確認 1 \/ 2台/);assert.match(app.mount.innerHTML,/逆算使用 1台/);assert.match(app.mount.innerHTML,/ボーナスのみ 1台/);assert.match(app.mount.innerHTML,/注意あり 1台/);
 const panel=app.mount.innerHTML.match(/<section[^>]*data-allocation-difference>[\s\S]*?<\/section>/)?.[0];assert.ok(panel);assert.doesNotMatch(panel,/慎重比較|モデル内の比較基準|認定/);assert.match(panel,/足し合わせ/);
 assert.deepEqual(plain(base),before);
});

test('unsupported rows retain uncertain business-day reasons even when all supported groups are complete',async()=>{
 const data=report();data.groups=data.groups.slice(0,1);data.quality.status='partial';data.unsupported[0].reasons=['pia_day_ambiguous'];
 const {app}=await ready({getAllocation:async()=>data});app.handleAction('store-allocation');await app.runAllocation();
 assert.match(app.mount.innerHTML,/店舗全体は一部未確認/);assert.match(app.mount.innerHTML,/日別履歴から営業日を一意に特定できません/);
});

test('real neutral results from 1 to 120 machines never become UI candidates from numerical noise',async()=>{
 const {ctx}=await ready();
 for(const n of [1,2,3,24,58,60,120]){
  const rows=Array.from({length:n},(_,i)=>({id:String(i),tableNo:String(i),machine:'my',input:{games:0,bb:0,rb:0,diff:0},bonusLogs:[0,0,0,0,0,0],individual:{q:[1/6,1/6,1/6,1/6,1/6,1/6]}}));
  const result=globalThis.JUGESTStoreDayAllocation.analyzeMachine({rows,familySize:27,includeSensitivity:false});assert.equal(result.ok,true);
  const data=report();data.groups=[{...data.groups[0],nInstalled:n,nObserved:n,zeroGamesN:n,rows,result}];data.unsupported=[];
  const zero=ctx.JUGESTStoreDayAllocationView.renderReport(data);assert.match(zero,/全台0Gのため情報不足/,`${n} neutral machines`);assert.doesNotMatch(zero,/<dd>比較上の候補/);
  data.groups[0].zeroGamesN=0;const neutral=ctx.JUGESTStoreDayAllocationView.renderReport(data);assert.match(neutral,/同程度・情報不足/);assert.doesNotMatch(neutral,/<dd>比較上の候補/,`${n} neutral log likelihoods`);
 }
});

test('non-integer difference warnings explain the bonus-only fallback without hiding an otherwise eligible row',async()=>{
 const data=report();data.groups[0].rows[0].warnings=['diff_not_safe_integer'];data.groups[0].rows[0].diffIssue='diff_not_safe_integer';
 const {app}=await ready({getAllocation:async(shop,date,options)=>options.detail?withDetail(data,options.machine,options.kind,options.count,options.band):data});
 app.handleAction('store-allocation');await app.runAllocation();await app.openAllocationMachine('my');
 assert.match(app.mount.innerHTML,/差枚が整数として確認できないため、差枚なしで計算しました/);assert.match(app.mount.innerHTML,/台番 101/);
});

test('fixed assumptions that reverse real evidence are explicit in principal cards and selected exact detail',async()=>{
 const base=report(),row={...base.groups[0].rows[0],bonusLogs:[0,0,1,.5,.5,.5]},rows=[row];
 const group=base.groups[0];Object.assign(group,{nInstalled:1,nObserved:1,zeroGamesN:0,rows,result:globalThis.JUGESTStoreDayAllocation.analyzeMachine({rows,familySize:27})});
 const before=plain(base),calls=[],{app}=await ready({getAllocation:async(shop,date,options)=>{
  calls.push(options);const value=structuredClone(base);if(options.detail)value.groups[0].result=globalThis.JUGESTStoreDayAllocation.analyzeMachine({rows,familySize:27,detail:options});return value;
 }});
 app.handleAction('store-allocation');await app.runAllocation();
 assert.match(app.mount.innerHTML,/<dt>全台<\/dt><dd>仮定によって変わる<\/dd>/);assert.match(app.mount.innerHTML,/0\.75倍〜1\.41倍/);
 await app.openAllocationMachine('my');change(app,'data-allocation-kind','exact');await flush();
 const detail=app.mount.innerHTML.match(/<div[^>]*data-allocation-selected-sensitivity>[\s\S]*?<\/div>/)?.[0];
 assert.ok(detail,'selected exact count has its own sensitivity comparison');assert.match(detail,/仮定によって変わる/);assert.match(detail,/0\.75倍〜1\.41倍/);assert.match(detail,/9通り/);
 assert.doesNotMatch(detail,/慎重比較|認定|shared4-flat|independent-flat/);
 change(app,'data-allocation-count','0');await flush();assert.equal(calls.at(-1).count,0);assert.match(app.mount.innerHTML,/ちょうど0台/);assert.match(app.mount.innerHTML,/仮定によって変わる/);
 assert.equal(app.allocation.report.familySize,27);assert.deepEqual(plain(base),before);
});

test('neutral fixed-prior diagnostics do not turn rounding noise into assumption-direction changes',async()=>{
 const {ctx}=await ready(),base=report(),rows=base.groups[0].rows.map(row=>({...row,bonusLogs:[0,0,0,0,0,0]}));
 base.groups[0].result=globalThis.JUGESTStoreDayAllocation.analyzeMachine({rows,familySize:27});
 const html=ctx.JUGESTStoreDayAllocationView.renderReport(base);assert.match(html,/同程度・情報不足/);assert.doesNotMatch(html,/<dd>仮定によって変わる/);
});
