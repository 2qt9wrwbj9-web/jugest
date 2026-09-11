import {createHash} from 'node:crypto';

function canonicalValue(value,path='$'){
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'){
    if(!Number.isFinite(value))throw new TypeError(`non-finite number is unsupported at ${path}`);
    return value;
  }
  if(Array.isArray(value))return value.map((item,index)=>canonicalValue(item,`${path}[${index}]`));
  if(typeof value==='object'){
    const out={};
    for(const key of Object.keys(value).sort()){
      const item=value[key];
      if(item===undefined||typeof item==='function'||typeof item==='symbol'||typeof item==='bigint')throw new TypeError(`unsupported value at ${path}.${key}`);
      out[key]=canonicalValue(item,`${path}.${key}`);
    }
    return out;
  }
  throw new TypeError(`unsupported value at ${path}`);
}

export function canonicalJson(value){return JSON.stringify(canonicalValue(value));}
export function hashCanonical(value){return createHash('sha256').update(canonicalJson(value),'utf8').digest('hex');}
