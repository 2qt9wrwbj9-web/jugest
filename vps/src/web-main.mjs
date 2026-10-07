import path from 'node:path';
import {once} from 'node:events';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createWebServer} from './web-server.mjs';
import {startCoordinatorProcess} from './coordinator-supervisor.mjs';
import {startPiaPublicCollectorScheduler} from './collectors/pia-scheduler.mjs';
import {readPachinkoConfig} from './pachinko/config.mjs';
import {startPachinkoCollectorScheduler} from './pachinko/collector.mjs';

const DEFAULT_WEB_ROOT=fileURLToPath(new URL('../..',import.meta.url));
const DEFAULT_RELAY_DB='/var/lib/jugest/relay.sqlite';
const DEFAULT_CANONICAL_DB='/var/lib/jugest/jugest.sqlite';
const DEFAULT_RAW_ROOT='/var/lib/jugest/raw';

export function readWebConfig(env=process.env){
  const rootDir=path.resolve(env.JUGEST_WEB_ROOT||DEFAULT_WEB_ROOT);
  const host=String(env.JUGEST_WEB_HOST||'127.0.0.1').trim();
  const rawPort=env.JUGEST_WEB_PORT??'3000';
  const port=Number(rawPort);
  const relayDbPath=path.resolve(String(env.JUGEST_RELAY_DB||DEFAULT_RELAY_DB));
  const canonicalDbPath=path.resolve(String(env.JUGEST_DB_PATH||DEFAULT_CANONICAL_DB));
  const rawRoot=path.resolve(String(env.JUGEST_RAW_ROOT||DEFAULT_RAW_ROOT));
  const piaCollectorEnabled=!['0','false','no','off'].includes(String(env.JUGEST_PIA_COLLECTOR_ENABLED??'1').trim().toLowerCase());
  if(!host)throw new TypeError('JUGEST_WEB_HOST must not be empty');
  if(!Number.isInteger(port)||port<1||port>65535)throw new TypeError('JUGEST_WEB_PORT must be an integer from 1 to 65535');
  return {rootDir,host,port,relayDbPath,canonicalDbPath,rawRoot,piaCollectorEnabled};
}

export async function runWebServer({
  config=readWebConfig(),
  pachinkoConfig=undefined,
  logger=message=>console.log(message),
  startCoordinator=options=>startCoordinatorProcess({...options,logger}),
  startPiaCollector=options=>startPiaPublicCollectorScheduler({...options,logger}),
  startPachinkoCollector=options=>startPachinkoCollectorScheduler({...options,logger})
}={}){
  if(!config||typeof config!=='object')throw new TypeError('config is required');
  if(typeof startCoordinator!=='function'||typeof startPachinkoCollector!=='function')throw new TypeError('start functions must be functions');
  const {rootDir,host,port,relayDbPath,canonicalDbPath,rawRoot,piaCollectorEnabled=false}=config;
  const pConfig=pachinkoConfig===undefined?readPachinkoConfig(process.env,{canonicalDbPath,relayDbPath,rootDir}):pachinkoConfig;

  let coordinatorRuntime=null,piaCollectorRuntime=null,pachinkoCollectorRuntime=null;
  if(canonicalDbPath){
    coordinatorRuntime=await startCoordinator({dbPath:canonicalDbPath,installSignalHandlers:false});
  }

  const server=createWebServer({
    rootDir,
    relayDbPath,
    canonicalDbPath,
    rawRoot,
    pachinkoDbPath:pConfig?.dbPath??null,
    enterCollectorBarrier:coordinatorRuntime?.enterCollectorBarrier??(async()=>({ok:true,noCoordinator:true}))
  });

  try{
    server.listen(port,host);
    await once(server,'listening');
  }catch(error){
    try{await coordinatorRuntime?.stop?.()}catch{}
    throw error;
  }

  if(coordinatorRuntime){
    server.once('close',()=>{
      Promise.resolve(coordinatorRuntime?.stop?.()).catch(error=>{
        try{logger(JSON.stringify({level:'error',event:'coordinator_stop_failed',message:String(error?.message??error)}))}catch{}
      });
    });
  }

  if(canonicalDbPath&&rawRoot&&piaCollectorEnabled){
    piaCollectorRuntime=startPiaCollector({dbPath:canonicalDbPath,rawRoot,enterCollectorBarrier:coordinatorRuntime?.enterCollectorBarrier??(async()=>({ok:true,noCoordinator:true}))});
  }

  if(piaCollectorRuntime){
    server.once('close',()=>{try{piaCollectorRuntime.stop?.()}catch{}});
  }

  if(pConfig?.collectorEnabled){
    pachinkoCollectorRuntime=startPachinkoCollector({dbPath:pConfig.dbPath,archiveRoot:pConfig.archiveRoot,timeoutMs:pConfig.timeoutMs,retryMs:pConfig.retryMs,windowStartMinutes:pConfig.windowStartMinutes,windowEndMinutes:pConfig.windowEndMinutes});
    server.once('close',()=>{Promise.resolve(pachinkoCollectorRuntime.stop?.()).catch(error=>{try{logger(JSON.stringify({level:'error',event:'pachinko_collector_stop_failed',message:String(error?.message??error)}))}catch{}})});
  }

  const address=server.address();
  logger(JSON.stringify({
    level:'info',
    event:'web_listening',
    host,
    port:typeof address==='object'&&address?address.port:port,
    rootDir:path.resolve(rootDir),
    relayDbPath:path.resolve(relayDbPath),
    canonicalDbPath:canonicalDbPath?path.resolve(canonicalDbPath):null,
    rawRoot:rawRoot?path.resolve(rawRoot):null,
    coordinatorMode:canonicalDbPath?'web-supervised':'disabled',
    piaCollectorMode:canonicalDbPath&&rawRoot&&piaCollectorEnabled?'enabled':'disabled',
    pachinkoMode:pConfig?.dbPath?'read-only-api':'disabled',
    pachinkoCollectorMode:pConfig?.collectorEnabled?'enabled':'disabled'
  }));
  return server;
}

function installShutdown(server){
  let stopping=false;
  const stop=signal=>{
    if(stopping)return;
    stopping=true;
    console.log(JSON.stringify({level:'info',event:'web_stopping',signal}));
    server.close(error=>{
      if(error){
        console.error(JSON.stringify({level:'error',event:'web_stop_failed',message:String(error?.message??error)}));
        process.exitCode=1;
      }
    });
  };
  process.once('SIGTERM',()=>stop('SIGTERM'));
  process.once('SIGINT',()=>stop('SIGINT'));
}

const direct=process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(direct){
  runWebServer().then(installShutdown).catch(error=>{
    console.error(JSON.stringify({level:'error',event:'web_start_failed',message:String(error?.stack??error)}));
    process.exitCode=1;
  });
}
