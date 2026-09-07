import {randomBytes} from 'node:crypto';

export const stateKey=id=>`collector-state-v3/${id}`;
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const prefixes=id=>['ios-job','ios-lease','ios-failure','ios-coverage'].map(p=>`${p}/${id}/`);
const fixed=id=>[`channel/${id}`,`collector-index/${id}`,`ios-collector-config/${id}`,`ios-window/${id}`,`batch-control/${id}`];
const conflict=e=>Number(e?.status||e?.statusCode||e?.response?.status)===412||e?.name==='BlobPreconditionFailedError'||e?.constructor?.name==='BlobPreconditionFailedError';
const fail=message=>{throw new Error(message)};

export async function readCollectorState(base,id){
  if(typeof base.getWithMetadata!=='function')fail('Conditional Blob store is required');
  const rec=await base.getWithMetadata(stateKey(id));
  if(!rec)return null;
  const v=rec.value;
  if(!rec.etag||v?.version!==3||v.channelId!==id||!v.values||!v.days||!Array.isArray(v.garbage)||!Array.isArray(v.legacyKeys))fail('Collector snapshot is invalid');
  return rec;
}

async function migrate(base,id,channel){
  const values={[`channel/${id}`]:clone(channel)},legacyKeys=[];
  const readLegacy=async key=>{
    const raw=await base.get(key,{useCache:false});
    return raw==null?null:JSON.parse(raw);
  };
  for(const key of fixed(id).slice(1,4)){
    const v=await readLegacy(key);
    if(v!=null){values[key]=v;legacyKeys.push(key)}
  }
  for(const prefix of prefixes(id)){
    const page=await base.list({prefix});
    for(const {key} of page.blobs){
      const v=await readLegacy(key);
      if(v!=null){values[key]=v;legacyKeys.push(key)}
    }
  }
  return{version:3,channelId:id,revision:0,values,days:{},garbage:[],legacyKeys};
}

// All legacy Collector key operations below are in-memory within one snapshot.
// Daily payloads stay outside metadata; the unchanged pull API resolves pointers.
function transactionStore(base,id,state){
  const fixedKeys=new Set(fixed(id)),managedPrefixes=prefixes(id),pending=new Map(),packs=new Map(),external=[];
  const managed=k=>fixedKeys.has(k)||managedPrefixes.some(p=>k.startsWith(p));
  const daily=k=>k.startsWith(`collector-day/${id}/`);
  const store={
    async get(key,options={}){
      if(managed(key))return clone(state.values[key]??null);
      if(daily(key)){
        if(pending.has(key))return clone(pending.get(key));
        if(Object.hasOwn(state.days,key)){
          const ref=state.days[key];if(!ref)return null;
          if(!packs.has(ref.pack))packs.set(ref.pack,await base.get(ref.pack,{type:'json',useCache:false}));
          const pack=packs.get(ref.pack),rec=pack?.days?.[key];
          if(pack?.version!==3||pack.channelId!==id||!rec)fail('Collector payload pack is missing or invalid');
          return clone(rec);
        }
      }
      return await base.get(key,{...options,useCache:false});
    },
    async setJSON(key,value,options={}){
      if(managed(key)){
        if(options.onlyIfNew&&Object.hasOwn(state.values,key))return{modified:false};
        // A status poll with identical local coverage is a read, not a write.
        if(key.startsWith(`ios-coverage/${id}/`)){
          const old=state.values[key];
          if(old&&JSON.stringify({...old,updatedAt:0})===JSON.stringify({...value,updatedAt:0}))return{modified:false};
        }
        state.values[key]=clone(value);return{modified:true};
      }
      if(daily(key)){pending.set(key,clone(value));return{modified:true}}
      external.push(()=>base.setJSON(key,value,options));return{modified:true};
    },
    async set(key,value,options={}){external.push(()=>base.set(key,value,options));return{modified:true}},
    async delete(key){
      if(managed(key)){delete state.values[key];return}
      if(daily(key)){
        pending.delete(key);state.days[key]=null;
        state.garbage.push(key);return;
      }
      external.push(()=>base.delete(key));
    },
    async list({prefix=''}){
      if(managedPrefixes.some(p=>prefix.startsWith(p)))return{blobs:Object.keys(state.values).filter(k=>k.startsWith(prefix)).map(key=>({key}))};
      return await base.list({prefix});
    }
  };
  return{store,pending,external};
}

// Retain a cleanup journal until all deletes are acknowledged. Retrying cleanup
// is safe. This extra write occurs only for cleanup, never a normal fresh batch.
async function drainGarbage(base,id,committed){
  if(!committed.garbage.length)return;
  for(const key of new Set(committed.garbage))await base.delete(key);
  for(let n=0;n<5;n++){
    const latest=await readCollectorState(base,id);if(!latest)return;
    const done=new Set(committed.garbage),state=latest.value;
    state.garbage=state.garbage.filter(k=>!done.has(k));state.revision++;
    try{await base.setJSON(stateKey(id),state,{ifMatch:latest.etag});return}catch(e){if(!conflict(e))throw e}
  }
}

export async function transactCollector(base,id,initial,channel,operation){
  let snapshot=initial;
  for(let attempt=0;attempt<8;attempt++){
    if(attempt)snapshot=await readCollectorState(base,id);
    const state=snapshot?clone(snapshot.value):await migrate(base,id,channel);
    const before=JSON.stringify(state),oldPacks=new Set(Object.values(state.days).filter(Boolean).map(x=>x.pack));
    const tx=transactionStore(base,id,state);
    const {response,commit=true}=await operation(tx.store,state);
    if(!commit)return response;
    let packKey='';
    if(tx.pending.size){
      packKey=`collector-pack-v3/${id}/${Date.now()}-${randomBytes(18).toString('hex')}`;
      const put=await base.setJSON(packKey,{version:3,channelId:id,days:Object.fromEntries(tx.pending)},{onlyIfNew:true});
      if(!put?.modified)fail('Collector payload name collision');
      for(const key of tx.pending.keys())state.days[key]={pack:packKey};
    }
    const active=new Set(Object.values(state.days).filter(Boolean).map(x=>x.pack));
    for(const key of oldPacks)if(!active.has(key))state.garbage.push(key);
    state.garbage=[...new Set(state.garbage)];
    if(JSON.stringify(state)!==before||!snapshot){
      state.revision++;
      try{
        const put=await base.setJSON(stateKey(id),state,snapshot?{ifMatch:snapshot.etag}:{onlyIfNew:true});
        if(!put?.modified){
          if(packKey)await base.delete(packKey);
          continue;
        }
      }catch(e){
        // On an ambiguous network error the commit may have succeeded. Never
        // delete the payload in that case; a replay will consult its receipt.
        if(!conflict(e))throw e;
        if(packKey)await base.delete(packKey);
        continue;
      }
    }
    for(const fn of tx.external)await fn();
    await drainGarbage(base,id,state);
    return response;
  }
  throw Object.assign(new Error('Collectorの競合が続いています。同じ送信内容で再試行してください'),{status:409});
}

export function collectorReadStore(base,id,snapshot){
  const view=transactionStore(base,id,clone(snapshot.value)).store;
  // Message send/ack are independent of Collector metadata. They must still
  // reach durable storage when using a read-only view of channel authentication.
  return{...base,get:view.get,list:view.list};
}
