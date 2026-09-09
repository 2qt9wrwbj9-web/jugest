import {pathToFileURL} from 'node:url';
import {openDatabase} from './db.mjs';
import {migrate} from './schema.mjs';
import {recoverStaleJobs} from './queue.mjs';
import {readMemorySnapshot} from './memory.mjs';
import {DEFAULT_RESOURCE_POLICY} from './config.mjs';
import {Coordinator} from './coordinator.mjs';

export function recoverStartupState({db,now=new Date(),staleAfterMs=5*60*1000}={}){
  if(!db)throw new TypeError('db is required');
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new TypeError('now must be a valid Date');
  if(!Number.isFinite(staleAfterMs)||staleAfterMs<=0)throw new TypeError('staleAfterMs must be positive');
  const staleBeforeIso=new Date(now.getTime()-staleAfterMs).toISOString();
  return recoverStaleJobs(db,{staleBeforeIso,nowIso:now.toISOString()});
}

export async function runCoordinator({
  dbPath=process.env.JUGEST_DB_PATH||'/var/lib/jugest/jugest.sqlite',
  policy=DEFAULT_RESOURCE_POLICY,
  staleAfterMs=5*60*1000,
  owner=`coord-${process.pid}`
}={}){
  const db=openDatabase(dbPath);
  migrate(db);
  recoverStartupState({db,staleAfterMs});
  const coordinator=new Coordinator({db,memoryReader:()=>readMemorySnapshot(),policy,owner});
  let stopping=false;
  const tick=()=>coordinator.tick().catch(error=>{
    console.error(JSON.stringify({level:'error',event:'coordinator_tick_failed',message:String(error?.message??error)}));
  });
  await tick();
  const timer=setInterval(tick,policy.sampleIntervalMs);
  timer.unref?.();

  const stop=signal=>{
    if(stopping)return;
    stopping=true;
    clearInterval(timer);
    console.log(JSON.stringify({level:'info',event:'coordinator_stopping',signal,runningChildren:coordinator.runningCount}));
    try{db.close()}catch{}
    process.exit(0);
  };
  process.once('SIGTERM',()=>stop('SIGTERM'));
  process.once('SIGINT',()=>stop('SIGINT'));
  return {db,coordinator,timer};
}

const direct=process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(direct){
  runCoordinator().catch(error=>{
    console.error(JSON.stringify({level:'error',event:'coordinator_start_failed',message:String(error?.stack??error)}));
    process.exitCode=1;
  });
}
