import path from 'node:path';
import {once} from 'node:events';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createWebServer} from './web-server.mjs';

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
  if(!host)throw new TypeError('JUGEST_WEB_HOST must not be empty');
  if(!Number.isInteger(port)||port<1||port>65535)throw new TypeError('JUGEST_WEB_PORT must be an integer from 1 to 65535');
  return {rootDir,host,port,relayDbPath,canonicalDbPath,rawRoot};
}

export async function runWebServer({config=readWebConfig(),logger=message=>console.log(message)}={}){
  if(!config||typeof config!=='object')throw new TypeError('config is required');
  const {rootDir,host,port,relayDbPath,canonicalDbPath,rawRoot}=config;
  const server=createWebServer({rootDir,relayDbPath,canonicalDbPath,rawRoot});
  server.listen(port,host);
  await once(server,'listening');
  const address=server.address();
  logger(JSON.stringify({
    level:'info',
    event:'web_listening',
    host,
    port:typeof address==='object'&&address?address.port:port,
    rootDir:path.resolve(rootDir),
    relayDbPath:path.resolve(relayDbPath),
    canonicalDbPath:canonicalDbPath?path.resolve(canonicalDbPath):null,
    rawRoot:rawRoot?path.resolve(rawRoot):null
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
