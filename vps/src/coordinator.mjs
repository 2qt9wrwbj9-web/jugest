import {DEFAULT_RESOURCE_POLICY} from './config.mjs';
import {classifyPressure} from './memory.mjs';
import {canAdmit,deriveHeapLimitMiB,estimateLeaseMiB,selectEmergencyVictims,updateEwmaPeakMiB} from './scheduler-policy.mjs';
import {claimNextJob,completeJob,deferJob,failJob,getJob,heartbeatJob,markJobRunning,peekNextJob} from './queue.mjs';
import {spawnJobChild} from './child-runner.mjs';

const SYNTHETIC_WORKER=new URL('./jobs/synthetic.mjs',import.meta.url);
const DAILY_ANALYSIS_WORKER=new URL('./jobs/daily-analysis.mjs',import.meta.url);

function iso(clock){return clock().toISOString();}
function plusMs(isoText,ms){return new Date(new Date(isoText).getTime()+ms).toISOString();}
function queueDepth(db,at){return db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE state='queued' OR (state='retry_wait' AND (available_at IS NULL OR available_at<=?))`).get(at).n;}

function projectedAfterLease(snapshot,leaseMiB){
  const effectiveAvailableMiB=Math.max(0,snapshot.effectiveAvailableMiB-leaseMiB);
  let usedRatio=snapshot.usedRatio;
  if(Number.isFinite(snapshot.effectiveLimitMiB)&&snapshot.effectiveLimitMiB>0){
    const projectedUsed=Math.max(0,snapshot.effectiveLimitMiB-effectiveAvailableMiB);
    usedRatio=Math.min(1,projectedUsed/snapshot.effectiveLimitMiB);
  }
  return {...snapshot,effectiveAvailableMiB,usedRatio};
}

function projectedAfterOutstandingLeases(snapshot,runningEntries){
  const committedMiB=runningEntries.reduce((sum,entry)=>sum+(Number.isFinite(entry.leaseMiB)?entry.leaseMiB:0),0);
  return committedMiB>0?projectedAfterLease(snapshot,committedMiB):{...snapshot};
}

export class Coordinator{
  constructor({db,memoryReader,spawnChild=spawnJobChild,owner=`coord-${process.pid}`,policy=DEFAULT_RESOURCE_POLICY,clock=()=>new Date(),workerPath=null,workerPathForJob=null,maxDailyAnalysisChildren=1}={}){
    if(!db)throw new TypeError('db is required');
    if(typeof memoryReader!=='function')throw new TypeError('memoryReader is required');
    if(typeof spawnChild!=='function')throw new TypeError('spawnChild is required');
    if(typeof owner!=='string'||!owner)throw new TypeError('owner is required');
    if(typeof clock!=='function')throw new TypeError('clock is required');
    if(workerPathForJob!==null&&typeof workerPathForJob!=='function')throw new TypeError('workerPathForJob must be a function');
    if(!Number.isInteger(maxDailyAnalysisChildren)||maxDailyAnalysisChildren<1)throw new TypeError('maxDailyAnalysisChildren must be a positive integer');
    this.db=db;
    this.memoryReader=memoryReader;
    this.spawnChild=spawnChild;
    this.owner=owner;
    this.policy=policy;
    this.clock=clock;
    this.workerPath=workerPath??SYNTHETIC_WORKER;
    this.workerPathForJob=workerPathForJob??(workerPath?(()=>this.workerPath):(job=>job.type==='DAILY_ANALYSIS'?DAILY_ANALYSIS_WORKER:SYNTHETIC_WORKER));
    this.maxDailyAnalysisChildren=maxDailyAnalysisChildren;
    this.running=new Map();
    this._tickChain=Promise.resolve();
    this._emergencyLatched=false;
    this._belowPauseSinceMs=null;
  }

  get runningCount(){return this.running.size;}

  tick(){
    const run=this._tickChain.then(()=>this._tick());
    this._tickChain=run.catch(()=>{});
    return run;
  }

  _profile(job){
    return this.db.prepare('SELECT ewma_peak_mib,samples FROM memory_profiles WHERE job_type=? AND size_class=?').get(job.type,job.sizeClass)??null;
  }

  _learn(job,peakRssMiB,at){
    if(!Number.isFinite(peakRssMiB)||peakRssMiB<=0)return null;
    const current=this._profile(job);
    const ewma=updateEwmaPeakMiB(current?.ewma_peak_mib??null,peakRssMiB);
    this.db.prepare(`INSERT INTO memory_profiles(job_type,size_class,ewma_peak_mib,samples,updated_at)
      VALUES(?,?,?,1,?)
      ON CONFLICT(job_type,size_class) DO UPDATE SET
        ewma_peak_mib=excluded.ewma_peak_mib,
        samples=memory_profiles.samples+1,
        updated_at=excluded.updated_at`).run(job.type,job.sizeClass,ewma,at);
    return ewma;
  }

  _retryAt(job,at){
    const exponent=Math.max(0,(job.failureCount??job.attempts??1));
    const base=Math.min(30*60*1000,30*1000*(2**exponent));
    const spread=(job.id%11)*1000;
    return plusMs(at,base+spread);
  }

  async _finishComplete(entry,message){
    if(entry.finished)return;
    entry.finished=true;
    const at=iso(this.clock);
    const peak=Math.max(entry.peakRssMiB,Number(message.peakRssMiB)||0);
    this._learn(entry.job,peak,at);
    completeJob(this.db,{jobId:entry.job.id,owner:this.owner,nowIso:at,peakRssMiB:peak||null,resultHash:message.resultHash??null});
    this.running.delete(entry.job.id);
    await this.tick();
  }

  async _finishError(entry,message){
    if(entry.finished)return;
    entry.finished=true;
    const at=iso(this.clock);
    const peak=Math.max(entry.peakRssMiB,Number(message.peakRssMiB)||0);
    this._learn(entry.job,peak,at);
    const current=getJob(this.db,entry.job.id)??entry.job;
    failJob(this.db,{
      jobId:entry.job.id,
      owner:this.owner,
      nowIso:at,
      retryAtIso:this._retryAt(current,at),
      errorClass:message.errorClass??'child_error',
      message:message.message??'child reported error',
      peakRssMiB:peak||null
    });
    this.running.delete(entry.job.id);
    await this.tick();
  }

  async _finishExit(entry,code,signal){
    if(entry.finished||entry.cancelled)return;
    await this._finishError(entry,{
      type:'error',
      peakRssMiB:entry.peakRssMiB,
      errorClass:'child_exit',
      message:`child exited before completion (code=${code??'null'}, signal=${signal??'null'})`
    });
  }

  async _handleMessage(entry,message){
    if(entry.finished||entry.cancelled||!message||typeof message!=='object')return;
    if(Number.isFinite(message.rssMiB))entry.peakRssMiB=Math.max(entry.peakRssMiB,message.rssMiB);
    if(Number.isFinite(message.peakRssMiB))entry.peakRssMiB=Math.max(entry.peakRssMiB,message.peakRssMiB);
    if(message.type==='heartbeat'){
      heartbeatJob(this.db,{jobId:entry.job.id,owner:this.owner,nowIso:iso(this.clock)});
      return;
    }
    if(message.type==='complete')return this._finishComplete(entry,message);
    if(message.type==='error')return this._finishError(entry,message);
  }

  _recordSample(snapshot,at,decision){
    this.db.prepare(`INSERT INTO resource_samples(captured_at,effective_available_mib,used_ratio,swap_used_mib,running_children,queue_depth,decision_json)
      VALUES(?,?,?,?,?,?,?)`).run(at,snapshot.effectiveAvailableMiB,snapshot.usedRatio,snapshot.swapUsedMiB??0,this.runningCount,queueDepth(this.db,at),JSON.stringify(decision));
    this.db.prepare(`DELETE FROM resource_samples WHERE id NOT IN (SELECT id FROM resource_samples ORDER BY id DESC LIMIT 10000)`).run();
  }

  _cancelEmergency(at){
    const cancelled=[];
    for(const entry of selectEmergencyVictims([...this.running.values()])){
      if(entry.finished||entry.cancelled)continue;
      entry.cancelled=true;
      deferJob(this.db,{
        jobId:entry.job.id,
        owner:this.owner,
        nowIso:at,
        retryAtIso:at,
        errorClass:'memory_emergency',
        message:'memory pressure emergency',
        peakRssMiB:entry.peakRssMiB||null,
        exitCode:143
      });
      this.running.delete(entry.job.id);
      cancelled.push({id:entry.job.id,type:entry.job.type});
      try{entry.handle?.kill('SIGTERM')}catch{}
    }
    return cancelled;
  }

  async _start(job,leaseMiB,heapMiB,at){
    const claimed=claimNextJob(this.db,{owner:this.owner,nowIso:at});
    if(!claimed||claimed.id!==job.id){
      if(claimed&&claimed.id!==job.id){
        failJob(this.db,{jobId:claimed.id,owner:this.owner,nowIso:at,retryAtIso:plusMs(at,1000),errorClass:'claim_race',message:'scheduler queue changed during claim'});
      }
      return null;
    }
    const runningJob=markJobRunning(this.db,{jobId:claimed.id,owner:this.owner,nowIso:at});
    const entry={id:runningJob.id,type:runningJob.type,job:runningJob,leaseMiB,heapMiB,peakRssMiB:0,finished:false,cancelled:false,handle:null};
    try{
      entry.handle=this.spawnChild({
        job:runningJob,leaseMiB,heapMiB,workerPath:this.workerPathForJob(runningJob),
        onMessage:message=>this._handleMessage(entry,message),
        onExit:(code,signal)=>this._finishExit(entry,code,signal)
      });
      this.running.set(runningJob.id,entry);
      return entry;
    }catch(error){
      entry.finished=true;
      failJob(this.db,{jobId:runningJob.id,owner:this.owner,nowIso:at,retryAtIso:this._retryAt(runningJob,at),errorClass:'spawn_error',message:String(error?.message??error)});
      return null;
    }
  }

  async _tick(){
    const at=iso(this.clock);
    const nowMs=Date.parse(at);
    const snapshot=await this.memoryReader();
    const pressure=classifyPressure(snapshot,this.policy);
    const result={pressure,started:[],cancelled:[]};

    if(pressure==='EMERGENCY'){
      this._emergencyLatched=true;
      this._belowPauseSinceMs=null;
      result.cancelled=this._cancelEmergency(at);
    }else if(this._emergencyLatched&&pressure==='PAUSE'){
      this._belowPauseSinceMs=null;
    }

    let cooldownRemainingMs=0;
    if(this._emergencyLatched&&pressure!=='PAUSE'&&pressure!=='EMERGENCY'){
      if(this._belowPauseSinceMs===null)this._belowPauseSinceMs=nowMs;
      const cooldownMs=Number.isFinite(this.policy.emergencyCooldownMs)?this.policy.emergencyCooldownMs:10000;
      const elapsed=Math.max(0,nowMs-this._belowPauseSinceMs);
      cooldownRemainingMs=Math.max(0,cooldownMs-elapsed);
      if(cooldownRemainingMs===0){
        this._emergencyLatched=false;
        this._belowPauseSinceMs=null;
      }
    }

    this._recordSample(snapshot,at,{pressure,cancelled:result.cancelled,cooldownRemainingMs});
    if(pressure==='PAUSE'||pressure==='EMERGENCY'||this._emergencyLatched)return result;

    const runningAtAdmission=[...this.running.values()];
    let projected=projectedAfterOutstandingLeases(snapshot,runningAtAdmission);
    while(this.runningCount<this.policy.maxAnalysisChildren){
      const next=peekNextJob(this.db,{nowIso:at});
      if(!next)break;
      if(next.type==='DAILY_ANALYSIS'){
        const runningDaily=[...this.running.values()].filter(entry=>entry.job?.type==='DAILY_ANALYSIS'&&!entry.finished&&!entry.cancelled).length;
        if(runningDaily>=this.maxDailyAnalysisChildren)break;
      }
      const profile=this._profile(next);
      const leaseMiB=estimateLeaseMiB({persistedEwmaMiB:profile?.ewma_peak_mib??null,configuredFloorMiB:next.estimatedLeaseMiB});
      const decision=canAdmit({snapshot:projected,policy:this.policy,runningCount:this.runningCount,leaseMiB,priority:next.priority});
      if(!decision.admit)break;
      const heapMiB=deriveHeapLimitMiB(leaseMiB);
      const entry=await this._start(next,leaseMiB,heapMiB,at);
      if(!entry)continue;
      result.started.push({id:entry.job.id,type:entry.job.type,leaseMiB,heapMiB});
      projected=projectedAfterLease(projected,leaseMiB);
    }
    return result;
  }
}

export const __test={SYNTHETIC_WORKER,DAILY_ANALYSIS_WORKER};
