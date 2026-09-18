import test from 'node:test';
import assert from 'node:assert/strict';
import {judgeJugglerMachine,judgeJugglerMachines,JUGGLER_MACHINE_KEYS} from '../src/juggler-judge.mjs';

const EPS=1e-12;
function close(actual,expected,label){assert.ok(Math.abs(actual-expected)<=EPS,`${label}: expected ${expected}, got ${actual}`)}
function closeArray(actual,expected,label){assert.equal(actual.length,expected.length,label);actual.forEach((v,i)=>close(v,expected[i],`${label}[${i}]`))}

const VECTORS=[
  {machine:'my',games:5230,bb:24,rb:18,diff:600,q:[0.341755389520775,0.229213671813443,0.16081491773064,0.147291020220524,0.111169602492077,0.009755398222541],expectedSetting:2.4861719690173065,p4:0.26821602093514146,method:'reverse-diff'},
  {machine:'im',games:4200,bb:14,rb:18,diff:-200,q:[0.027877530618624,0.058797119167134,0.19648818847346,0.231702363000721,0.446396733652679,0.038738065087381],expectedSetting:4.126157845163839,p4:0.7168371617407815,method:'reverse-diff'},
  {machine:'go',games:6000,bb:27,rb:25,diff:1000,q:[0.181277603998734,0.214248047810093,0.246620422059415,0.204800770955536,0.11204071309616,0.041012442080062],expectedSetting:2.975116267580481,p4:0.35785392613175815,method:'reverse-diff'},
  {machine:'fk',games:4800,bb:19,rb:15,diff:null,q:[0.107268119425652,0.145468594731549,0.191820660601376,0.218410645400084,0.206163593153777,0.130868386687562],expectedSetting:3.6633381581874715,p4:0.5554426252414231,method:'bonus-only'},
  {machine:'hp',games:5100,bb:20,rb:22,diff:350,q:[0.133025533543068,0.228203169960554,0.327186960908322,0.115737044294475,0.109149385961649,0.086697905331932],expectedSetting:3.09987529516688,p4:0.31158433558805665,method:'reverse-diff'},
  {machine:'gg',games:3900,bb:17,rb:13,diff:-50,q:[0.171289167545926,0.211306752364242,0.261378593925277,0.272952267164012,0.059993378405057,0.023079840595485],expectedSetting:2.908293458304489,p4:0.35602548616455465,method:'reverse-diff'},
  {machine:'mr',games:7000,bb:31,rb:30,diff:1400,q:[0.116774268855429,0.136875522032497,0.164387076769052,0.266604423374182,0.211621467107271,0.10373724186157],expectedSetting:3.630635023430077,p4:0.5819631323430222,method:'reverse-diff'},
  {machine:'um',games:3500,bb:12,rb:16,diff:-500,q:[0.071428983138818,0.105614599378336,0.252316109562255,0.35262592813069,0.162453788623572,0.055560591166328],expectedSetting:3.5957427132208455,p4:0.5706403079205903,method:'reverse-diff'}
];

test('server judge preserves current externalJudge reference vectors for all 8 Juggler machines',()=>{
  assert.deepEqual(JUGGLER_MACHINE_KEYS,['my','im','go','fk','hp','gg','mr','um']);
  for(const v of VECTORS){
    const r=judgeJugglerMachine(v);
    assert.equal(r.machine,v.machine);
    assert.equal(r.method,v.method);
    closeArray(r.q,v.q,`${v.machine} q`);
    close(r.expectedSetting,v.expectedSetting,`${v.machine} expectedSetting`);
    close(r.p4,v.p4,`${v.machine} p4`);
    close(r.p5,r.q[4]+r.q[5],`${v.machine} p5`);
    close(r.p6,r.q[5],`${v.machine} p6`);
  }
});

test('batch judge is pure current-data judgement and preserves caller identity fields',()=>{
  const input=VECTORS.slice(0,2).map((v,i)=>({...v,tableNo:String(101+i),label:`row-${i+1}`}));
  const out=judgeJugglerMachines(input);
  assert.equal(out.length,2);
  assert.equal(out[0].tableNo,'101');
  assert.equal(out[0].label,'row-1');
  assert.equal(out[1].tableNo,'102');
  closeArray(out[0].q,VECTORS[0].q,'batch my q');
  closeArray(out[1].q,VECTORS[1].q,'batch im q');
});

test('invalid live inputs fail closed instead of fabricating a judgement',()=>{
  assert.throws(()=>judgeJugglerMachine({machine:'unknown',games:1000,bb:5,rb:4}),/unsupported_machine/);
  assert.throws(()=>judgeJugglerMachine({machine:'my',games:0,bb:0,rb:0}),/invalid_games/);
  assert.throws(()=>judgeJugglerMachine({machine:'my',games:100,bb:80,rb:30}),/bonus_count_exceeds_games/);
});
