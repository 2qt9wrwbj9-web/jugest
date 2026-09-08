import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SELECTOR_CONFIG,FALLBACK_AXIS_WEIGHTS,generateCandidates,selectShadowEnsemble,shrinkSelectedWeights
} from '../research/axis-auto-selector/selector.mjs';

const axis=(id,{sourceId=id,approved=true,group=id,maxWeight=1}={})=>Object.freeze({
  id,sourceId,approved,correlationGroup:group,maxWeight,availability:'finite-source-value',sourceField:`${id}Signal`
});
const registry=(axes,caps={})=>Object.freeze({
  approved:()=>Object.freeze(axes.filter(x=>x.approved)),
  groupCap:id=>Object.hasOwn(caps,id)?caps[id]:null
});

function day(index,{mode='good',missingModel=false}={}){
  const target=`2026-05-${String(index+1).padStart(2,'0')}`;
  const cutoff=index===0?'2026-04-30':`2026-05-${String(index).padStart(2,'0')}`;
  const rows=Array.from({length:12},(_,i)=>{
    const practical=.55+(11-i)*.005;
    const model=i/11;
    const strict=i/11;
    const actualGood=1+(11-i)*.45;
    const actualBad=1+i*.45;
    const good=mode==='good';
    return{
      key:`台${i+1}`,
      controlRank:good?12-i:i+1,
      controlScore:good?model:practical,
      fixedBonus:0,
      axes:{
        'practical-v1':practical,
        'model-v1':missingModel&&i%2===0?null:model,
        'strict-v1':strict,
        'calendar-v1':1
      },
      actualES:good?actualGood:actualBad,
      actualP4:good?.05+(11-i)*.08:.05+i*.08
    };
  });
  return{targetDate:target,trainingCutoff:cutoff,sourceSignature:`s-${index}`,rows};
}

const axes=[
  axis('practical-v1'),axis('model-v1'),axis('strict-v1'),
  axis('calendar-v1',{approved:false})
];

test('default selector config is conservative, frozen, and fallback is 55/30/15',()=>{
  assert.ok(Object.isFrozen(DEFAULT_SELECTOR_CONFIG));
  assert.ok(Object.isFrozen(DEFAULT_SELECTOR_CONFIG.split));
  assert.deepEqual(FALLBACK_AXIS_WEIGHTS,{
    'practical-v1':.55,'model-v1':.30,'strict-v1':.15
  });
  assert.equal(DEFAULT_SELECTOR_CONFIG.maxActiveAxes,4);
  assert.equal(DEFAULT_SELECTOR_CONFIG.weightStep,.10);
  assert.equal(DEFAULT_SELECTOR_CONFIG.maxCandidateEnsembles,25000);
});

test('candidate generation uses only approved, available, source-distinct axes',()=>{
  const alias=axis('practical-alias-v1',{sourceId:'practical-v1'});
  const r=registry([...axes,alias]);
  const candidates=generateCandidates({
    registry:r,
    availability:{'practical-v1':1,'model-v1':1,'strict-v1':.79,'practical-alias-v1':1},
    config:DEFAULT_SELECTOR_CONFIG
  });
  assert.ok(candidates.length>0);
  assert.ok(candidates.every(c=>!c.axisIds.includes('calendar-v1')));
  assert.ok(candidates.every(c=>!c.axisIds.includes('strict-v1')));
  assert.ok(candidates.every(c=>!c.axisIds.includes('practical-alias-v1')));
  assert.ok(candidates.every(c=>c.axisIds.length<=4));
  assert.ok(candidates.every(c=>Math.abs(Object.values(c.weights).reduce((a,b)=>a+b,0)-1)<1e-12));
});

test('candidate generation enforces per-axis and correlation-group caps',()=>{
  const r=registry([
    axis('a',{group:'shared',maxWeight:.7}),
    axis('b',{group:'shared',maxWeight:.7}),
    axis('c',{group:'c'})
  ],{shared:.8});
  const candidates=generateCandidates({registry:r,availability:{a:1,b:1,c:1},config:DEFAULT_SELECTOR_CONFIG});
  assert.ok(candidates.length>0);
  for(const c of candidates){
    assert.ok((c.weights.a??0)<=.7+1e-12);
    assert.ok((c.weights.b??0)<=.7+1e-12);
    assert.ok((c.weights.a??0)+(c.weights.b??0)<=.8+1e-12);
  }
});

