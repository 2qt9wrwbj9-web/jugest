import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createJugestMcpHandler} from '../src/mcp-handler.mjs';

async function withMcpServer(t,{judgeMachines=async({machines})=>({machines})}={},run){
  const handler=createJugestMcpHandler({rootDir:'/tmp/jugest-test-root',judgeMachines});
  const server=http.createServer((req,res)=>{
    Promise.resolve(handler(req,res)).catch(error=>{
      if(!res.headersSent)res.writeHead(500,{'content-type':'application/json'});
      res.end(JSON.stringify({error:String(error?.message||error)}));
    });
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(async()=>{
    server.closeAllConnections?.();
    await new Promise(resolve=>server.close(resolve));
  });
  const {port}=server.address();
  await run(`http://127.0.0.1:${port}/mcp`);
}

async function rpc(url,body,headers={}){
  return await fetch(url,{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json, text/event-stream',...headers},
    body:typeof body==='string'?body:JSON.stringify(body)
  });
}

test('MCP initialize advertises a stateless read-only JUGEST tool server',async t=>{
  await withMcpServer(t,{},async url=>{
    const response=await rpc(url,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}}});
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type')||'',/^application\/json/);
    const body=await response.json();
    assert.equal(body.jsonrpc,'2.0');
    assert.equal(body.id,1);
    assert.equal(body.result.protocolVersion,'2025-06-18');
    assert.equal(body.result.serverInfo.name,'jugest');
    assert.equal(body.result.serverInfo.version,'6.0.2');
    assert.equal(body.result.capabilities.tools.listChanged,false);
    assert.match(body.result.instructions,/observed machine data/i);
    assert.match(body.result.instructions,/PRE/i);
  });
});

test('MCP tools/list exposes observed-data-only batch judgement with read-only annotations',async t=>{
  await withMcpServer(t,{},async url=>{
    const response=await rpc(url,{jsonrpc:'2.0',id:2,method:'tools/list',params:{}});
    assert.equal(response.status,200);
    const body=await response.json();
    const tool=body.result.tools.find(item=>item.name==='judge_machines');
    assert.ok(tool);
    assert.match(tool.description,/does not mix/i);
    assert.deepEqual(tool.inputSchema.required,['machines']);
    assert.equal(tool.inputSchema.properties.machines.maxItems,200);
    assert.equal(tool.annotations.readOnlyHint,true);
    assert.equal(tool.annotations.destructiveHint,false);
    assert.equal(tool.annotations.idempotentHint,true);
    assert.equal(tool.annotations.openWorldHint,false);
  });
});

test('MCP tools/call delegates judgement to JUGEST and returns structured content',async t=>{
  const seen=[];
  const judgeMachines=async input=>{
    seen.push(input);
    return {machines:[{machineNo:'101',machine:'my',expectedSetting:4.2,q:[0.01,0.04,0.15,0.35,0.3,0.15]}]};
  };
  await withMcpServer(t,{judgeMachines},async url=>{
    const args={machines:[{machineNo:'101',machine:'my',games:5000,bb:20,rb:18,diff:100}]};
    const response=await rpc(url,{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'judge_machines',arguments:args}});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.deepEqual(seen,[{rootDir:'/tmp/jugest-test-root',...args}]);
    assert.equal(body.result.isError,undefined);
    assert.deepEqual(body.result.structuredContent,{machines:[{machineNo:'101',machine:'my',expectedSetting:4.2,q:[0.01,0.04,0.15,0.35,0.3,0.15]}]});
    assert.equal(body.result.content[0].type,'text');
    assert.deepEqual(JSON.parse(body.result.content[0].text),body.result.structuredContent);
  });
});

test('MCP returns protocol errors and tool errors without crashing the server',async t=>{
  const judgeMachines=async()=>{throw new TypeError('unsupported machine: nope')};
  await withMcpServer(t,{judgeMachines},async url=>{
    const unknown=await rpc(url,{jsonrpc:'2.0',id:4,method:'no/such/method',params:{}});
    const unknownBody=await unknown.json();
    assert.equal(unknown.status,200);
    assert.equal(unknownBody.error.code,-32601);

    const badJson=await rpc(url,'{');
    const badBody=await badJson.json();
    assert.equal(badJson.status,400);
    assert.equal(badBody.error.code,-32700);

    const tool=await rpc(url,{jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'judge_machines',arguments:{machines:[{machine:'nope',games:100,bb:1,rb:1}]}}});
    const toolBody=await tool.json();
    assert.equal(tool.status,200);
    assert.equal(toolBody.result.isError,true);
    assert.match(toolBody.result.content[0].text,/unsupported machine/i);

    const notification=await rpc(url,{jsonrpc:'2.0',method:'notifications/initialized',params:{}});
    assert.equal(notification.status,202);
    assert.equal(await notification.text(),'');
  });
});
