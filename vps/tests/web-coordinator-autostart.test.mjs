import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {runWebServer} from '../src/web-main.mjs';

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
