function headerObject(headers={}){
  const out=new Headers();
  for(const [key,value] of Object.entries(headers||{})){
    if(value==null)continue;
    if(Array.isArray(value))for(const item of value)out.append(key,String(item));
    else out.set(key,String(value));
  }
  return out;
}

function requestBody(req){
  if(['GET','HEAD'].includes(String(req.method||'GET').toUpperCase()))return undefined;
  const body=req.body;
  if(body==null)return undefined;
  if(typeof body==='string'||body instanceof Uint8Array||Buffer.isBuffer(body))return body;
  return JSON.stringify(body);
}

export async function runWebHandler(req,res,handler){
  const proto=String(req.headers?.['x-forwarded-proto']||req.headers?.['X-Forwarded-Proto']||'https').split(',')[0].trim()||'https';
  const host=String(req.headers?.host||req.headers?.Host||'localhost');
  const path=String(req.url||'/');
  const url=/^https?:\/\//i.test(path)?path:`${proto}://${host}${path.startsWith('/')?path:'/'+path}`;
  const init={method:String(req.method||'GET').toUpperCase(),headers:headerObject(req.headers)};
  const body=requestBody(req);if(body!==undefined)init.body=body;
  const webReq=new Request(url,init);
  const webRes=await handler(webReq);
  for(const [k,v] of webRes.headers.entries())res.setHeader(k,v);
  const buf=Buffer.from(await webRes.arrayBuffer());
  if(typeof res.status==='function')res.status(webRes.status);else res.statusCode=webRes.status;
  if(!buf.length&&typeof res.end==='function')return res.end();
  const contentType=String(webRes.headers.get('content-type')||'');
  const payload=/^(text\/|application\/(json|javascript|xml))/i.test(contentType)?buf.toString('utf8'):buf;
  if(typeof res.send==='function')return res.send(payload);
  if(typeof res.end==='function')return res.end(payload);
  res.body=payload;return res;
}
