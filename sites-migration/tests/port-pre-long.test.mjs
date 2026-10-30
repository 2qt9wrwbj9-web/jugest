import test from'node:test';import assert from'node:assert/strict';import{mkdirSync,writeFileSync}from'node:fs';
import{preFixture,compareTables,at,args,plain,formalTables}from'./v16-pre-fixture.mjs';
import{startFormalLiveTrial as originalStart}from'../upstream/vps/src/research/pre-v2/formal-start.mjs';
import{persistFormalPrediction as originalPrediction}from'../upstream/vps/src/research/pre-v2/formal-prediction-store.mjs';
import{scoreFormalTargetDay as originalScore}from'../upstream/vps/src/research/pre-v2/formal-evaluation.mjs';
import{startFormalLiveTrial,persistFormalPrediction,scoreFormalTargetDay}from'../lib/analysis/pre-v2.mjs';
import{startFormalTrial,applyFormalDay,formalTrialDecision}from'../upstream/vps/src/research/pre-v2/trial.mjs';
for(const mode of ['promotion','degradation','pending'])test('multi-day SQLite persistence and terminal decision '+mode,async()=>{const f=await preFixture();try{const initial=originalStart(f.source,f.options);assert.deepEqual(await startFormalLiveTrial(f.db,f.options),initial);let trial=initial.trial.trial,last;const active=plain(f.source.prepare('SELECT * FROM active_store_models').all());
for(let n=0;n<100;n++){
 const targetDate=new Date(Date.UTC(2026,1,20+n)).toISOString().slice(0,10),sourceFrontierDate=new Date(Date.UTC(2026,1,19+n)).toISOString().slice(0,10);const cp={...initial.championPrediction,targetDate,sourceFrontierDate},xp={...initial.challengerPrediction,targetDate,sourceFrontierDate};
 // Synthetic frozen predictions exercise the real scorer and every persistence row.
 const order=initial.championPrediction.rankings.map(r=>r.machineKey).slice(n===4?1:0);if(n>0){cp.rankings=order.map((machineKey,i)=>({...initial.championPrediction.rankings.find(r=>r.machineKey===machineKey),machineKey,score:order.length-i,rank:i+1}));xp.rankings=[...order].reverse().map((machineKey,i)=>({...initial.championPrediction.rankings.find(r=>r.machineKey===machineKey),machineKey,score:order.length-i,rank:i+1}));}
 for(const prediction of [cp,xp]){const opts={trial,prediction,nowIso:at};originalPrediction(f.source,opts);await persistFormalPrediction(f.db,opts)}
 const judgedRows=order.map((machineKey,i)=>({tableNo:machineKey,machine:'my',expectedSetting:(mode==='pending'||n===3)?3:mode==='promotion'?(i>=order.length-3?6:1):(i<3?6:1),q:(mode==='pending'||n===3)?[0,0,1,0,0,0]:((mode==='promotion'?i>=order.length-3:i<3)?[0,0,0,0,0,1]:[1,0,0,0,0,0])}));
 const opts={storeId:args.storeId,lineageId:'pre-v2-live',trialNumber:1,targetDate,judgedRows,nowIso:at};const a=originalScore(f.source,opts),b=await scoreFormalTargetDay(f.db,opts);assert.deepEqual(b,a);trial=a.trial.trial;last=opts;
 assert.deepEqual(await scoreFormalTargetDay(f.db,opts),originalScore(f.source,opts));
 if(trial.status!=='running')break;
}
assert.equal(trial.status,mode==='promotion'?'promoted':mode==='degradation'?'blocked':'running');await compareTables(f);assert.deepEqual((await f.db.prepare('SELECT * FROM active_store_models').all()).results,active);
await assert.rejects(scoreFormalTargetDay(f.db,{...last,judgedRows:last.judgedRows.map(r=>({...r,expectedSetting:2}))}));
mkdirSync('evidence/v17',{recursive:true});const tables={};for(const t of formalTables)tables[t]={source:plain(f.source.prepare('SELECT * FROM '+t).all()),ported:(await f.db.prepare('SELECT * FROM '+t).all()).results};writeFileSync('evidence/v17/long-'+mode+'.json',JSON.stringify({trial,tables,activeUnchanged:true},null,2));
}finally{await f.close()}});
test('same-day safety veto and trial-number alpha remain original; no artificial maximum day',()=>{let t=startFormalTrial({storeId:'synthetic',lineageId:'test',trialNumber:2,championFingerprint:'a',challengerFingerprint:'b',machineSetHash:'c',scorerVersion:'d'});assert.equal(t.promotionAlpha,0.05/6);for(let i=0;i<100&&t.status==='running';i++)t=applyFormalDay(t,{targetDate:new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),top10Delta:1,top5Delta:-1});assert.equal(t.status,'blocked');assert.equal(formalTrialDecision(t).decision,'block_top5_degradation')});
