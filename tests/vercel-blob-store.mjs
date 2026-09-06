import assert from 'node:assert/strict';
import { makeBlobStore } from '../api/_blob-store.js';

const db=new Map();
let seq=0;
const client={
  async put(path,body,opts={}){
    if(db.has(path)&&!opts.allowOverwrite){const e=new Error('already exists');e.status=409;throw e}
    if(opts.ifMatch&&db.get(path)?.etag!==opts.ifMatch){const e=new Error('precondition');e.status=412;throw e}
    const text=typeof body==='string'?body:String(body);
    const rec={text,etag:`e${++seq}`,pathname:path,url:`https://blob.invalid/${path}`};db.set(path,rec);return rec;
  },
  async get(path){const rec=db.get(path);if(!rec)return null;return{statusCode:200,blob:{etag:rec.etag,pathname:path},stream:new Blob([rec.text]).stream()}},
  async list({prefix='',cursor,limit=2}={}){const all=[...db.keys()].filter(k=>k.startsWith(prefix)).sort();const start=cursor?Number(cursor):0,part=all.slice(start,start+limit);return{blobs:part.map(pathname=>({pathname})),cursor:start+part.length<all.length?String(start+part.length):undefined}},
  async del(path){db.delete(path)}
};

const s=makeBlobStore('relay',client,{root:'jugest'});
let out=await s.setJSON('channel/a',{n:1},{onlyIfNew:true});
assert.equal(out.modified,true);
out=await s.setJSON('channel/a',{n:2},{onlyIfNew:true});
assert.equal(out.modified,false,'onlyIfNew must not overwrite an existing blob');
assert.deepEqual(await s.get('channel/a',{type:'json'}),{n:1});
await s.setJSON('channel/a',{n:3});
assert.deepEqual(await s.get('channel/a',{type:'json'}),{n:3});
await s.set('message/a/1','hello');
await s.set('message/a/2','world');
await s.set('message/a/3','!');
const listed=await s.list({prefix:'message/a/'});
assert.deepEqual(listed.blobs.map(x=>x.key),['message/a/1','message/a/2','message/a/3']);
assert.equal(await s.get('message/a/1'),'hello');
await s.delete('message/a/1');
assert.equal(await s.get('message/a/1'),null);
assert.ok([...db.keys()].every(k=>k.startsWith('jugest/relay/')),'all keys must be namespaced');
console.log('Vercel Blob compatibility store PASS');
