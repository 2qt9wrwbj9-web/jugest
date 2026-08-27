import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../ana-launcher.js',import.meta.url),'utf8');
function fake(){return new Proxy({id:'',innerHTML:'',textContent:'',className:'',style:{},value:'auto',disabled:false,onclick:null,onchange:null,scrollTop:0,scrollHeight:0,classList:{add(){},remove(){},toggle(){},contains(){return false}},appendChild(){},addEventListener(){},removeEventListener(){},setAttribute(){},removeAttribute(){}},{get(t,p){if(p in t)return t[p];return undefined},set(t,p,v){t[p]=v;return true}})}
async function boot(sessions){
  const elems=new Map();let appended=false;
  const body=fake();body.appendChild=(el)=>{appended=true;if(el?.id)elems.set(el.id,el)};
  const document={title:'AnaSlo Test',body,documentElement:{outerHTML:'<html></html>'},querySelectorAll(){return[]},createElement(){return fake()},getElementById(id){if(id==='jugglerAnaRunner3160'&&!appended)return null;if(!appended)return null;if(!elems.has(id))elems.set(id,fake());return elems.get(id)},addEventListener(){},removeEventListener(){},execCommand(){return true}};
  const ls=new Map([['jugglerAnaProfile:v3:test-shop',JSON.stringify({sessions})]]);
  const URLX=URL;URLX.createObjectURL=()=> 'blob:test';URLX.revokeObjectURL=()=>{};
  const sandbox={console,document,window:null,location:{hostname:'ana-slo.com',pathname:'/2026-08-23-test-shop-data/',hash:'',href:'https://ana-slo.com/2026-08-23-test-shop-data/',origin:'https://ana-slo.com'},localStorage:{getItem(k){return ls.get(k)??null},setItem(k,v){ls.set(k,String(v))},removeItem(k){ls.delete(k)}},navigator:{},indexedDB:undefined,alert(){},confirm(){return true},performance,fetch:async()=>{throw new Error('not used')},TextDecoder,TextEncoder,atob,btoa,crypto:globalThis.crypto,URL:URLX,Blob,File:globalThis.File??class File{},setTimeout,clearTimeout,setInterval,clearInterval,Date,Math,JSON,Map,Set,Array,Object,Number,String,Promise,parseInt,isFinite};sandbox.window=sandbox;sandbox.window.opener=null;
  vm.createContext(sandbox);await vm.runInContext(code,sandbox,{timeout:10000});
  return {pace:String(elems.get('jacPace')?.textContent||''),profile:String(elems.get('jacProfile')?.innerHTML||'')};
}
const clean30={planned:30,success:30,failed:0,quality:'A',httpStatus:0,reason:'complete',avgFetchMs:700,avgMachines:60};
let x=await boot([clean30,clean30]);
if(!x.pace.includes('推奨40日'))throw new Error('two clean 30-day sessions should promote to 40: '+x.pace);
const clean40={...clean30,planned:40,success:40};
x=await boot([clean30,clean30,clean40,clean40]);
if(!x.pace.includes('推奨50日'))throw new Error('stable 40-day sessions should promote to 50: '+x.pace);
const blocked={planned:60,success:47,failed:1,quality:'A',httpStatus:403,reason:'blocked',avgFetchMs:800,avgMachines:60};
x=await boot([clean30,clean30,clean40,clean40,blocked]);
if(!x.pace.includes('推奨40日'))throw new Error('403 at 47/60 should shrink recommendation to 40: '+x.pace);
console.log('launcher policy: ok',x.pace);
