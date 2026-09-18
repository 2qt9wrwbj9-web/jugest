import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createWebServer} from '../src/web-server.mjs';

const REPO_ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));

async function closeServer(server){
  if(!server.listening)return;
  await new Promise((resolveClose,reject)=>server.close(error=>error?reject(error):resolveClose()));
}

test('JUGEST web server exposes observed-only judge_machines over MCP Streamable HTTP',async()=>{
  const server=createWebServer({rootDir:REPO_ROOT});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  assert.ok(address&&typeof address==='object');

  const client=new Client({name:'jugest-mcp-test',version:'1.0.0'});
  const transport=new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`));
  try{
    await client.connect(transport);
    const listed=await client.listTools();
    const judge=listed.tools.find(tool=>tool.name==='judge_machines');
    assert.ok(judge);
    assert.match(judge.description??'',/observed/i);
    assert.deepEqual(Object.keys(judge.inputSchema.properties??{}),['machines']);

    const result=await client.callTool({
      name:'judge_machines',
      arguments:{machines:[{tableNo:'701',machine:'マイジャグラーV',games:4200,bb:20,rb:17,diff:650}]}
    });
    assert.notEqual(result.isError,true);
    assert.equal(result.structuredContent?.accepted,1);
    assert.equal(result.structuredContent?.rejected,0);
    assert.equal(result.structuredContent?.rows?.[0]?.machineKey,'my');
    assert.equal(result.structuredContent?.rows?.[0]?.tableNo,'701');
  }finally{
    try{await client.close()}catch{}
    await closeServer(server);
  }
});
