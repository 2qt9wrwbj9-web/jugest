import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const html=fs.readFileSync('./index.html','utf8');
const pub=fs.readFileSync('./public/index.html','utf8');
assert.equal(html,pub,'root/public index must be byte-identical');
assert.match(html,/ジャグラー設定判別 v4\.7\.9/);
assert.match(html,/function v4HybridWalkForwardWeights\(/);
assert.match(html,/v4HybridOptimizeSamples\(samples,\{step:\.05\}\)/);
assert.match(html,/holdout guard/);
assert.match(html,/sourceDays!==externalDays\|\|dates\.length<70/);
assert.match(html,/hybridOptimization:pred\.ranking\.hybridOptimization\|\|null/);
const scriptMatch=html.match(/<script>([\s\S]*?)<\/script>/i);assert.ok(scriptMatch);
let code=scriptMatch[1],cut=code.indexOf('let didRestore=restoreSavedState();');assert.ok(cut>0);code=code.slice(0,cut)+`globalThis.__V4=window.V4_TEST;\n})();`;
function fakeElement(){const b={value:'',checked:false,innerHTML:'',textContent:'',className:'',style:{},dataset:{},files:[],disabled:false,classList:{add(){},remove(){},toggle(){},contains(){return false}},appendChild(){},append(){},remove(){},click(){},focus(){},scrollIntoView(){},setAttribute(){},removeAttribute(){},addEventListener(){},removeEventListener(){},querySelectorAll(){return[]},querySelector(){return fakeElement()},closest(){return fakeElement()}};return new Proxy(b,{get(t,p){if(p in t)return t[p];if(p==='length')return 0},set(t,p,v){t[p]=v;return true}})}
const elems=new Map(),document={getElementById(id){if(!elems.has(id))elems.set(id,fakeElement());return elems.get(id)},querySelectorAll(){return[]},querySelector(){return fakeElement()},createElement(){return fakeElement()},body:fakeElement(),addEventListener(){},removeEventListener(){}};
const URLClass=URL;URLClass.createObjectURL=()=> 'blob:x';URLClass.revokeObjectURL=()=>{};const sandbox={console,document,window:null,location:{protocol:'https:',origin:'https://example.netlify.app',reload(){}},localStorage:{setItem(){},getItem(){return null},removeItem(){}},indexedDB:undefined,confirm(){return true},alert(){},prompt(){return null},navigator:{},Blob:function(){},URL:URLClass,FileReader:function(){},setTimeout,clearTimeout,Date,Math,JSON,Map,Set,Promise,Number,String,Array,Object,Infinity,NaN,parseInt,isFinite,crypto:globalThis.crypto,fetch:async()=>{throw new Error('no net')},performance:globalThis.performance};sandbox.window=sandbox;sandbox.window.addEventListener=()=>{};sandbox.window.removeEventListener=()=>{};vm.createContext(sandbox);vm.runInContext(code,sandbox,{timeout:20000});const V=sandbox.__V4;assert.ok(V?.hybridOptimizeSamples&&V?.hybridEvaluate&&V?.hybridGrid);
function day(prefer){const rows=[];for(let i=0;i<20;i++){let p=i===0?1:Math.max(0,.8-i*.03),m=i===19?1:i*.03,s=i*.04;let actualES=3,actualP4=.3;if(prefer==='practical'&&i<3){actualES=4.5;actualP4=.75}if(prefer==='model'&&i>16){actualES=4.5;actualP4=.75}rows.push({key:String(100-i),practicalSignal:p,modelSignal:m,strictSignal:s,hybridValidatedBonus:0,actualES,actualP4})}return{rows}}
const samples=Array.from({length:9},()=>day('practical'));const z=V.hybridOptimizeSamples(samples,{step:.05});assert.equal(z.mode,'walk-forward');assert.ok(z.weights.practical>.55,`practical weight should rise, got ${JSON.stringify(z.weights)}`);assert.ok(z.weights.practical>z.weights.model);const sum=z.weights.practical+z.weights.model+z.weights.strict;assert.ok(Math.abs(sum-1)<1e-9);
const tooFew=V.hybridOptimizeSamples(samples.slice(0,5),{step:.05});assert.equal(tooFew.mode,'fallback');assert.deepEqual(JSON.parse(JSON.stringify(tooFew.weights)),{practical:.55,model:.30,strict:.15});
console.log('PASS v4.7.8 walk-forward hybrid weight optimizer + holdout/fallback guards');
