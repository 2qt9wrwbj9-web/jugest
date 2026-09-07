import {makeBlobStore} from '../../api/_blob-store.js';

// SDK boundary, not a replacement transaction implementation. Every call and
// rejected conditional write is counted. Hooks model concurrent invocations and
// an acknowledgement lost after durable storage.
export function instrumentedBlob(){
  const db=new Map(),calls=[];let seq=0;
  const hooks={beforePut:null,afterPut:null};
  const error=(status,message)=>Object.assign(new Error(message),{status});
  const client={
    async put(path,body,options={}){
      calls.push({op:'put',path,options});await hooks.beforePut?.(path,body,options);
      if(options.ifMatch&&db.get(path)?.etag!==options.ifMatch)throw error(412,'precondition');
      if(db.has(path)&&options.allowOverwrite!==true)throw error(409,'already exists');
      const rec={text:String(body),etag:`"v${++seq}"`,pathname:path};db.set(path,rec);
      await hooks.afterPut?.(path,body,options);return rec;
    },
    async get(path,options={}){
      calls.push({op:'get',path,options});const rec=db.get(path);
      return rec?{statusCode:200,blob:{etag:rec.etag,pathname:path},stream:new Blob([rec.text]).stream()}:null;
    },
    async list({prefix='',cursor,limit=1000}={}){
      calls.push({op:'list',path:prefix});const all=[...db.keys()].filter(k=>k.startsWith(prefix)).sort();
      const offset=Number(cursor)||0,part=all.slice(offset,offset+limit);
      return{blobs:part.map(pathname=>({pathname})),cursor:offset+part.length<all.length?String(offset+part.length):undefined};
    },
    async del(path){calls.push({op:'delete',path});db.delete(path)}
  };
  const s=makeBlobStore('juggler-relay-v1',client);
  return{db,calls,hooks,s,reset(){calls.length=0},counts(){
    const c={get:0,put:0,list:0,delete:0};for(const x of calls)c[x.op]++;
    return{...c,advanced:c.put+c.list};
  }};
}

export function samplePage(date,shop,count=10){
  const [y,m,d]=date.split('-').map(Number);
  const rows=Array.from({length:count},(_,i)=>`マイジャグラーV\n${601+i}\n2,727\n-94\n11\n7\n0\n1/151.5\n1/247.9\n1/389.6\n1/0.0`).join('\n');
  return `${y}/${m}/${d}\n${shop}\n全データ一覧\n機種名\n台番号\nG数\n差枚\nBB\nRB\nART\n合成確率\nBB確率\nRB確率\nART確率\n${rows}\n機種別データピックアップ\n`;
}
