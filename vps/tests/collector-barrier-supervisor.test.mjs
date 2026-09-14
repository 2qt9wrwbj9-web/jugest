import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {startCoordinatorProcess} from '../src/coordinator-supervisor.mjs';

class FakeChild extends EventEmitter{
  constructor(){super();this.pid=1234;this.exitCode=null;this.signalCode=null;this.connected=true;this.sent=[];this.killCalls=[]}
  send(message){this.sent.push(message);return true}
  kill(signal='SIGTERM'){this.killCalls.push(signal);return true}
}

function noRestartTimer(){return {unref(){}}}

test('supervisor coalesces concurrent Collector barrier requests and resolves on matching ACK',async()=>{
  const child=new FakeChild();
  const runtime=startCoordinatorProcess({dbPath:'/tmp/jugest-test.sqlite',spawnProcess:()=>child,setTimer:noRestartTimer,clearTimer:()=>{},logger:()=>{},barrierTimeoutMs:1000});
  const first=runtime.enterCollectorBarrier();
  const second=runtime.enterCollectorBarrier();
  assert.equal(child.sent.length,1,'concurrent Pushes should share one in-flight barrier request');
  const request=child.sent[0];
  assert.equal(request.type,'collector_barrier_enter');
  assert.ok(request.requestId);
  child.emit('message',{type:'collector_barrier_ack',requestId:request.requestId,ok:true});
  const [a,b]=await Promise.all([first,second]);
  assert.equal(a.ok,true);assert.equal(b.ok,true);
  await runtime.stop();
});

test('supervisor treats missing Coordinator child as a safe barrier no-op',async()=>{
  const child=new FakeChild();
  const runtime=startCoordinatorProcess({dbPath:'/tmp/jugest-test.sqlite',spawnProcess:()=>child,setTimer:noRestartTimer,clearTimer:()=>{},logger:()=>{},barrierTimeoutMs:1000});
  child.exitCode=1;child.emit('exit',1,null);
  const result=await runtime.enterCollectorBarrier();
  assert.equal(result.ok,true);
  assert.equal(result.noCoordinator,true);
  assert.equal(child.sent.length,0);
  await runtime.stop();
});

test('supervisor fails closed when a live Coordinator never acknowledges the barrier',async()=>{
  const child=new FakeChild();
  const runtime=startCoordinatorProcess({dbPath:'/tmp/jugest-test.sqlite',spawnProcess:()=>child,setTimer:setTimeout,clearTimer:clearTimeout,logger:()=>{},barrierTimeoutMs:20});
  await assert.rejects(runtime.enterCollectorBarrier(),/collector barrier/i);
  await runtime.stop();
});
