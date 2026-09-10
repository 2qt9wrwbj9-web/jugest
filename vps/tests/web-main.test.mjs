import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readWebConfig,runWebServer} from '../src/web-main.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';

test('readWebConfig accepts explicit VPS web and relay settings',()=>{
  const config=readWebConfig({
    JUGEST_WEB_ROOT:'/opt/jugest/current',
    JUGEST_WEB_HOST:'127.0.0.1',
    JUGEST_WEB_PORT:'3100',
    JUGEST_RELAY_DB:'/srv/jugest/relay.sqlite'
  });
  assert.deepEqual(config,{
    rootDir:path.resolve('/opt/jugest/current'),
    host:'127.0.0.1',
    port:3100,
    relayDbPath:path.resolve('/srv/jugest/relay.sqlite')
  });
});

test('readWebConfig defaults relay storage to persistent VPS state',()=>{
  const config=readWebConfig({JUGEST_WEB_PORT:'3000'});
  assert.equal(config.relayDbPath,path.resolve('/var/lib/jugest/relay.sqlite'));
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
