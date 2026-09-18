import test from 'node:test';
import assert from 'node:assert/strict';
import {JUGGLER_MACHINE_KEYS,judgeJugglerExternal} from '../src/judge/juggler-external-judge.mjs';

const close=(actual,expected,eps=1e-11)=>assert.ok(Math.abs(actual-expected)<=eps,`expected ${expected}, got ${actual}`);
const closeArray=(actual,expected,eps=1e-11)=>{
  assert.equal(actual.length,expected.length);
  actual.forEach((value,index)=>close(value,expected[index],eps));
};

const vectors=[
  {
    input:{machine:'my',games:5230,bb:24,rb:18,diff:1200},
    method:'reverse-diff',
    q:[0.10460673139622202,0.1332277541560255,0.1918294203758113,0.2462077256680748,0.24442544849364187,0.07970291991022452],
    expectedSetting:3.6317261654375623,p4:0.5703360940719412,p5:0.3241283684038664,p6:0.07970291991022452,
    estimatedGrape:5.9478793436855995,estimatedGrapeCount:879.3049922158027,grapeCountLo:857.6229060486962,grapeCountHi:900.9870783829092
  },
  {
    input:{machine:'im',games:4100,bb:17,rb:14},method:'bonus-only',
    q:[0.07519249978552225,0.11555035683710488,0.192978316778222,0.21867472973954893,0.19717205653085315,0.20043204032874884],
    expectedSetting:3.9483796073793527,p4:0.6162788265991509,p5:0.39760409685960196,p6:0.20043204032874884
  },
  {
    input:{machine:'go',games:6000,bb:27,rb:25,diff:850},method:'reverse-diff',
    q:[0.24613280017616132,0.2507191785320366,0.24853114055836725,0.1623550859525854,0.07171037192710909,0.020551422853740307],
    expectedSetting:2.6244453194836654,p4:0.2546168807334348,p5:0.0922617947808494,p6:0.020551422853740307
  },
  {
    input:{machine:'fk',games:3550,bb:12,rb:9},method:'bonus-only',
    q:[0.21843932630142474,0.2193933876759872,0.21017421225135907,0.16787871760478643,0.1269050715524864,0.05720928461395617],
    expectedSetting:2.937044674272791,p4:0.351993073771229,p5:0.18411435616644256,p6:0.05720928461395617
  },
  {
    input:{machine:'hp',games:7000,bb:31,rb:30,diff:1600},method:'reverse-diff',
    q:[0.04634408021296993,0.11768595267477584,0.25169042832490607,0.1578614562383568,0.21340558441748142,0.21301249813150994],
    expectedSetting:4.013336006367133,p4:0.5842795387873482,p5:0.4264180825489914,p6:0.21301249813150994,
    estimatedGrape:6.211006603148272,estimatedGrapeCount:1127.0314857581698
  },
  {
    input:{machine:'gg',games:4800,bb:21,rb:16},method:'bonus-only',
    q:[0.10671442834009326,0.13959850933686738,0.18487588108590558,0.19921686042106457,0.19689338754706887,0.17270093326900035],
    expectedSetting:3.7580790693051496,p4:0.5688111812371338,p5:0.36959432081606924,p6:0.17270093326900035
  },
  {
    input:{machine:'mr',games:6200,bb:28,rb:23,diff:500},method:'reverse-diff',
    q:[0.5342827282996775,0.2577286303257199,0.12118637572174015,0.06596026043975277,0.017125428989618257,0.003716576223491376],
    expectedSetting:1.7850667601643884,p4:0.0868022656528624,p5:0.020842005213109634,p6:0.003716576223491376,
    estimatedGrape:6.94323074769272,estimatedGrapeCount:892.956064013903
  },
  {
    input:{machine:'um',games:5100,bb:23,rb:19},method:'bonus-only',
    q:[0.036276425472967964,0.058083138306718456,0.1306355552492869,0.2054419758411915,0.26894903277535637,0.3006138723544788],
    expectedSetting:4.514545669202686,p4:0.7750048809710266,p5:0.5695629051298352,p6:0.3006138723544788
  }
];

test('server external judge keeps all eight Juggler machine keys',()=>{
  assert.deepEqual(JUGGLER_MACHINE_KEYS,['my','im','go','fk','hp','gg','mr','um']);
});

test('server external judge matches protected browser reference vectors',()=>{
  for(const vector of vectors){
    const result=judgeJugglerExternal(vector.input);
    assert.equal(result.method,vector.method,vector.input.machine);
    closeArray(result.q,vector.q);
    close(result.expectedSetting,vector.expectedSetting);
    close(result.p4,vector.p4);
    close(result.p5,vector.p5);
    close(result.p6,vector.p6);
    if(vector.method==='reverse-diff'){
      close(result.estimatedGrape,vector.estimatedGrape);
      close(result.estimatedGrapeCount,vector.estimatedGrapeCount);
      if(vector.grapeCountLo!=null)close(result.grapeCountLo,vector.grapeCountLo);
      if(vector.grapeCountHi!=null)close(result.grapeCountHi,vector.grapeCountHi);
      assert.equal(result.reverseWarn,false);
    }else{
      assert.equal(Number.isNaN(result.estimatedGrape),true);
      assert.equal(Number.isNaN(result.estimatedGrapeCount),true);
    }
  }
});

test('zero/invalid G and unknown machines do not produce a posterior',()=>{
  assert.equal(judgeJugglerExternal({machine:'my',games:0,bb:0,rb:0,diff:0}),null);
  assert.equal(judgeJugglerExternal({machine:'not-a-machine',games:5000,bb:20,rb:20,diff:0}),null);
});
