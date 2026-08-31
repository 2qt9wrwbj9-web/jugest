import fs from 'node:fs';
const original=fs.readFileSync(new URL('../netlify/functions/relay.mjs',import.meta.url),'utf8');
const source=original.replace("import { getStore } from '@netlify/blobs';","const getStore=globalThis.__relayGetStore;");
class MemStore{
  constructor(){this.m=new Map()}
  async setJSON(key,value,opt={}){if(opt.onlyIfNew&&this.m.has(key))return{modified:false};this.m.set(key,structuredClone(value));return{modified:true,etag:'x'}}
  async get(key,{type}={}){const v=this.m.get(key);return v==null?null:structuredClone(v)}
  async list({prefix=''}={}){return{blobs:[...this.m.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key,etag:'x'})),directories:[]}}
  async delete(key){this.m.delete(key)}
}
const mem=new MemStore();globalThis.__relayGetStore=()=>mem;
const mod=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const handler=mod.default;
const call=async(origin,body)=>{
  const req=new Request('https://jugglerest.netlify.app/api/relay',{method:'POST',headers:{'content-type':'application/json','origin':origin},body:JSON.stringify(body)});
  const res=await handler(req,{});return{status:res.status,body:await res.json()};
};
let x=await call('https://jugglerest.netlify.app',{action:'createPair'});
if(x.status!==200||!/^\d{6}$/.test(x.body.code)||!x.body.receiverToken)throw new Error('createPair failed');
const pair=x.body;
x=await call('https://ana-slo.com',{action:'claimPair',code:pair.code});
if(x.status!==200||x.body.channelId!==pair.channelId||!x.body.senderToken)throw new Error('claimPair failed');
const sender=x.body.senderToken;
x=await call('https://jugglerest.netlify.app',{action:'pairStatus',channelId:pair.channelId,receiverToken:pair.receiverToken});
if(!x.body.linked)throw new Error('pair status not linked');
const payload={format:'juggler-external-import-bulk',version:6,source:'ana-slo',shop:'新規テスト店',days:[{date:'2026-08-23',machines:[{machine:'im',tableNo:'1',games:8000,diff:1000,bb:31,rb:30}]}]};
x=await call('https://ana-slo.com',{action:'send',channelId:pair.channelId,senderToken:sender,batchId:'b1',chunkIndex:1,chunkTotal:1,payload});
if(x.status!==200||!x.body.messageId)throw new Error('send failed');
x=await call('https://jugglerest.netlify.app',{action:'peek',channelId:pair.channelId,receiverToken:pair.receiverToken});
if(x.body.count!==1||x.body.next.shop!=='新規テスト店')throw new Error('peek failed');
x=await call('https://jugglerest.netlify.app',{action:'receive',channelId:pair.channelId,receiverToken:pair.receiverToken});
if(x.body.count!==1||x.body.message.payload.shop!=='新規テスト店')throw new Error('receive failed');
const messageId=x.body.message.messageId;
x=await call('https://jugglerest.netlify.app',{action:'ack',channelId:pair.channelId,receiverToken:pair.receiverToken,messageId});
if(x.status!==200)throw new Error('ack failed');
x=await call('https://jugglerest.netlify.app',{action:'peek',channelId:pair.channelId,receiverToken:pair.receiverToken});
if(x.body.count!==0)throw new Error('ack did not delete message');
x=await call('https://ana-slo.com',{action:'send',channelId:pair.channelId,senderToken:'wrong',payload});
if(x.status!==401)throw new Error('bad sender token accepted');
console.log('relay function: ok');
