import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createWebServer} from '../src/web-server.mjs';

async function withServer(t,run){
  const root=await mkdtemp(path.join(tmpdir(),'jugest-mcp-'));
  await writeFile(path.join(root,'index.html'),'<!doctype html><title>JUGEST MCP TEST</title>');
  const server=createWebServer({rootDir:root,mcpEnabled:true});
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

async function mcp(base,message,headers={}){
  const response=await fetch(`${base}/mcp`,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'accept':'application/json, text/event-stream',
      ...headers
    },
    body:JSON.stringify(message)
  });
  const text=await response.text();
  return {response,body:text?JSON.parse(text):null};
}

test('MCP initialize advertises JUGEST instructions and tools capability',async t=>{
  await withServer(t,async base=>{
    const {response,body}=await mcp(base,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}});
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type')||'',/^application\/json/);
    assert.equal(body.jsonrpc,'2.0');
    assert.equal(body.id,1);
    assert.equal(body.result.protocolVersion,'2025-11-25');
    assert.equal(body.result.serverInfo.name,'jugest');
    assert.equal(body.result.capabilities.tools.listChanged,false);
    assert.match(body.result.instructions,/目の前|observed|当日/i);
    assert.match(body.result.instructions,/PRE.*自動.*混ぜ|店読み.*自動.*混ぜ/i);
  });
});

test('tools/list exposes deterministic read-only JUGEST tools',async t=>{
  await withServer(t,async base=>{
    const {body}=await mcp(base,{jsonrpc:'2.0',id:2,method:'tools/list',params:{}});
    const names=body.result.tools.map(tool=>tool.name);
    assert.deepEqual(names,['judge_machines','list_stores','get_store_day','get_store_prediction','get_store_comparison']);
    for(const tool of body.result.tools){
      assert.equal(tool.annotations.readOnlyHint,true,tool.name);
      assert.equal(tool.annotations.destructiveHint,false,tool.name);
      assert.equal(tool.annotations.openWorldHint,false,tool.name);
    }
    const judge=body.result.tools[0];
    assert.equal(judge.inputSchema.properties.machines.type,'array');
    assert.match(judge.description,/G.*BB.*RB/i);
    assert.match(judge.description,/PRE|店読み/);
  });
});

test('judge_machines returns current-data-only batch judgement as structured content',async t=>{
  await withServer(t,async base=>{
    const {body}=await mcp(base,{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'judge_machines',arguments:{machines:[
      {tableNo:'101',machine:'マイジャグラーV',games:5230,bb:24,rb:18,diff:600},
      {tableNo:'102',machine:'ファンキー2',games:4800,bb:19,rb:15}
    ]}}});
    assert.equal(body.result.isError,false);
    assert.equal(body.result.structuredContent.mode,'current_data_only');
    assert.equal(body.result.structuredContent.machines.length,2);
    assert.equal(body.result.structuredContent.machines[0].tableNo,'101');
    assert.equal(body.result.structuredContent.machines[0].machine,'my');
    assert.equal(body.result.structuredContent.machines[0].method,'reverse-diff');
    assert.equal(body.result.structuredContent.machines[1].machine,'fk');
    assert.equal(body.result.structuredContent.machines[1].method,'bonus-only');
    assert.equal(body.result.structuredContent.preIncluded,false);
    assert.equal(body.result.structuredContent.storeTendencyIncluded,false);
    assert.equal(body.result.structuredContent.machines[0].q.length,6);
    assert.ok(body.result.structuredContent.machines[0].p4>=0&&body.result.structuredContent.machines[0].p4<=1);
    assert.match(body.result.content[0].text,/2台/);
  });
});

test('judge_machines rejects oversized or invalid batches as tool errors',async t=>{
  await withServer(t,async base=>{
    const bad=await mcp(base,{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'judge_machines',arguments:{machines:[{machine:'my',games:100,bb:80,rb:30}]}}});
    assert.equal(bad.body.result.isError,true);
    assert.match(bad.body.result.content[0].text,/bonus_count_exceeds_games/);

    const many=Array.from({length:251},(_,i)=>({tableNo:String(i+1),machine:'my',games:1000,bb:4,rb:3}));
    const oversized=await mcp(base,{jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'judge_machines',arguments:{machines:many}}});
    assert.equal(oversized.body.result.isError,true);
    assert.match(oversized.body.result.content[0].text,/250/);
  });
});

test('MCP endpoint is POST-only in stateless v1',async t=>{
  await withServer(t,async base=>{
    const response=await fetch(`${base}/mcp`);
    assert.equal(response.status,405);
    assert.equal(response.headers.get('allow'),'POST');
  });
});
