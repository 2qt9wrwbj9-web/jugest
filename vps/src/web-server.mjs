import http from 'node:http';
import path from 'node:path';
import {createReadStream} from 'node:fs';
import {realpath,stat} from 'node:fs/promises';
import {getGeneratedIcon} from './icon-assets.mjs';
import {createVpsRelayHandler} from './relay-handler.mjs';
import {createAnalyticsHandler} from './analytics-handler.mjs';
import {createDeviceBackfillHandler} from './device-backfill-handler.mjs';

const BLOCKED_TOP_LEVEL=new Set(['.git','.github','vps','docs','tests','research','probes']);
const MIME_TYPES=new Map([
  ['.html','text/html; charset=utf-8'],
  ['.css','text/css; charset=utf-8'],
  ['.js','text/javascript; charset=utf-8'],
  ['.mjs','text/javascript; charset=utf-8'],
  ['.json','application/json; charset=utf-8'],
  ['.webmanifest','application/manifest+json; charset=utf-8'],
  ['.svg','image/svg+xml'],
  ['.png','image/png'],
  ['.jpg','image/jpeg'],
  ['.jpeg','image/jpeg'],
  ['.webp','image/webp'],
  ['.ico','image/x-icon'],
  ['.txt','text/plain; charset=utf-8'],
  ['.woff','font/woff'],
  ['.woff2','font/woff2']
]);

function send(res,status,body='',headers={}){
  const data=Buffer.isBuffer(body)?body:Buffer.from(body);
  res.writeHead(status,{'content-length':String(data.length),...headers});
  if(res.req?.method==='HEAD')res.end();
  else res.end(data);
}

function requestPath(rawUrl){
  let pathname;
  try{
    pathname=new URL(rawUrl||'/','http://127.0.0.1').pathname;
    pathname=decodeURIComponent(pathname);
  }catch{
    return null;
  }
  if(pathname.includes('\0')||pathname.includes('\\'))return null;
  const segments=pathname.split('/').filter(Boolean);
  if(segments.some(segment=>segment==='.'||segment==='..'||segment.startsWith('.')))return null;
  if(segments.length&&BLOCKED_TOP_LEVEL.has(segments[0]))return null;
  return segments;
}

async function resolveStaticFile(rootDir,segments){
  const root=await realpath(rootDir);
  const requested=segments.length?path.join(root,...segments):path.join(root,'index.html');
  let info;
  try{info=await stat(requested)}catch{return null}
  let target=requested;
  if(info.isDirectory()){
    target=path.join(requested,'index.html');
    try{info=await stat(target)}catch{return null}
  }
  if(!info.isFile())return null;
  let resolved;
  try{resolved=await realpath(target)}catch{return null}
  const prefix=root.endsWith(path.sep)?root:`${root}${path.sep}`;
  if(resolved!==root&&!resolved.startsWith(prefix))return null;
  return {path:resolved,size:info.size,mtime:info.mtime};
}

export function createWebHandler({rootDir,relayDbPath=null,canonicalDbPath=null,rawRoot=null}={}){
  if(typeof rootDir!=='string'||!rootDir.trim())throw new TypeError('rootDir is required');
  const absoluteRoot=path.resolve(rootDir);
  const relayHandler=typeof relayDbPath==='string'&&relayDbPath.trim()?createVpsRelayHandler({dbPath:relayDbPath,canonicalDbPath,rawRoot}):null;
  const analyticsHandler=typeof relayDbPath==='string'&&relayDbPath.trim()&&typeof canonicalDbPath==='string'&&canonicalDbPath.trim()
    ?createAnalyticsHandler({relayDbPath,canonicalDbPath})
    :null;
  const backfillHandler=typeof relayDbPath==='string'&&relayDbPath.trim()&&typeof canonicalDbPath==='string'&&canonicalDbPath.trim()&&typeof rawRoot==='string'&&rawRoot.trim()
    ?createDeviceBackfillHandler({relayDbPath,canonicalDbPath,rawRoot})
    :null;
  return async function jugestWebHandler(req,res){
    const url=new URL(req.url||'/','http://127.0.0.1');
    if(url.pathname==='/api/relay'){
      if(!relayHandler){
        send(res,404,'Not Found\n',{'content-type':'text/plain; charset=utf-8'});
        return;
      }
      return await relayHandler(req,res);
    }
    if(url.pathname==='/api/vps/backfill'){
      if(!backfillHandler){
        send(res,404,'Not Found\n',{'content-type':'text/plain; charset=utf-8'});
        return;
      }
      return await backfillHandler(req,res);
    }
    if(url.pathname==='/api/vps'||url.pathname.startsWith('/api/vps/')){
      if(!analyticsHandler){
        send(res,404,'Not Found\n',{'content-type':'text/plain; charset=utf-8'});
        return;
      }
      return await analyticsHandler(req,res);
    }

    if(req.method!=='GET'&&req.method!=='HEAD'){
      send(res,405,'Method Not Allowed\n',{'content-type':'text/plain; charset=utf-8','allow':'GET, HEAD'});
      return;
    }

    if(url.pathname==='/api/health'){
      const body=JSON.stringify({ok:true,service:'jugest-vps-web'});
      send(res,200,body,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
      return;
    }

    const segments=requestPath(req.url);
    if(!segments){
      send(res,404,'Not Found\n',{'content-type':'text/plain; charset=utf-8'});
      return;
    }

    const file=await resolveStaticFile(absoluteRoot,segments);
    if(!file){
      const icon=segments.length===1?await getGeneratedIcon(absoluteRoot,segments[0]):null;
      if(icon){
        send(res,200,icon,{
          'content-type':'image/png',
          'x-content-type-options':'nosniff',
          'cache-control':'public, max-age=300'
        });
        return;
      }
      send(res,404,'Not Found\n',{'content-type':'text/plain; charset=utf-8'});
      return;
    }

    const ext=path.extname(file.path).toLowerCase();
    const contentType=MIME_TYPES.get(ext)||'application/octet-stream';
    const headers={
      'content-type':contentType,
      'content-length':String(file.size),
      'last-modified':file.mtime.toUTCString(),
      'x-content-type-options':'nosniff',
      'cache-control':ext==='.html'?'no-cache':'public, max-age=300'
    };
    res.writeHead(200,headers);
    if(req.method==='HEAD'){
      res.end();
      return;
    }
    const stream=createReadStream(file.path);
    stream.on('error',()=>{
      if(!res.headersSent)send(res,500,'Internal Server Error\n',{'content-type':'text/plain; charset=utf-8'});
      else res.destroy();
    });
    stream.pipe(res);
  };
}

export function createWebServer(options={}){
  const handler=createWebHandler(options);
  return http.createServer((req,res)=>{
    Promise.resolve(handler(req,res)).catch(error=>{
      console.error(JSON.stringify({level:'error',event:'web_request_failed',message:String(error?.message??error)}));
      if(!res.headersSent)send(res,500,'Internal Server Error\n',{'content-type':'text/plain; charset=utf-8'});
      else res.destroy(error);
    });
  });
}
