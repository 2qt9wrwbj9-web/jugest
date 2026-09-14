import test from 'node:test';
import assert from 'node:assert/strict';
import {searchModels,__test} from '../src/research/model-search.mjs';

function axis(id,{lift,contrast,support,pValue,foldPassRate,robustness,field}){
  return {
    id,
    predicates:[{field,op:'gte',value:1}],
    lift,contrast,support,pValue,foldPassRate,robustness,
    fdrAccepted:true
  };
}

function sample(machineKey,{a=0,b=0,outcomeScore=0}={}){
  return {machineKey,targetDate:'2026-09-01',outcomeScore,features:{hist_a:a,hist_b:b}};
}

test('axis strength rewards stable evidence and penalizes noisy small-sample evidence',()=>{
  const stable=axis('stable',{lift:.18,contrast:.22,support:180,pValue:.001,foldPassRate:1,robustness:1,field:'hist_a'});
  const noisy=axis('noisy',{lift:.45,contrast:.50,support:20,pValue:.04,foldPassRate:.75,robustness:.5,field:'hist_b'});
  assert.equal(typeof __test.axisStrength,'function');
  assert.ok(__test.axisStrength(stable)>__test.axisStrength(noisy));
});

test('pair candidate search includes a strength-aware weighting without increasing pair candidate count',()=>{
  const strong=axis('strong',{lift:.30,contrast:.35,support:200,pValue:.001,foldPassRate:1,robustness:1,field:'hist_a'});
  const weak=axis('weak',{lift:.05,contrast:.06,support:20,pValue:.04,foldPassRate:.75,robustness:.5,field:'hist_b'});
  const rows=[
    sample('m1',{a:1,b:1,outcomeScore:4}),
    sample('m2',{a:1,b:0,outcomeScore:3}),
    sample('m3',{a:0,b:1,outcomeScore:2}),
    sample('m4',{a:0,b:0,outcomeScore:1})
  ];
  const result=searchModels({axes:[strong,weak],train:rows,validation:rows,maxCandidates:16});
  const pairs=result.candidates.map(row=>row.model).filter(model=>model.axes.length===2);
  assert.equal(pairs.length,3,'strength-aware search should keep the existing three-candidate budget per pair');
  const strongWeights=pairs.map(model=>model.axes.find(item=>item.id==='strong')?.weight??0);
  assert.ok(Math.max(...strongWeights)>.75,'stable stronger evidence should be able to receive more than the old fixed 2:1 ceiling');
});

test('equal-strength axes preserve the balanced plus two directional exploration plans',()=>{
  const left=axis('left',{lift:.20,contrast:.25,support:100,pValue:.005,foldPassRate:1,robustness:1,field:'hist_a'});
  const right=axis('right',{lift:.20,contrast:.25,support:100,pValue:.005,foldPassRate:1,robustness:1,field:'hist_b'});
  const rows=[
    sample('m1',{a:1,b:1,outcomeScore:4}),
    sample('m2',{a:1,b:0,outcomeScore:3}),
    sample('m3',{a:0,b:1,outcomeScore:2}),
    sample('m4',{a:0,b:0,outcomeScore:1})
  ];
  const result=searchModels({axes:[left,right],train:rows,validation:rows,maxCandidates:16});
  const pairs=result.candidates.map(row=>row.model).filter(model=>model.axes.length===2);
  const leftWeights=pairs.map(model=>Number(model.axes.find(item=>item.id==='left')?.weight.toFixed(3))).sort((a,b)=>a-b);
  assert.deepEqual(leftWeights,[.333,.5,.667]);
});
