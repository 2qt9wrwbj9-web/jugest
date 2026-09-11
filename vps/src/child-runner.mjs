import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';

function workerFilename(workerPath){
  if(workerPath instanceof URL)return fileURLToPath(workerPath);
  if(typeof workerPath==='string'&&workerPath)return workerPath;
  throw new TypeError('workerPath is required');
}

export function spawnJobChild({job,leaseMiB,heapMiB,workerPath,childEnv={},onMessage,onExit}={}){
  if(!job||!Number.isInteger(job.id)||typeof job.type!=='string')throw new TypeError('valid job is required');
  if(!Number.isFinite(leaseMiB)||leaseMiB<=0)throw new TypeError('leaseMiB must be positive');
  if(!Number.isInteger(heapMiB)||heapMiB<1)throw new TypeError('heapMiB must be a positive integer');
  if(!childEnv||typeof childEnv!=='object'||Array.isArray(childEnv))throw new TypeError('childEnv must be an object');
  const descriptor={id:job.id,type:job.type,payload:job.payload??{}};
  const encoded=Buffer.from(JSON.stringify(descriptor),'utf8').toString('base64url');
  const child=fork(workerFilename(workerPath),[encoded],{
    execArgv:[`--max-old-space-size=${heapMiB}`],
    stdio:['ignore','ignore','ignore','ipc'],
    env:{...process.env,...childEnv}
  });
  if(typeof onMessage==='function')child.on('message',onMessage);
  if(typeof onExit==='function')child.on('exit',onExit);
  return child;
}
