const cleanPart=value=>String(value||'').replace(/^\/+|\/+$/g,'').replace(/\.\./g,'_');

function isExistsError(error){
  const status=Number(error?.status||error?.statusCode||error?.response?.status||0);
  const code=String(error?.code||error?.name||'').toLowerCase();
  const message=String(error?.message||'').toLowerCase();
  return status===409||code.includes('already')||code.includes('exist')||message.includes('already exists')||message.includes('already exist');
}

async function streamText(stream){
  if(!stream)return'';
  if(typeof stream.text==='function')return await stream.text();
  return await new Response(stream).text();
}

export function makeBlobStore(name,client,{root='jugest'}={}){
  if(!client||typeof client.put!=='function'||typeof client.get!=='function'||typeof client.list!=='function'||typeof client.del!=='function')throw new Error('Vercel Blob client is incomplete');
  const prefix=`${cleanPart(root)}/${cleanPart(name)}/`;
  const full=key=>prefix+String(key||'').replace(/^\/+/, '');
  const relative=pathname=>String(pathname||'').startsWith(prefix)?String(pathname).slice(prefix.length):String(pathname||'');

  async function set(key,value,options={}){
    const onlyIfNew=options.onlyIfNew===true;
    try{
      const blob=await client.put(full(key),String(value??''),{
        access:'private',addRandomSuffix:false,allowOverwrite:!onlyIfNew,
        contentType:options.contentType||'text/plain; charset=utf-8',
      });
      return{modified:true,etag:blob?.etag||'',blob};
    }catch(error){
      if(onlyIfNew&&isExistsError(error))return{modified:false};
      throw error;
    }
  }

  async function setJSON(key,value,options={}){
    return await set(key,JSON.stringify(value),{...options,contentType:'application/json; charset=utf-8'});
  }

  async function get(key,options={}){
    const result=await client.get(full(key),{access:'private'});
    if(!result||result.statusCode===404)return null;
    const text=await streamText(result.stream);
    if(options.type==='json'){
      if(!text)return null;
      try{return JSON.parse(text)}catch{return null}
    }
    return text;
  }

  async function list({prefix:requestedPrefix=''}={}){
    const wanted=full(requestedPrefix),blobs=[];
    let cursor=undefined,guard=0;
    do{
      const page=await client.list({prefix:wanted,cursor,limit:1000});
      for(const item of page?.blobs||[])blobs.push({...item,key:relative(item.pathname||item.key)});
      cursor=page?.cursor||undefined;
      guard++;
    }while(cursor&&guard<1000);
    return{blobs};
  }

  async function del(key){await client.del(full(key));}

  return{set,setJSON,get,list,delete:del,_prefix:prefix};
}

let defaultClientPromise=null;
async function defaultClient(){
  if(!defaultClientPromise)defaultClientPromise=import('@vercel/blob').then(m=>({put:m.put,get:m.get,list:m.list,del:m.del}));
  return await defaultClientPromise;
}

export function createBlobStore(name,options={}){
  const lazy={
    put:async(...args)=>(await defaultClient()).put(...args),
    get:async(...args)=>(await defaultClient()).get(...args),
    list:async(...args)=>(await defaultClient()).list(...args),
    del:async(...args)=>(await defaultClient()).del(...args),
  };
  return makeBlobStore(name,lazy,options);
}
