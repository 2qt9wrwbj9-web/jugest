import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {runWebServer} from '../src/web-main.mjs';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';

async function fixture(t){
  const root=await mkdtemp(path.join(tmpdir(),'jugest-web-coordinator-'));
  await writeFile(path.join(root,'index.html'),'<title>JUGEST</title>');
  t.after(()=>rm(root,{recursive:true,force:true}));
  return {
    root,
    config:{
      rootDir:root,
      host:'127.0.0.1',
      port:0,
      relayDbPath:path.join(root,'relay.sqlite'),
      canonicalDbPath:path.join(root,'jugest.sqlite'),
      rawRoot:path.join(root,'raw')
    }
  };
}

async function closeServer(server){
  server.closeAllConnections?.();
  await new Promise(resolve=>server.close(resolve));
}

async function waitForSchedulerSample(dbPath,{attempts=40,delayMs=50}={}){
  for(let i=0;i<attempts;i+=1){
    try{
      const db=openDatabase(dbPath);migrate(db);
      const count=Number(db.prepare('SELECT COUNT(*) AS n FROM resource_samples').get().n)||0;
      db.close();
      if(count>0)return true;
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
  return false;
}

test('web runtime starts coordinator against the same canonical database',async t=>{
  const fx=await fixture(t);
  const calls=[];
  const server=await runWebServer({
    config:fx.config,
    logger:()=>{},
    startCoordinator:async options=>{
      calls.push(options);
      return {stop:async()=>{}};
    }
  });
  t.after(()=>closeServer(server));

  assert.equal(calls.length,1);
  assert.equal(calls[0].dbPath,fx.config.canonicalDbPath);
  assert.equal(calls[0].installSignalHandlers,false);
});

test('closing the web server stops the embedded coordinator runtime',async t=>{
  const fx=await fixture(t);
  let stops=0;
  const server=await runWebServer({
    config:fx.config,
    logger:()=>{},
    startCoordinator:async()=>({stop:async()=>{stops+=1;}})
  });

  await closeServer(server);
  assert.equal(stops,1);
});

test('default web runtime produces scheduler evidence without a separate service',async t=>{
  const fx=await fixture(t);
  const server=await runWebServer({config:fx.config,logger:()=>{}});
  t.after(()=>closeServer(server));

  assert.equal(await waitForSchedulerSample(fx.config.canonicalDbPath),true);
});
