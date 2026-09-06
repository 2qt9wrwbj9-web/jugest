import assert from 'node:assert/strict';
import { runWebHandler } from '../api/_node-web.js';

const seen=[];
const handler=async req=>{
  seen.push({url:req.url,method:req.method,origin:req.headers.get('origin'),body:req.method==='POST'?await req.json():null});
  return new Response(JSON.stringify({ok:true}),{status:201,headers:{'content-type':'application/json; charset=utf-8','x-test':'yes'}});
};
const res={statusCode:0,headers:{},body:null,setHeader(k,v){this.headers[k.toLowerCase()]=String(v)},status(n){this.statusCode=n;return this},send(v){this.body=v;return this},end(v=''){this.body=v;return this}};
await runWebHandler({method:'POST',url:'/api/test?x=1',headers:{host:'preview.vercel.app','x-forwarded-proto':'https',origin:'https://preview.vercel.app'},body:{a:1}},res,handler);
assert.equal(res.statusCode,201);
assert.equal(res.headers['x-test'],'yes');
assert.match(String(res.body),/"ok":true/);
assert.equal(seen[0].url,'https://preview.vercel.app/api/test?x=1');
assert.equal(seen[0].origin,'https://preview.vercel.app');
assert.deepEqual(seen[0].body,{a:1});
console.log('Vercel Node/Web adapter PASS');