test('candidate limit is rejected during generation before any period scoring',()=>{
  const many=Array.from({length:12},(_,i)=>axis(`x${i+1}`));
  assert.throws(()=>generateCandidates({
    registry:registry(many),
    availability:Object.fromEntries(many.map(a=>[a.id,1])),
    config:{...DEFAULT_SELECTOR_CONFIG,maxCandidateEnsembles:100}
  }),/candidate.*limit|25000|100/i);
});

test('shrinkage happens after selection and moves raw weights toward fallback without adding axes',()=>{
  const raw={'practical-v1':.8,'model-v1':.2};
  const out=shrinkSelectedWeights(raw,{sampleCount:12,advantage:.02});
  assert.deepEqual(Object.keys(out.weights),Object.keys(raw));
  assert.ok(out.shrink>0&&out.shrink<1);
  const target=.55/(.55+.30);
  assert.ok(Math.abs(out.weights['practical-v1']-target)<Math.abs(.8-target));
  assert.ok(Math.abs(Object.values(out.weights).reduce((a,b)=>a+b,0)-1)<1e-12);
});

test('selector adopts a clearly superior candidate only after train, validation and one holdout evaluation',()=>{
  const samples=Array.from({length:24},(_,i)=>day(i,{mode:'good'}));
  const out=selectShadowEnsemble({samples,registry:registry(axes)});
  assert.equal(out.decision,'shadow_champion');
  assert.equal(out.holdoutEvaluations,1);
  assert.ok(out.candidateCount>0);
  assert.ok(out.selectedAxisIds.includes('practical-v1'));
  assert.ok(!out.selectedAxisIds.includes('calendar-v1'));
  assert.ok(out.validation.candidate.score>=out.validation.control.score+DEFAULT_SELECTOR_CONFIG.validationMinAdvantage-1e-12);
  assert.ok(out.validation.candidate.score>=out.validation.fallback.score+DEFAULT_SELECTOR_CONFIG.validationMinAdvantage-1e-12);
});

test('validation gate retains control when current point-in-time ranking is already stronger',()=>{
  const samples=Array.from({length:24},(_,i)=>day(i,{mode:'good'}));
  for(const sample of samples){
    sample.rows.forEach((row,i)=>{row.controlRank=i+1;row.controlScore=1-i/11;});
  }
  const out=selectShadowEnsemble({samples,registry:registry(axes)});
  assert.equal(out.decision,'control');
  assert.equal(out.reason,'validation_gate');
  assert.equal(out.holdoutEvaluations,0);
});

test('holdout failure evaluates only the train/validation winner once and never tries a runner-up',()=>{
  const samples=Array.from({length:24},(_,i)=>day(i,{mode:i<18?'good':'bad'}));
  const out=selectShadowEnsemble({samples,registry:registry(axes)});
  assert.equal(out.decision,'control');
  assert.equal(out.reason,'holdout_gate');
  assert.equal(out.holdoutEvaluations,1);
});

test('axis availability is computed from training history only',()=>{
  const samples=Array.from({length:24},(_,i)=>day(i,{mode:'good',missingModel:i<12}));
  for(let i=12;i<24;i++)for(const row of samples[i].rows)row.axes['model-v1']=.9;
  const out=selectShadowEnsemble({samples,registry:registry(axes)});
  assert.ok(out.availability['model-v1']<.8);
  assert.ok(!out.eligibleAxisIds.includes('model-v1'));
});

test('insufficient history abstains before search or holdout',()=>{
  const out=selectShadowEnsemble({samples:Array.from({length:23},(_,i)=>day(i)),registry:registry(axes)});
  assert.equal(out.decision,'control');
  assert.equal(out.reason,'insufficient_history');
  assert.equal(out.candidateCount,0);
  assert.equal(out.holdoutEvaluations,0);
});
