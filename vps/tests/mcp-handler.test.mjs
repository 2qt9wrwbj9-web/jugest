import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createJugestMcpHandler} from '../src/mcp-handler.mjs';

async function withMcpServer(t,{judgeMachines=async({machines})=>({machines}),analyticsHandler=null}={},run){
  const handler=createJugestMcpHandler({rootDir:'/tmp/jugest-test-root',judgeMachines,analyticsHandler});
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

test('MCP tools/list exposes store data and PRE as separate read-only tools',async t=>{
  await withMcpServer(t,{},async url=>{
    const response=await rpc(url,{jsonrpc:'2.0',id:20,method:'tools/list',params:{}});
    const body=await response.json();
    const names=body.result.tools.map(tool=>tool.name);
    for(const name of ['list_stores','get_store_days','get_store_day','get_store_read','get_store_comparison']){
      assert.ok(names.includes(name),`${name} should be listed`);
      const tool=body.result.tools.find(item=>item.name===name);
      assert.equal(tool.annotations.readOnlyHint,true);
      assert.equal(tool.annotations.destructiveHint,false);
    }
    assert.match(body.result.tools.find(item=>item.name==='get_store_read').description,/separate/i);
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

test('store tools reuse existing analytics routes and expand packed receiver auth',async t=>{
  const seen=[];
  const analyticsHandler=async(req,res)=>{
    seen.push({method:req.method,url:req.url,headers:{...req.headers}});
    const payload={ok:true,route:req.url};
    const body=Buffer.from(JSON.stringify(payload));
    res.writeHead(200,{'content-type':'application/json; charset=utf-8','content-length':String(body.length)});
    res.end(body);
  };
  await withMcpServer(t,{analyticsHandler},async url=>{
    const headers={authorization:'Bearer channel-abc123:receiver-secret'};
    const calls=[
      ['list_stores',{},'/api/vps/stores'],
      ['get_store_days',{storeId:'store-1',limit:44},'/api/vps/stores/store-1/days?limit=44'],
      ['get_store_day',{storeId:'store-1',date:'2026-09-19'},'/api/vps/stores/store-1/days/2026-09-19'],
      ['get_store_read',{storeId:'store-1'},'/api/vps/stores/store-1/research/store-read'],
      ['get_store_comparison',{storeId:'store-1',limit:123},'/api/vps/stores/store-1/research/comparison?limit=123']
    ];
    let id=30;
    for(const [name,args,expectedPath] of calls){
      const response=await rpc(url,{jsonrpc:'2.0',id:id++,method:'tools/call',params:{name,arguments:args}},headers);
      assert.equal(response.status,200);
      const body=await response.json();
      assert.equal(body.result.isError,undefined,`${name} should succeed`);
      assert.deepEqual(body.result.structuredContent,{ok:true,route:expectedPath});
    }
    assert.deepEqual(seen.map(item=>item.url),calls.map(item=>item[2]));
    assert.ok(seen.every(item=>item.method==='GET'));
    assert.ok(seen.every(item=>item.headers['x-jugest-channel-id']==='channel-abc123'));
    assert.ok(seen.every(item=>item.headers.authorization==='Bearer receiver-secret'));
  });
});

test('store tools preserve normal two-header receiver auth and bound API limits',async t=>{
  const seen=[];
  const analyticsHandler=async(req,res)=>{
    seen.push({url:req.url,headers:{...req.headers}});
    const body=Buffer.from(JSON.stringify({ok:true}));
    res.writeHead(200,{'content-type':'application/json','content-length':String(body.length)});
    res.end(body);
  };
  await withMcpServer(t,{analyticsHandler},async url=>{
    const headers={'x-jugest-channel-id':'channel-normal','authorization':'Bearer receiver-normal'};
    for(const [name,args,expected] of [
      ['get_store_days',{storeId:'store-1',limit:9999},'/api/vps/stores/store-1/days?limit=366'],
      ['get_store_comparison',{storeId:'store-1',limit:-4},'/api/vps/stores/store-1/research/comparison?limit=1']
    ]){
      const response=await rpc(url,{jsonrpc:'2.0',id:50,method:'tools/call',params:{name,arguments:args}},headers);
      const body=await response.json();
      assert.equal(body.result.isError,undefined);
      assert.equal(seen.at(-1).url,expected);
      assert.equal(seen.at(-1).headers['x-jugest-channel-id'],'channel-normal');
      assert.equal(seen.at(-1).headers.authorization,'Bearer receiver-normal');
    }
  });
});

test('analytics API failures become MCP tool errors without leaking into judgement',async t=>{
  const analyticsHandler=async(req,res)=>{
    const body=Buffer.from(JSON.stringify({ok:false,code:'unauthorized'}));
    res.writeHead(401,{'content-type':'application/json','content-length':String(body.length)});
    res.end(body);
  };
  await withMcpServer(t,{analyticsHandler},async url=>{
    const response=await rpc(url,{jsonrpc:'2.0',id:60,method:'tools/call',params:{name:'list_stores',arguments:{}}});
    const body=await response.json();
    assert.equal(body.result.isError,true);
    assert.match(body.result.content[0].text,/unauthorized/i);
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
