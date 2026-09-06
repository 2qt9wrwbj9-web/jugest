// Local verification only. All Relay/Sync storage is isolated in memory.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {relayHarness,payload} from './relay.mjs';
import {syncHarness} from './sync-server.mjs';
const relay=relayHarness(),sync=syncHarness();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'};
const sender=`<!doctype html><meta charset="utf-8"><title>Local Collector fixture</title><h1>Local Collector fixture</h1><p>一時テストデータ専用。実際のBlobには接続しません。</p><form method="POST" action="/__claim"><label>6桁コード <input name="code" inputmode="numeric"></label><button>claimPairしてテストデータを送信</button></form>`;
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost:4173');
 if(u.pathname==='/__sender'){res.setHeader('Content-Type',types['.html']);res.end(sender);return}
 if(u.pathname==='/__claim'&&req.method==='POST'){let raw='';for await(const c of req)raw+=c;const code=new URLSearchParams(raw).get('code');const linked=await relay.call({action:'claimPair',code});if(!linked.ok)throw Error(linked.message);const sent=await relay.call({action:'send',channelId:linked.channelId,senderToken:linked.senderToken,payload});res.setHeader('Content-Type',types['.html']);res.end(`<meta charset="utf-8"><h1>${sent.ok?'連携・テストデータ送信済み':'送信失敗'}</h1>`);return}
 if(u.pathname==='/api/relay'||u.pathname==='/api/sync'){let body='';for await(const c of req)body+=c;const backend=u.pathname==='/api/relay'?relay:sync;const r=await backend.fetch(u.pathname,{method:req.method,headers:{'content-type':'application/json'},body});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text());return}
 if(u.pathname==='/__mobile'){res.setHeader('Content-Type',types['.html']);res.end('<!doctype html><meta charset="utf-8"><title>JUGEST 390px review</title><iframe title="JUGEST mobile review" src="/" style="width:390px;height:844px;border:1px solid #555"></iframe>');return}
 const rel=u.pathname==='/'?'index.html':u.pathname.slice(1);if(rel.includes('..'))throw Error('invalid path');
 const data=await fs.readFile(path.join('public',rel));res.setHeader('Content-Type',types[path.extname(rel)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);
 }catch(e){res.statusCode=500;res.end(String(e.message))}});
server.listen(4173,'0.0.0.0',()=>console.log('Local fixture preview http://localhost:4173 (memory storage only)'));
