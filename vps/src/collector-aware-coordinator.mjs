import {Coordinator,__test as coordinatorTest} from './coordinator.mjs';
import {deferJob} from './queue.mjs';

const RESEARCH_JOB_TYPES=coordinatorTest.RESEARCH_JOB_TYPES;
const COLLECTOR_RETRY_DELAY_MS=5_000;
const COLLECTOR_STOP_GRACE_MS=1_000;

function plusMs(isoText,ms){return new Date(new Date(isoText).getTime()+ms).toISOString()}
function childAlreadyExited(handle){return !handle||handle.exitCode!==null||handle.signalCode!==null}

function awaitChildExit(handle,{graceMs=COLLECTOR_STOP_GRACE_MS}={}){
  if(childAlreadyExited(handle)||typeof handle.once!=='function')return Promise.resolve();
  return new Promise((resolve,reject)=>{
    let settled=false;
    let forceTimer=null;
    let failTimer=null;
    const cleanup=()=>{
      if(forceTimer)clearTimeout(forceTimer);
      if(failTimer)clearTimeout(failTimer);
      try{handle.removeListener?.('exit',onExit)}catch{}
    };
    const finish=(error=null)=>{
      if(settled)return;
      settled=true;
      cleanup();
      if(error)reject(error);else resolve();
    };
    const onExit=()=>finish();
    handle.once('exit',onExit);
    forceTimer=setTimeout(()=>{
      if(settled)return;
      try{handle.kill?.('SIGKILL')}catch{}
      failTimer=setTimeout(()=>finish(new Error('Collector barrier could not stop research child')),graceMs);
      failTimer?.unref?.();
    },graceMs);
    forceTimer?.unref?.();
  });
}

export class CollectorAwareCoordinator extends Coordinator{
  constructor({collectorActivityReader=()=>false,...options}={}){
    if(typeof collectorActivityReader!=='function')throw new TypeError('collectorActivityReader must be a function');
    super(options);
    this.collectorActivityReader=collectorActivityReader;
    this._collectorBarrierActive=false;
    this._collectorBarrierInFlight=null;
  }

  async _collectorActive(){
    try{return !!(await this.collectorActivityReader())}
    catch(error){
      console.error('[jugest-coordinator] Collector activity probe failed',error);
      return false;
    }
  }

  _deferResearchEntry(entry,at){
    entry.cancelled=true;
    deferJob(this.db,{
      jobId:entry.job.id,
      owner:this.owner,
      nowIso:at,
      retryAtIso:plusMs(at,COLLECTOR_RETRY_DELAY_MS),
      errorClass:'collector_activity',
      message:'Collector push has priority over background research',
      peakRssMiB:entry.peakRssMiB||null,
      exitCode:143
    });
    this.running.delete(entry.job.id);
    return {id:entry.job.id,type:entry.job.type};
  }

  _cancelResearchForCollector(at){
    const cancelled=[];
    for(const entry of [...this.running.values()]){
      if(entry.finished||entry.cancelled||!RESEARCH_JOB_TYPES.has(entry.job?.type))continue;
      cancelled.push(this._deferResearchEntry(entry,at));
      try{entry.handle?.kill('SIGTERM')}catch{}
    }
    return cancelled;
  }

  _beginCollectorBarrier(at,{stopGraceMs=COLLECTOR_STOP_GRACE_MS}={}){
    const cancelled=[];
    const exits=[];
    for(const entry of [...this.running.values()]){
      if(entry.finished||entry.cancelled||!RESEARCH_JOB_TYPES.has(entry.job?.type))continue;
      const exitPromise=awaitChildExit(entry.handle,{graceMs:stopGraceMs});
      cancelled.push(this._deferResearchEntry(entry,at));
      exits.push(exitPromise);
      try{entry.handle?.kill('SIGTERM')}catch{}
    }
    return {cancelled,exits};
  }

  enterCollectorBarrier({stopGraceMs=COLLECTOR_STOP_GRACE_MS}={}){
    if(!Number.isFinite(stopGraceMs)||stopGraceMs<1)throw new TypeError('stopGraceMs must be a positive number');
    if(this._collectorBarrierInFlight)return this._collectorBarrierInFlight;
    this._collectorBarrierActive=true;
    const prepare=this._tickChain.then(()=>this._beginCollectorBarrier(this.clock().toISOString(),{stopGraceMs}));
    this._tickChain=prepare.catch(()=>{});
    const run=prepare.then(async({cancelled,exits})=>{
      await Promise.all(exits);
      return {pressure:'COLLECTOR',started:[],cancelled,collectorActive:true};
    });
    const settled=run.finally(()=>{
      if(this._collectorBarrierInFlight===settled){
        this._collectorBarrierInFlight=null;
        this._collectorBarrierActive=false;
      }
    });
    this._collectorBarrierInFlight=settled;
    return settled;
  }

  async _tick(){
    if(this._collectorBarrierActive||await this._collectorActive()){
      const at=this.clock().toISOString();
      return {pressure:'COLLECTOR',started:[],cancelled:this._cancelResearchForCollector(at),collectorActive:true};
    }
    return super._tick();
  }
}

export const __test={RESEARCH_JOB_TYPES,COLLECTOR_RETRY_DELAY_MS,COLLECTOR_STOP_GRACE_MS,awaitChildExit};
