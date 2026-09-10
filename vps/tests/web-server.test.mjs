import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {createWebServer} from '../src/web-server.mjs';

async function withServer(t,run){
  const root=await mkdtemp(path.join(tmpdir(),'jugest-web-'));
  await writeFile(path.join(root,'index.html'),'<!doctype html><title>JUGEST TEST</title>');
  await writeFile(path.join(root,'app.js'),'console.log("jugest")');
  await mkdir(path.join(root,'assets'));
  await writeFile(path.join(root,'assets','logo.svg'),'<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  await mkdir(path.join(root,'vps'));
  await writeFile(path.join(root,'vps','secret.txt'),'nope');
  const server=createWebServer({rootDir:root});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(async()=>{
    server.closeAllConnections?.();
    await new Promise(resolve=>server.close(resolve));
    await rm(root,{recursive:true,force:true});
  });
  const {port}=server.address();
  await run(`http://127.0.0.1:${port}`);
}

async function withRepositoryServer(t,run){
  const root=fileURLToPath(new URL('../..',import.meta.url));
  const server=createWebServer({rootDir:root});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(async()=>{
    server.closeAllConnections?.();
    await new Promise(resolve=>server.close(resolve));
  });
  const {port}=server.address();
  await run(`http://127.0.0.1:${port}`);
}

async function startRelayServer(rootDir,relayDbPath){
  const server=createWebServer({rootDir,relayDbPath});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const {port}=server.address();
  let closed=false;
  return {
    base:`http://127.0.0.1:${port}`,
    close:async()=>{
      if(closed)return;
      closed=true;
      server.closeAllConnections?.();
      await new Promise(resolve=>server.close(resolve));
    }
  };
}

test('GET /api/health returns a small JSON health response',async t=>{
  await withServer(t,async base=>{
    const response=await fetch(`${base}/api/health`);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'application/json; charset=utf-8');
    const body=await response.json();
    assert.deepEqual(body,{ok:true,service:'jugest-vps-web'});
  });
});

test('POST /api/relay serves Collector V2 and persists relay auth across restart',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'jugest-relay-web-'));
  const relayDbPath=path.join(root,'relay.sqlite');
  await writeFile(path.join(root,'index.html'),'<!doctype html><title>JUGEST RELAY TEST</title>');
  t.after(()=>rm(root,{recursive:true,force:true}));

  const first=await startRelayServer(root,relayDbPath);
  t.after(()=>first.close());
  const createdResponse=await fetch(`${first.base}/api/relay`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({action:'createIosCollector'})
  });
  assert.equal(createdResponse.status,200);
  const created=await createdResponse.json();
  assert.equal(created.ok,true);
  assert.match(String(created.channelId||''),/^[A-Za-z0-9_-]+$/);
  assert.match(String(created.receiverToken||''),/^[A-Za-z0-9_-]+$/);
  assert.match(String(created.collectorKey||''),/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  await first.close();

  const second=await startRelayServer(root,relayDbPath);
  t.after(()=>second.close());
  const rotatedResponse=await fetch(`${second.base}/api/relay`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      action:'rotateIosCollectorKey',
      channelId:created.channelId,
      receiverToken:created.receiverToken
    })
  });
  assert.equal(rotatedResponse.status,200);
  const rotated=await rotatedResponse.json();
  assert.equal(rotated.ok,true);
  assert.notEqual(rotated.collectorKey,created.collectorKey);
});

test('GET / serves index.html from the configured JUGEST web root',async t=>{
  await withServer(t,async base=>{
    const response=await fetch(`${base}/`);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'text/html; charset=utf-8');
    assert.match(await response.text(),/JUGEST TEST/);
  });
});

test('static assets are served with useful content types',async t=>{
  await withServer(t,async base=>{
    const js=await fetch(`${base}/app.js`);
    assert.equal(js.status,200);
    assert.equal(js.headers.get('content-type'),'text/javascript; charset=utf-8');
    const svg=await fetch(`${base}/assets/logo.svg`);
    assert.equal(svg.status,200);
    assert.equal(svg.headers.get('content-type'),'image/svg+xml');
  });
});

test('home-screen icon URLs referenced by index.html are served by the VPS root',async t=>{
  await withRepositoryServer(t,async base=>{
    for(const name of ['favicon-32.png','apple-touch-icon.png','icon-192.png','icon-512.png']){
      const response=await fetch(`${base}/${name}`);
      assert.equal(response.status,200,`${name} should be available at the web root`);
      assert.equal(response.headers.get('content-type'),'image/png');
      const bytes=Buffer.from(await response.arrayBuffer());
      assert.ok(bytes.length>1000,`${name} should contain a real PNG payload`);
      assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10],`${name} should have a PNG signature`);
    }
  });
});

test('sensitive repository directories are never exposed',async t=>{
  await withServer(t,async base=>{
    const response=await fetch(`${base}/vps/secret.txt`);
    assert.equal(response.status,404);
  });
});

test('missing files return 404 and mutating methods return 405',async t=>{
  await withServer(t,async base=>{
    assert.equal((await fetch(`${base}/missing.js`)).status,404);
    const post=await fetch(`${base}/`,{method:'POST'});
    assert.equal(post.status,405);
    assert.equal(post.headers.get('allow'),'GET, HEAD');
  });
});
