import assert from 'node:assert/strict';

function responseRecorder(){
  return {
    code:200,headers:{},body:null,
    status(n){this.code=n;return this},
    setHeader(k,v){this.headers[k.toLowerCase()]=String(v)},
    send(v){this.body=v;return this},
    end(v=''){this.body=v;return this},
    json(v){this.body=JSON.stringify(v);return this},
  };
}

const calls=[];
global.fetch=async (url,opts)=>{
  calls.push({url:String(url),opts});
  return new Response(JSON.stringify({ok:true,echo:'yes'}),{status:201,headers:{'content-type':'application/json; charset=utf-8'}});
};

for(const [name,upstream] of [['relay','https://jugglerest.netlify.app/api/relay'],['sync','https://jugglerest.netlify.app/api/sync']]){
  const mod=await import(`../api/${name}.js?x=${Date.now()}-${name}`);
  const res=responseRecorder();
  await mod.default({method:'POST',body:{action:'ping'}},res);
  assert.equal(calls.at(-1).url,upstream);
  assert.equal(calls.at(-1).opts.method,'POST');
  assert.equal(calls.at(-1).opts.headers.origin,'https://jugglerest.netlify.app');
  assert.equal(calls.at(-1).opts.body,JSON.stringify({action:'ping'}));
  assert.equal(res.code,201);
  assert.match(String(res.body),/"ok":true/);
}
console.log('Vercel Netlify proxy behavior PASS');
