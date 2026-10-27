import {createHash} from 'node:crypto';
// Byte-for-byte equivalent to the original canonicalJson for JSON contracts.
// Walk the existing object without creating a sorted duplicate of the model.
function canonicalKeys(value){const numeric=[],other=[];for(const key of Object.keys(value)){const n=Number(key);(Number.isInteger(n)&&n>=0&&n<4294967295&&String(n)===key?numeric:other).push(key)}return numeric.sort((a,b)=>Number(a)-Number(b)).concat(other.sort())}
function* tokens(value,jsonCompatible=false,path='$'){
 if(value===null||typeof value==='string'||typeof value==='boolean'){yield JSON.stringify(value);return}
 if(typeof value==='number'){if(!Number.isFinite(value)){if(!jsonCompatible)throw new TypeError('non-finite number is unsupported at '+path);yield 'null'}else yield JSON.stringify(value);return}
 if(Array.isArray(value)){yield '[';for(let i=0;i<value.length;i++){if(i)yield ',';if(!(i in value)){yield 'null';continue}if(jsonCompatible&&(value[i]===undefined||typeof value[i]==='function'||typeof value[i]==='symbol'))yield 'null';else yield* tokens(value[i],jsonCompatible,path+'['+i+']')}yield ']';return}
 if(typeof value==='object'){yield '{';let first=true;for(const key of canonicalKeys(value)){const item=value[key];if(item===undefined||typeof item==='function'||typeof item==='symbol'||typeof item==='bigint'){if(jsonCompatible&&typeof item!=='bigint')continue;throw new TypeError('unsupported value at '+path+'.'+key)}if(!first)yield ',';first=false;yield JSON.stringify(key);yield ':';yield* tokens(item,jsonCompatible,path+'.'+key)}yield '}';return}
 throw new TypeError('unsupported value at '+path);
}
export function* canonicalBytes(value,{jsonCompatible=false}={}){const encoder=new TextEncoder();let pieces=[],size=0;for(const token of tokens(value,jsonCompatible)){pieces.push(token);size+=token.length;if(size>=32768){yield encoder.encode(pieces.join(''));pieces=[];size=0}}if(pieces.length)yield encoder.encode(pieces.join(''))}
export function canonicalDigest(value,options){const hash=createHash('sha256');let size=0;for(const bytes of canonicalBytes(value,options)){hash.update(bytes);size+=bytes.byteLength}return{hash:hash.digest('hex'),size}}
export async function digestObject(object,{range}={}){
 function hasher(){if(typeof crypto.DigestStream==='function'){const stream=new crypto.DigestStream('SHA-256'),writer=stream.getWriter();return{update:bytes=>writer.write(bytes),async end(){await writer.close();return[...new Uint8Array(await stream.digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}}}const hash=createHash('sha256');return{update:bytes=>hash.update(bytes),end:()=>hash.digest('hex')}}
 const whole=hasher(),portion=range?hasher():null,reader=object.body.getReader();let size=0,rangeSize=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;await whole.update(value);if(portion){const from=Math.max(0,range.offset-size),to=Math.min(value.length,range.offset+range.length-size);if(to>from){await portion.update(value.subarray(from,to));rangeSize+=to-from}}size+=value.byteLength}}finally{reader.releaseLock()}
 return{hash:await whole.end(),size,...(portion?{rangeHash:await portion.end(),rangeSize}:{})};
}
export async function putCanonical(bucket,key,value,{onStage=()=>{},jsonCompatible=false,verify=true}={}){
 const digest=canonicalDigest(value,{jsonCompatible}),metadata={sha256:digest.hash};
 if(digest.size<1024*1024){const body=new Uint8Array(digest.size);let offset=0;for(const chunk of canonicalBytes(value,{jsonCompatible})){body.set(chunk,offset);offset+=chunk.length}await bucket.put(key,body,{onlyIf:{etagDoesNotMatch:'*'},customMetadata:metadata});onStage('result:upload-part')}
 else{
  const partSize=256*1024,parts=[];let buffer=new Uint8Array(partSize),offset=0,index=0;
  async function flush(){if(!offset)return;const bytes=buffer.subarray(0,offset),partKey=key+'.parts/'+(++index),hash=createHash('sha256').update(bytes).digest('hex');await bucket.put(partKey,bytes,{onlyIf:{etagDoesNotMatch:'*'},customMetadata:{sha256:hash}});parts.push({key:partKey,size:offset,hash});buffer=new Uint8Array(partSize);offset=0;onStage('result:upload-part')}
  for(const bytes of canonicalBytes(value,{jsonCompatible})){let pos=0;while(pos<bytes.length){const n=Math.min(partSize-offset,bytes.length-pos);buffer.set(bytes.subarray(pos,pos+n),offset);pos+=n;offset+=n;if(offset===partSize)await flush()}}await flush();
  await bucket.put(key,JSON.stringify({format:'jugest-json-chunks-v1',hash:digest.hash,size:digest.size,parts}),{onlyIf:{etagDoesNotMatch:'*'},customMetadata:{...metadata,format:'jugest-json-chunks-v1'}});
 }
 if(verify){const object=await openCanonicalObject(bucket,key);if(!object||(await digestObject(object)).hash!==digest.hash)throw Error('result_upload_verification_failed')}return digest;
}
export async function openCanonicalObject(bucket,key,{range,expectedEtag}={}){
 const object=await bucket.get(key,expectedEtag?{onlyIf:{etagMatches:expectedEtag}}:undefined),initialBody=object?.body;if(!initialBody)return null;
 if(object.customMetadata?.format!=='jugest-json-chunks-v1'){
  if(!range)return{body:initialBody,etag:object.etag,customMetadata:object.customMetadata,text:()=>new Response(initialBody).text()};
  await initialBody.cancel();const ranged=await bucket.get(key,{range,onlyIf:{etagMatches:object.etag}});if(!ranged)return null;const body=ranged.body;return{body,etag:ranged.etag,text:()=>new Response(body).text()};
 }
 const manifest=await new Response(initialBody).json();if(manifest.format!=='jugest-json-chunks-v1'||!Array.isArray(manifest.parts)||manifest.parts.reduce((n,p)=>n+p.size,0)!==manifest.size)throw Error('result_manifest_invalid');
 const begin=range?.offset??0,end=begin+(range?.length??manifest.size),parts=[];let offset=0;
 for(const p of manifest.parts){const next=offset+p.size;if(next>begin&&offset<end)parts.push({...p,from:Math.max(0,begin-offset),to:Math.min(p.size,end-offset)});offset=next}
 let index=0;const body=new ReadableStream({async pull(controller){if(index>=parts.length){controller.close();return}const part=parts[index++],data=await bucket.get(part.key);if(!data)throw Error('result_chunk_missing');const bytes=new Uint8Array(await data.arrayBuffer());if(bytes.length!==part.size||createHash('sha256').update(bytes).digest('hex')!==part.hash)throw Error('result_chunk_hash_mismatch');controller.enqueue(bytes.subarray(part.from,part.to))}});
 return{body,etag:object.etag,customMetadata:object.customMetadata,async text(){return new Response(body).text()}};
}
export function payloadRange(envelope,payloadSize){let prefix='{',first=true;for(const key of Object.keys(envelope).sort()){if(!first)prefix+=',';first=false;prefix+=JSON.stringify(key)+':';if(key==='payload')return{offset:new TextEncoder().encode(prefix).length,length:payloadSize};prefix+=JSON.stringify(envelope[key])}throw Error('payload missing')}
