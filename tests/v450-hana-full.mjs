import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const judgeSrc=fs.readFileSync(new URL('../hanahana-judge.js',import.meta.url),'utf8');
const ctx={console,globalThis:null,module:{exports:{}},Math,Number,String,Array,Object,JSON,Map,Set,Infinity,NaN};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(judgeSrc,ctx);
const H=ctx.module.exports;assert.equal(Object.keys(H.MACHINES).length,5);
for(const k of ['houou','king','dragon','star','newkingv']){
 const r=H.numericJudge(k,{G:7000,bb:28,rb:22,diff:500,style:'unknown'});assert.ok(r.metrics);assert.ok(Math.abs(r.q.reduce((a,b)=>a+b,0)-1)<1e-9);assert.ok(Number.isFinite(r.reverse?.inferredDenom));
}
const nk=H.liveJudge('newkingv',{G:3000,bb:12,rb:8,bell:410,bigGames:168,bigWater:8,bigMiss:0,sideCounts:[1,1,1,1,0],normalBigTrials:12,bigAfterCounts:[1,0,0,0,0],regAfterCounts:[0,0,0,1],retroTrials:5,retroHits:1,regGames:80,regWater:2});
assert.ok(nk.q[4]>.999999,'New King V purple REG-after must hard-constrain to V');
assert.ok(nk.q.slice(0,4).every(x=>x===0));
const kingBad=H.liveJudge('king',{G:1000,bb:2,rb:1,bell:140,sideCounts:[2,0,0,0,0]});
assert.ok(kingBad.factors.some(x=>x.id==='side'&&!x.used),'lamp count > REG must be excluded');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.ok(html.includes('ジャグラー・ハナハナ設定判別'));
assert.ok(html.includes('ジャグラー・ハナハナデータ'));
assert.ok(html.includes('genericCompareJudge'));
assert.ok(html.includes('v4MachineSupportQ'));
assert.ok(html.includes('window.HanaAppBridge'));
const ui=fs.readFileSync(new URL('../hanahana-ui.js',import.meta.url),'utf8');
assert.ok(ui.includes('beginFromRev'));
assert.ok(!/ハナハナ 実戦判別[\s\S]{0,1000}前任者の打ち方/.test(ui),'live UI must not show predecessor style');
assert.ok(ui.includes('設定変更後初回を別カウント'));
assert.ok(ui.includes('ジャグラー/ハナハナを跨いで'));
const launcher=fs.readFileSync(new URL('../ana-launcher.js',import.meta.url),'utf8');
assert.ok(launcher.includes("const PARSER_VERSION=4500"));
assert.ok(launcher.includes('未認識のハナハナ表記'));
assert.ok(launcher.includes('ACCESS_LIMIT=30'));
console.log('v4.5.3 full HANA: ok');
