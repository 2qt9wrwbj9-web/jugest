import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeWalkForward} from '../research/axis-auto-selector/report.mjs';

function score(utility){return{utility,top3:{es:utility,p4:utility},top5:{es:utility,p4:utility},top10:{es:utility,p4:utility}}}
function receipt(i,{selectorDecision='SHADOW_CHAMPION',operationalDecision='CONTROL',shadowUtility=0,ensembleKey='E1',gateReason='oos_gate_blocked',stateBefore='BLOCKED',stateAfter='BLOCKED',evidenceCount=12}={}){
 const controlUtility=0,operationalUtility=operationalDecision==='SHADOW_CHAMPION'?shadowUtility:controlUtility;
 return{
  store:'A',targetDate:`2026-02-${String(i+1).padStart(2,'0')}`,
  decision:selectorDecision,selectorDecision,operationalDecision,ensembleKey,selectedAxes:[],
  gate:{reason:gateReason,stateBefore,stateAfter,evidenceCount,evidenceDates:[]},
  controlUtility,shadowUtility,operationalUtility,
  utilityDelta:shadowUtility-controlUtility,operationalUtilityDelta:operationalUtility-controlUtility,
  control:score(controlUtility),shadow:score(shadowUtility),operational:score(operationalUtility)
 };
}

test('Phase2B report distinguishes selector Shadow, gate operational Shadow, prevented losses, and missed gains',()=>{
 const receipts=[
  receipt(0,{shadowUtility:-.10,gateReason:'oos_insufficient_evidence'}),
  receipt(1,{shadowUtility:.20}),
  receipt(2,{shadowUtility:.10,operationalDecision:'SHADOW_CHAMPION',gateReason:'oos_gate_released',stateBefore:'BLOCKED',stateAfter:'ALLOWED'}),
  receipt(3,{selectorDecision:'CONTROL',operationalDecision:'CONTROL',shadowUtility:0,ensembleKey:'CONTROL',gateReason:'selector_control',stateBefore:'BLOCKED',stateAfter:'BLOCKED',evidenceCount:0}),
  receipt(4,{shadowUtility:-.05})
 ];
 const summary=summarizeWalkForward({receipts,warmupDays:24,totalSamples:29});
 assert.equal(summary.shadowChampionDays,4);
 assert.equal(summary.phase2b.selectorShadowEligibleDays,4);
 assert.equal(summary.phase2b.gateAllowedShadowDays,1);
 assert.equal(summary.phase2b.gateBlockedShadowDays,3);
 assert.equal(summary.phase2b.coldStartBlockedDays,1);
 assert.equal(summary.phase2b.operationalControlDays,4);
 assert.equal(summary.phase2b.operationalAbstainRate,.8);
 assert.equal(summary.phase2b.preventedLossDays,2);
 assert.equal(summary.phase2b.missedGainDays,1);
 assert.equal(summary.phase2b.operationalShadowWins,1);
 assert.equal(summary.phase2b.operationalControlWins,0);
 assert.equal(summary.phase2b.operationalTies,4);
 assert.ok(Math.abs(summary.phase2b.controlToSelectorMeanUtilityDelta-.03)<1e-12);
 assert.ok(Math.abs(summary.phase2b.controlToOperationalMeanUtilityDelta-.02)<1e-12);
 assert.ok(Math.abs(summary.phase2b.operationalToSelectorMeanUtilityDelta-(-.01))<1e-12);
 assert.equal(summary.phase2b.distinctEnsembleKeys,1);
 assert.equal(summary.phase2b.ensembleSwitches,0);
 assert.equal(summary.phase2b.gateTransitions,1);
 assert.equal(summary.phase2b.byEnsemble.E1.selectedDays,4);
 assert.equal(summary.phase2b.byEnsemble.E1.allowedDays,1);
 assert.equal(summary.phase2b.byEnsemble.E1.blockedDays,3);
});

test('Phase2B report counts a Shadow ensemble switch as an operational trust reset',()=>{
 const receipts=[
  receipt(0,{shadowUtility:.1,ensembleKey:'E1'}),
  receipt(1,{selectorDecision:'CONTROL',ensembleKey:'CONTROL',gateReason:'selector_control',evidenceCount:0}),
  receipt(2,{shadowUtility:.1,ensembleKey:'E2',gateReason:'oos_insufficient_evidence',evidenceCount:0})
 ];
 const summary=summarizeWalkForward({receipts,warmupDays:24,totalSamples:27});
 assert.equal(summary.phase2b.distinctEnsembleKeys,2);
 assert.equal(summary.phase2b.ensembleSwitches,1);
 assert.deepEqual(Object.keys(summary.phase2b.byEnsemble),['E1','E2']);
});
