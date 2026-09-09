import path from 'node:path';
import {once} from 'node:events';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createWebServer} from './web-server.mjs';

const DEFAULT_WEB_ROOT=fileURLToPath(new URL('../..',import.meta.url));

export function readWebConfig(env=process.env){
  const rootDir=path.resolve(env.JUGEST_WEB_ROOT||DEFAULT_WEB_ROOT);
  const host=String(env.JUGEST_WEB_HOST||'127.0.0.1').trim();
  const rawPort=env.JUGEST_WEB_PORT??'3000';
  const port=Number(rawPort);
  if(!host)throw new TypeError('JUGEST_WEB_HOST must not be empty');
  if(!Number.isInteger(port)||port<1||port>65535)throw new TypeError('JUGEST_WEB_PORT must be an integer from 1 to 65535');
  return {rootDir,host,port};
}

export async function runWebServer({config=readWebConfig(),logger=message=>console.log(message)}={}){
  if(!config||typeof config!=='object')throw new TypeError('config is required');
  const {rootDir,host,port}=config;
  const server=createWebServer({rootDir});
  server.listen(port,host);
  await once(server,'listening');
  const address=server.address();
  logger(JSON.stringify({
    level:'info',
    event:'web_listening',
    host,
    port:typeof address==='object'&&address?address.port:port,
    rootDir:path.resolve(rootDir)
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
