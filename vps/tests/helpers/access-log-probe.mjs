import {readFileSync} from 'node:fs';
import http from 'node:http';
import {once} from 'node:events';
import {createAccessHandler} from '../../src/access/handler.mjs';
import assert from 'node:assert/strict';
const input=JSON.parse(readFileSync(0,'utf8')),origin='https://jugest.net';
const access=createAccessHandler({config:{dbPath:input.dbPath,origin,rpID:'jugest.net',now:()=>input.now}});
const server=http.createServer((req,res)=>access.handle(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');
try{
  const base='http://127.0.0.1:'+server.address().port;
  for(const [route,body,status] of [['viewer/redeem',{code:input.code},200],['register/options',{token:input.token},200],['login/verify',{flowId:'bad',response:{id:input.token}},400]]){
    const response=await fetch(base+'/api/access/'+route,{method:'POST',headers:{origin,cookie:input.cookie,'content-type':'application/json','x-jugest-access':'1'},body:JSON.stringify(body)});assert.equal(response.status,status);await response.text();
  }
  const viewed=await fetch(base+'/api/access/viewer/status',{headers:{cookie:input.viewerCookie}});assert.equal(viewed.status,200);await viewed.text();
  const logout=await fetch(base+'/api/access/viewer/logout',{method:'POST',headers:{origin,cookie:input.viewerCookie,'content-type':'application/json','x-jugest-access':'1'},body:'{}'});assert.equal(logout.status,200);await logout.text();
}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
