import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readWebConfig,runWebServer} from '../src/web-main.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';

test('readWebConfig accepts explicit VPS web, relay, canonical DB, raw, and MCP settings',()=>{
  const config=readWebConfig({
    JUGEST_WEB_ROOT:'/opt/jugest/current',
    JUGEST_WEB_HOST:'127.0.0.1',
    JUGEST_WEB_PORT:'3100',
    JUGEST_RELAY_DB:'/srv/jugest/relay.sqlite',
    JUGEST_DB_PATH:'/srv/jugest/jugest.sqlite',
    JUGEST_RAW_ROOT:'/srv/jugest/raw',
    JUGEST_MCP_ENABLED:'1'
  });
  assert.deepEqual(config,{
    rootDir:path.resolve('/opt/jugest/current'),
    host:'127.0.0.1',
    port:3100,
    relayDbPath:path.resolve('/srv/jugest/relay.sqlite'),
    canonicalDbPath:path.resolve('/srv/jugest/jugest.sqlite'),
    rawRoot:path.resolve('/srv/jugest/raw'),
    mcpEnabled:true
  });
});

test('readWebConfig defaults Relay and canonical storage to persistent VPS state with MCP disabled',()=>{
  const config=readWebConfig({JUGEST_WEB_PORT:'3000'});
  assert.equal(config.relayDbPath,path.resolve('/var/lib/jugest/relay.sqlite'));
  assert.equal(config.canonicalDbPath,path.resolve('/var/lib/jugest/jugest.sqlite'));
  assert.equal(config.rawRoot,path.resolve('/var/lib/jugest/raw'));
  assert.equal(config.mcpEnabled,false);
});

test('readWebConfig accepts only explicit truthy MCP values and otherwise fails closed',()=>{
  for(const value of ['1','true','TRUE','yes','on'])assert.equal(readWebConfig({JUGEST_WEB_PORT:'3000',JUGEST_MCP_ENABLED:value}).mcpEnabled,true,value);
  for(const value of [undefined,'','0','false','no','off','garbage'])assert.equal(readWebConfig({JUGEST_WEB_PORT:'3000',JUGEST_MCP_ENABLED:value}).mcpEnabled,false,String(value));
});

test('readWebConfig rejects an invalid port instead of silently binding elsewhere',()=>{
  assert.throws(()=>readWebConfig({JUGEST_WEB_PORT:'70000'}),/JUGEST_WEB_PORT/);
  assert.throws(()=>readWebConfig({JUGEST_WEB_PORT:'abc'}),/JUGEST_WEB_PORT/);
});

test('runWebServer starts the HTTP service on the requested listener with MCP off unless enabled',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'jugest-web-main-'));
  await writeFile(path.join(root,'index.html'),'<title>JUGEST</title>');
  const server=await runWebServer({
    config:{rootDir:root,host:'127.0.0.1',port:0,relayDbPath:path.join(root,'relay.sqlite'),mcpEnabled:false},
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
  const mcp=await fetch(`http://127.0.0.1:${port}/mcp`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'ping'})});
  assert.equal(mcp.status,404);
});
