import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readWebConfig,runWebServer} from '../src/web-main.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';

test('readWebConfig accepts explicit VPS web, relay, canonical DB, and raw settings',()=>{
  const config=readWebConfig({
    JUGEST_WEB_ROOT:'/opt/jugest/current',
    JUGEST_WEB_HOST:'127.0.0.1',
    JUGEST_WEB_PORT:'3100',
    JUGEST_RELAY_DB:'/srv/jugest/relay.sqlite',
    JUGEST_DB_PATH:'/srv/jugest/jugest.sqlite',
    JUGEST_RAW_ROOT:'/srv/jugest/raw'
  });
  assert.deepEqual(config,{
    rootDir:path.resolve('/opt/jugest/current'),
    host:'127.0.0.1',
    port:3100,
    relayDbPath:path.resolve('/srv/jugest/relay.sqlite'),
    canonicalDbPath:path.resolve('/srv/jugest/jugest.sqlite'),
    rawRoot:path.resolve('/srv/jugest/raw')
  });
});

test('readWebConfig defaults Relay and canonical storage to persistent VPS state',()=>{
  const config=readWebConfig({JUGEST_WEB_PORT:'3000'});
  assert.equal(config.relayDbPath,path.resolve('/var/lib/jugest/relay.sqlite'));
  assert.equal(config.canonicalDbPath,path.resolve('/var/lib/jugest/jugest.sqlite'));
  assert.equal(config.rawRoot,path.resolve('/var/lib/jugest/raw'));
});

test('readWebConfig rejects an invalid port instead of silently binding elsewhere',()=>{
  assert.throws(()=>readWebConfig({JUGEST_WEB_PORT:'70000'}),/JUGEST_WEB_PORT/);
  assert.throws(()=>readWebConfig({JUGEST_WEB_PORT:'abc'}),/JUGEST_WEB_PORT/);
});

test('runWebServer starts the HTTP service on the requested listener',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'jugest-web-main-'));
  await writeFile(path.join(root,'index.html'),'<title>JUGEST</title>');
  const server=await runWebServer({
    config:{rootDir:root,host:'127.0.0.1',port:0,relayDbPath:path.join(root,'relay.sqlite')},
    logger:()=>{}
  });
  t.after(async()=>{
    server.closeAllConnections?.();
    await new Promise(resolve=>server.close(resolve));
    await rm(root,{recursive:true,force:true});
  });
  const {port}=server.address();
  const response=await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(response.status,200);
});
