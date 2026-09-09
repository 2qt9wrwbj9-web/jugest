import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
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

test('GET /api/health returns a small JSON health response',async t=>{
  await withServer(t,async base=>{
    const response=await fetch(`${base}/api/health`);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'application/json; charset=utf-8');
    const body=await response.json();
    assert.deepEqual(body,{ok:true,service:'jugest-vps-web'});
  });
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
