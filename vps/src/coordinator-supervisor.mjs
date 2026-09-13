import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const COORDINATOR_MAIN=fileURLToPath(new URL('./main.mjs',import.meta.url));
const DEFAULT_RESTART_DELAY_MS=5000;
const DEFAULT_STOP_TIMEOUT_MS=3000;

function requiredText(value,name){
  const text=String(value??'').trim();
  if(!text)throw new TypeError(`${name} is required`);
  return text;
}

export function startCoordinatorProcess({
  dbPath,
  logger=message=>console.log(message),
  spawnProcess=spawn,
  restartDelayMs=DEFAULT_RESTART_DELAY_MS,
  stopTimeoutMs=DEFAULT_STOP_TIMEOUT_MS,
  setTimer=setTimeout,
  clearTimer=clearTimeout
}={}){
  const databasePath=requiredText(dbPath,'dbPath');
  if(typeof spawnProcess!=='function')throw new TypeError('spawnProcess must be a function');
  if(typeof logger!=='function')throw new TypeError('logger must be a function');
  if(!Number.isFinite(restartDelayMs)||restartDelayMs<0)throw new TypeError('restartDelayMs must be non-negative');
  if(!Number.isFinite(stopTimeoutMs)||stopTimeoutMs<0)throw new TypeError('stopTimeoutMs must be non-negative');

  let child=null;
  let restartTimer=null;
  let stopping=false;

  const log=(event,extra={})=>{
    try{logger(JSON.stringify({level:'info',event,...extra}))}catch{}
  };

  const scheduleRestart=()=>{
    if(stopping||restartTimer)return;
    restartTimer=setTimer(()=>{
      restartTimer=null;
      launch();
    },restartDelayMs);
    restartTimer?.unref?.();
  };

  const launch=()=>{
    if(stopping||child)return child;
    const handle=spawnProcess(process.execPath,[COORDINATOR_MAIN],{
      env:{...process.env,JUGEST_DB_PATH:databasePath},
      stdio:['ignore','inherit','inherit']
    });
    child=handle;
    let settled=false;
    const finish=(code,signal,error=null)=>{
      if(settled)return;
      settled=true;
      if(child===handle)child=null;
      if(error)log('coordinator_child_error',{message:String(error?.message??error)});
      else log('coordinator_child_exit',{code:code??null,signal:signal??null});
      if(!stopping)scheduleRestart();
    };
    handle.once?.('exit',(code,signal)=>finish(code,signal));
    handle.once?.('error',error=>finish(null,'spawn_error',error));
    log('coordinator_child_started',{pid:Number(handle.pid)||null,dbPath:databasePath});
    return handle;
  };

  launch();

  const stop=async()=>{
    if(stopping)return;
    stopping=true;
    if(restartTimer){clearTimer(restartTimer);restartTimer=null;}
    const active=child;
    if(!active)return;
    child=null;
    if(active.exitCode!==null||active.signalCode!==null)return;
    await new Promise(resolve=>{
      let done=false;
      const finish=()=>{if(done)return;done=true;resolve();};
      active.once?.('exit',finish);
      try{active.kill?.('SIGTERM')}catch{finish();return;}
      if(stopTimeoutMs===0){finish();return;}
      const timeout=setTimer(()=>{
        try{active.kill?.('SIGKILL')}catch{}
        finish();
      },stopTimeoutMs);
      timeout?.unref?.();
    });
  };

  return Object.freeze({stop,get child(){return child;}});
}

export const __test={COORDINATOR_MAIN,DEFAULT_RESTART_DELAY_MS,DEFAULT_STOP_TIMEOUT_MS};
