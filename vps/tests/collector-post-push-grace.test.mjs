import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createWebServer} from '../src/web-server.mjs';

function yesterdayJst(){const d=new Date(Date.now()+9*60*60*1000);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)}
function slashDate(date){const [y,m,d]=date.split('-');return `${y}/${+m}/${+d}`}
const tableText=`\n全データ一覧\n機種名\n台番号\nG数\n差枚\nBB\nRB\nART\n合成確率\nBB確率\nRB確率\nART確率\nマイジャグラーV\n601\n2,727\n-94\n11\n7\n0\n1/151.5\n1/247.9\n1/389.6\n1/0.0\n機種別データピックアップ\n`;
async function call(base,body){const response=await fetch(`${base}/api/relay`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:response.status,json:await response.json()}}

test('completed PushV2 shortens Collector activity to a two-second post-push grace',async t=>{
  const root=mkdtempSync(path.join(tmpdir(),'jugest-collector-grace-'));
  writeFileSync(path.join(root,'index.html'),'<!doctype html>');
  const relayDbPath=path.join(root,'relay.sqlite'),canonicalDbPath=path.join(root,'jugest.sqlite'),rawRoot=path.join(root,'raw');
  const server=createWebServer({rootDir:root,relayDbPath,canonicalDbPath,rawRoot});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));rmSync(root,{recursive:true,force:true})});
  const base=`http://127.0.0.1:${server.address().port}`,date=yesterdayJst(),shop='通常店';
  const created=await call(base,{action:'createIosCollector'});
  await call(base,{action:'iosCollectorTargetUpsert',channelId:created.json.channelId,receiverToken:created.json.receiverToken,url:`https://ana-slo.com/${date}-%E9%80%9A%E5%B8%B8%E5%BA%97-data/`,startDate:date,priority:2,enabled:true});
  const next=await call(base,{action:'iosCollectorNextV2',collectorKey:created.json.collectorKey});
  const pushed=await call(base,{action:'iosCollectorPushV2',collectorKey:created.json.collectorKey,jobToken:next.json.jobToken,text:`${slashDate(date)}\n${shop}\n${tableText}`,fetchUrl:next.json.url});
  assert.equal(pushed.status,200);
  const remaining=Number(readFileSync(`${canonicalDbPath}.collector-activity`,'utf8'))-Date.now();
  assert.ok(remaining>0&&remaining<=2500,`post-push Collector grace should be about 2s, got ${remaining}ms`);
});
