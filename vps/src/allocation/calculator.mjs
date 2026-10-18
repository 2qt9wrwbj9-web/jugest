import {Worker} from 'node:worker_threads';

function failure(code){return Object.assign(new Error(code),{code})}
// One calculation worker, at most three waiting requests. Heavy sensitivity
// and conditional calculations cannot block the HTTP/collector event loop.
export function createAllocationCalculator({timeoutMs=120000,maxQueue=3}={}){
  let active=null,closed=false;
  const queue=[];
  function pump(){
    if(active||closed||!queue.length)return;
    const job=queue.shift();active=job;clearTimeout(job.timer);
    const worker=new Worker(new URL('./worker.mjs',import.meta.url),{workerData:job.input,execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256}});
    job.worker=worker;
    job.timer=setTimeout(()=>finish(job,failure('allocation_timeout')),timeoutMs);
    worker.once('message',message=>finish(job,message.ok?null:failure(message.code||'allocation_calculation_failed'),message.results));
    worker.once('error',()=>finish(job,failure('allocation_calculation_failed')));
    worker.once('exit',code=>{if(!job.done)finish(job,failure(code?'allocation_worker_failed':'allocation_no_result'))});
  }
  function finish(job,error,result){
    if(job.done)return;job.done=true;clearTimeout(job.timer);job.signal?.removeEventListener('abort',job.abort);
    const index=queue.indexOf(job);if(index>=0)queue.splice(index,1);
    if(active===job)active=null;
    void job.worker?.terminate();
    if(error)job.reject(error);else job.resolve(result);
    pump();
  }
  function calculate(input,{signal}={}){
    if(closed)return Promise.reject(failure('allocation_closed'));
    if(signal?.aborted)return Promise.reject(failure('allocation_aborted'));
    if(active&&queue.length>=maxQueue)return Promise.reject(failure('allocation_busy'));
    return new Promise((resolve,reject)=>{
      const job={input,signal,resolve,reject,done:false};
      job.abort=()=>finish(job,failure('allocation_aborted'));
      signal?.addEventListener('abort',job.abort,{once:true});
      job.timer=setTimeout(()=>finish(job,failure('allocation_busy')),30000);
      queue.push(job);pump();
    });
  }
  function close(){closed=true;for(const job of [...queue,...(active?[active]:[])])finish(job,failure('allocation_closed'))}
  return {calculate,close};
}
