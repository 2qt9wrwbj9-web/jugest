import {Coordinator,__test as coordinatorTest} from './coordinator.mjs';
import {deferJob} from './queue.mjs';

const RESEARCH_JOB_TYPES=coordinatorTest.RESEARCH_JOB_TYPES;
const COLLECTOR_RETRY_DELAY_MS=5_000;

function plusMs(isoText,ms){return new Date(new Date(isoText).getTime()+ms).toISOString()}

export class CollectorAwareCoordinator extends Coordinator{
  constructor({collectorActivityReader=()=>false,...options}={}){
    if(typeof collectorActivityReader!=='function')throw new TypeError('collectorActivityReader must be a function');
    super(options);
    this.collectorActivityReader=collectorActivityReader;
  }

  async _collectorActive(){
    try{return !!(await this.collectorActivityReader())}
    catch(error){
      console.error('[jugest-coordinator] Collector activity probe failed',error);
      return false;
    }
  }

  _cancelResearchForCollector(at){
    const cancelled=[];
    for(const entry of [...this.running.values()]){
      if(entry.finished||entry.cancelled||!RESEARCH_JOB_TYPES.has(entry.job?.type))continue;
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
      cancelled.push({id:entry.job.id,type:entry.job.type});
      try{entry.handle?.kill('SIGTERM')}catch{}
    }
    return cancelled;
  }

  async _tick(){
    if(await this._collectorActive()){
      const at=this.clock().toISOString();
      return {pressure:'COLLECTOR',started:[],cancelled:this._cancelResearchForCollector(at),collectorActive:true};
    }
    return super._tick();
  }
}

export const __test={RESEARCH_JOB_TYPES,COLLECTOR_RETRY_DELAY_MS};
