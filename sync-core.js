(function(global){
'use strict';

const APP_VERSION='5.0.0';
const SYNC_SCHEMA='juggler-device-sync';
const SYNC_VERSION=1;
const STATE_KEY='juggler_tool_state_v33';
const HANA_KEY='hanaJudgeStateV3';
const CLIENT_KEY='jugglerDeviceSync:v1';
const API='/api/sync';
const DB_NAME='juggler_tool_external_v1';
const DB_STORE='kv';
const EXTERNAL_KEY='externalDays';
const ANALYSIS_INDEX_KEY='storeAnalysisHistoryIndexV1';
const ANALYSIS_PREFIX='storeAnalysisSnapshotV1:';

const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const now=()=>Date.now();
const canon=v=>String(v??'').trim().replace(/\s+/g,' ');
const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const stamp=v=>Math.max(0,+v?.updatedAt||0,+v?.createdAt||0,+v?.trainedAt||0,+v?.scoredAt||0,+v?._syncUpdatedAt||0);
const randomBytes=n=>{const a=new Uint8Array(n);global.crypto.getRandomValues(a);return a};
const b64url=bytes=>{
  let bin=''; for(let i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const fromB64url=s=>{
  s=String(s||'').replace(/-/g,'+').replace(/_/g,'/');
  while(s.length%4)s+='=';
  const bin=atob(s),out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return out;
};
function stable(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
}
function hash32(value){
  const s=typeof value==='string'?value:stable(value); let h=2166136261>>>0;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0}
  return h.toString(16).padStart(8,'0');
}
function chooseNewer(a,b){
  if(!a)return clone(b); if(!b)return clone(a);
  const sa=stamp(a),sb=stamp(b);
  if(sb>sa)return clone(b); if(sa>sb)return clone(a);
  return stable(b).length>stable(a).length?clone(b):clone(a);
}
function mergeByKey(a,b,keyFn,limit=0){
  const m=new Map();
  for(const x of [...arr(a),...arr(b)]){
    if(!x)continue;
    const k=String(keyFn(x)||''); if(!k)continue;
    m.set(k,chooseNewer(m.get(k),x));
  }
  let out=[...m.values()];
  if(limit>0&&out.length>limit)out=out.sort((x,y)=>stamp(x)-stamp(y)).slice(-limit);
  return out;
}
function ensureSyncIds(items,deviceId,type){
  return arr(items).map((x,i)=>{
    const y=clone(x)||{};
    if(!y._syncId)y._syncId=`${deviceId}:${type}:${+y.createdAt||0}:${String(y.id??i)}:${hash32(y).slice(0,6)}`;
    return y;
  });
}
function mergeShops(local,remote){
  const out=[],byName=new Map(),localMap=new Map(),remoteMap=new Map();
  function add(x,side){
    if(!x||!canon(x.name))return;
    const name=canon(x.name),k=name;
    let cur=byName.get(k);
    if(!cur){
      cur=clone(x);cur.name=name;byName.set(k,cur);out.push(cur);
    }else{
      const baseCur=+cur.savedCoinBaseUpdatedAt||0,baseNew=+x.savedCoinBaseUpdatedAt||0,rateCur=+cur.financeRateUpdatedAt||0,rateNew=+x.financeRateUpdatedAt||0;
      const preferred=chooseNewer(cur,x),basePick=baseNew>baseCur?x:cur,ratePick=rateNew>rateCur?x:cur;
      const id=cur.id||x.id;
      Object.assign(cur,preferred,{id,name,createdAt:Math.min(+cur.createdAt||Infinity,+x.createdAt||Infinity),savedCoinBase:basePick.savedCoinBase,savedCoinBaseUpdatedAt:+basePick.savedCoinBaseUpdatedAt||0,loanCoinsPer1000:ratePick.loanCoinsPer1000??null,exchangeCoinsPer1000:ratePick.exchangeCoinsPer1000??null,financeRateUpdatedAt:+ratePick.financeRateUpdatedAt||0});
      if(!Number.isFinite(cur.createdAt))cur.createdAt=+preferred.createdAt||0;
    }
    (side==='local'?localMap:remoteMap).set(String(x.id??''),String(cur.id??''));
  }
  arr(local).forEach(x=>add(x,'local'));arr(remote).forEach(x=>add(x,'remote'));
  return{shops:out,localMap,remoteMap};
}
function mergeTags(local,remote){
  const out=[],byName=new Map(),localMap=new Map(),remoteMap=new Map();
  function add(x,side){
    if(!x||!canon(x.name))return;
    const name=canon(x.name),k=name;
    let cur=byName.get(k);
    if(!cur){cur=clone(x);cur.name=name;byName.set(k,cur);out.push(cur)}
    else{
      const pick=chooseNewer(cur,x);const id=cur.id||x.id;
      Object.assign(cur,pick,{id,name,active:cur.active!==false&&x.active!==false});
    }
    (side==='local'?localMap:remoteMap).set(String(x.id??''),String(cur.id??''));
  }
  arr(local).forEach(x=>add(x,'local'));arr(remote).forEach(x=>add(x,'remote'));
  return{tags:out,localMap,remoteMap};
}
function remapSession(r,shopMap,tagMap){
  const x=clone(r)||{};
  if(shopMap?.has(String(x.shopId??'')))x.shopId=shopMap.get(String(x.shopId??''));
  x.tagIds=arr(x.tagIds).map(id=>tagMap?.get(String(id))||String(id));
  return x;
}
function normalizeNumericIds(items){
  const used=new Set();let next=1;
  for(const x of items){
    let id=+x.id;
    if(Number.isInteger(id)&&id>0&&!used.has(id)){used.add(id);next=Math.max(next,id+1)}
    else x.id=null;
  }
  for(const x of items)if(x.id==null){while(used.has(next))next++;x.id=next;used.add(next);next++}
  return Math.max(1,...[...used])+1;
}
function mergeProfiles(a,b){
  const out={...clone(obj(a))};
  for(const [k,v] of Object.entries(obj(b))){
    if(!out[k]||(+v?.trainedAt||0)>(+out[k]?.trainedAt||0))out[k]=clone(v);
  }
  return out;
}
function mergeSections(a,b){
  const out={};for(const k of new Set([...Object.keys(obj(a)),...Object.keys(obj(b))])){
    const x=a?.[k],y=b?.[k];
    if(!x)out[k]=clone(y);else if(!y)out[k]=clone(x);
    else out[k]=(+y.updatedAt||0)>(+x.updatedAt||0)?clone(y):clone(x);
  }return out;
}
function externalStamp(d){
  const t=stamp(d);if(t)return t;
  const c=Date.parse(d?.capturedAt||'');return Number.isFinite(c)?c:0;
}
function mergeExternalDays(a,b){
  const m=new Map();
  for(const d of [...arr(a),...arr(b)]){
    if(!d||!canon(d.shop)||!d.date)continue;
    const k=`${canon(d.shop)}|${d.date}`,old=m.get(k);
    if(!old){m.set(k,clone(d));continue}
    const os=externalStamp(old),ns=externalStamp(d);
    if(ns>os||(ns===os&&arr(d.machines).length>arr(old.machines).length))m.set(k,clone(d));
  }
  return [...m.values()].sort((x,y)=>String(x.date).localeCompare(String(y.date))||canon(x.shop).localeCompare(canon(y.shop),'ja'));
}
function analysisKey(x){return String(x?.signature||x?.id||'')}
function mergeAnalysis(a,b){return mergeByKey(a,b,analysisKey)}
function mergePackages(local,remote){
  if(!remote||remote.schema!==SYNC_SCHEMA)return clone(local);
  const l=clone(local)||{},r=clone(remote)||{};
  const ls=obj(l.core),rs=obj(r.core);
  const sm=mergeShops(ls.shops,rs.shops),tm=mergeTags(ls.tags,rs.tags);
  const lses=ensureSyncIds(ls.sessions,l.sourceDevice||'local','session').map(x=>remapSession(x,sm.localMap,tm.localMap));
  const rses=ensureSyncIds(rs.sessions,r.sourceDevice||'remote','session').map(x=>remapSession(x,sm.remoteMap,tm.remoteMap));
  const sessions=mergeByKey(lses,rses,x=>x._syncId);
  const sessionSeq=normalizeNumericIds(sessions);
  const forecasts=mergeByKey(ls.forecasts,rs.forecasts,x=>`${canon(x.shop)}|${x.targetDate||''}`,600);
  const forecastSeq=normalizeNumericIds(forecasts);
  const layoutOverrides=mergeByKey(ls.layoutOverrides,rs.layoutOverrides,x=>`${canon(x.shopName)}|${x.tableNo||''}|${x.fromDate||''}|${x.machine||''}`,1000);
  const moveHistory=mergeByKey(ls.moveHistory,rs.moveHistory,x=>x._syncId||`${stamp(x)}|${hash32(x)}`,300);
  const tags=tm.tags;
  const tagSeq=Math.max(1,...tags.map(x=>{const m=String(x.id||'').match(/(\d+)$/);return m?+m[1]+1:1}));
  return{
    schema:SYNC_SCHEMA,version:SYNC_VERSION,appVersion:APP_VERSION,generatedAt:new Date().toISOString(),
    sourceDevice:l.sourceDevice||r.sourceDevice||'',
    core:{
      sections:mergeSections(ls.sections,rs.sections),
      shops:sm.shops,sessions,sessionSeq,tags,tagSeq,
      forecasts,forecastSeq,layoutOverrides,moveHistory,
      hybridProfiles:mergeProfiles(ls.hybridProfiles,rs.hybridProfiles)
    },
    externalDays:mergeExternalDays(l.externalDays,r.externalDays),
    analysisSnapshots:mergeAnalysis(l.analysisSnapshots,r.analysisSnapshots)
  };
}
function readJSON(key,fallback=null){
  try{const s=localStorage.getItem(key);return s?JSON.parse(s):fallback}catch{return fallback}
}
function writeJSON(key,value){localStorage.setItem(key,JSON.stringify(value))}
function clientState(){
  let x=readJSON(CLIENT_KEY,{})||{};
  if(!x.deviceId)x.deviceId='dev-'+b64url(randomBytes(10));
  x.sectionMeta=obj(x.sectionMeta);
  return x;
}
function saveClient(x){writeJSON(CLIENT_KEY,x)}
function sectionEnvelope(meta,key,value,seedTime=0){
  const h=hash32(value),old=obj(meta.sectionMeta?.[key]);
  const changed=old.hash!==h,updatedAt=changed?Math.max(now(),+seedTime||0):(+old.updatedAt||+seedTime||now());
  meta.sectionMeta[key]={hash:h,updatedAt};
  return{value:clone(value),updatedAt};
}
function idbOpen(){
  return new Promise((resolve,reject)=>{
    const q=indexedDB.open(DB_NAME,1);
    q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains(DB_STORE))q.result.createObjectStore(DB_STORE)};
    q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error||new Error('保存領域を開けなかったよ'));
  });
}
async function idbGet(key){
  if(typeof indexedDB==='undefined')return null;
  const db=await idbOpen();
  return await new Promise((resolve,reject)=>{
    const tx=db.transaction(DB_STORE,'readonly'),q=tx.objectStore(DB_STORE).get(key);
    q.onsuccess=()=>resolve(q.result??null);q.onerror=()=>reject(q.error||new Error('保存データを読めなかったよ'));
    tx.oncomplete=()=>db.close();tx.onabort=()=>{db.close();reject(tx.error||new Error('保存データを読めなかったよ'))};
  });
}
async function idbPut(key,value){
  const db=await idbOpen();
  return await new Promise((resolve,reject)=>{
    const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(value,key);
    tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>{db.close();reject(tx.error||new Error('保存データを書けなかったよ'))};
    tx.onabort=()=>{db.close();reject(tx.error||new Error('保存データを書けなかったよ'))};
  });
}
async function decodeAnalysis(rec){
  if(!rec)return null;
  if(rec.codec==='gzip-json'&&rec.blob&&typeof DecompressionStream==='function'){
    const stream=rec.blob.stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }
  if(rec.codec==='json'&&typeof rec.text==='string')return JSON.parse(rec.text);
  if(rec.schema==='juggler-store-analysis-snapshot')return rec;
  return null;
}
async function encodeAnalysis(snap){
  const text=JSON.stringify(snap),rawBytes=new Blob([text]).size;
  if(typeof CompressionStream==='function'){
    try{
      const stream=new Blob([text],{type:'application/json'}).stream().pipeThrough(new CompressionStream('gzip'));
      const blob=await new Response(stream).blob();
      return{codec:'gzip-json',blob,rawBytes,storedBytes:blob.size};
    }catch{}
  }
  return{codec:'json',text,rawBytes,storedBytes:rawBytes};
}
async function readAnalysisSnapshots(){
  const idx=arr(await idbGet(ANALYSIS_INDEX_KEY)),out=[];
  for(const m of idx){
    try{const s=await decodeAnalysis(await idbGet(ANALYSIS_PREFIX+m.id));if(s)out.push(s)}catch{}
  }
  return out;
}
async function writeAnalysisSnapshots(snaps){
  const index=[];
  for(const snap0 of arr(snaps)){
    if(!snap0||snap0.schema!=='juggler-store-analysis-snapshot')continue;
    const snap=clone(snap0),id=snap.id||`sa-${now().toString(36)}-${hash32(snap.signature||snap.source||snap)}`;
    snap.id=id;
    const enc=await encodeAnalysis(snap);await idbPut(ANALYSIS_PREFIX+id,enc);
    index.push({id,signature:snap.signature||'',shop:snap.shop||'',createdAt:+snap.createdAt||now(),appVersion:snap.appVersion||'',
      source:snap.source||{},params:snap.params||{},summary:snap.summary||{},rawBytes:enc.rawBytes||0,storedBytes:enc.storedBytes||0,hasForecast:!!snap.forecast});
  }
  index.sort((a,b)=>(+b.createdAt||0)-(+a.createdAt||0));
  await idbPut(ANALYSIS_INDEX_KEY,index);
}
async function buildLocalPackage(meta){
  const st=readJSON(STATE_KEY,{})||{},seed=+st.savedAt||now(),deviceId=meta.deviceId;
  st.sessions=ensureSyncIds(st.sessions,deviceId,'session');
  st.v4MoveHistory=ensureSyncIds(st.v4MoveHistory,deviceId,'move');
  writeJSON(STATE_KEY,st);
  const hana=readJSON(HANA_KEY,{})||{};
  const judgeSection={
    data:st.data||{},liveSessions:st.liveSessions||{},rev:st.rev||{},cmpData:st.cmpData||[],cmpSeq:+st.cmpSeq||1
  };
  const sections={
    judge:sectionEnvelope(meta,'judge',judgeSection,seed),
    hana:sectionEnvelope(meta,'hana',hana,seed)
  };
  const externalDays=arr(await idbGet(EXTERNAL_KEY));
  const analysisSnapshots=await readAnalysisSnapshots();
  saveClient(meta);
  return{schema:SYNC_SCHEMA,version:SYNC_VERSION,appVersion:APP_VERSION,generatedAt:new Date().toISOString(),sourceDevice:deviceId,
    core:{sections,shops:arr(st.shops),sessions:arr(st.sessions),sessionSeq:+st.sessionSeq||1,tags:arr(st.tags),tagSeq:+st.tagSeq||1,
      forecasts:arr(st.modelForecasts),forecastSeq:+st.modelForecastSeq||1,layoutOverrides:arr(st.v4LayoutOverrides),moveHistory:arr(st.v4MoveHistory),
      hybridProfiles:obj(st.v4HybridProfiles)},
    externalDays,analysisSnapshots};
}
async function applyPackage(pkg,meta){
  const st=readJSON(STATE_KEY,{})||{},core=obj(pkg.core),sections=obj(core.sections);
  const judge=obj(sections.judge?.value);
  if(sections.judge){st.data=clone(judge.data||{});st.liveSessions=clone(judge.liveSessions||{});st.rev=clone(judge.rev||{});st.cmpData=clone(judge.cmpData||[]);st.cmpSeq=+judge.cmpSeq||1}
  st.shops=clone(arr(core.shops));st.sessions=clone(arr(core.sessions));st.sessionSeq=+core.sessionSeq||normalizeNumericIds(st.sessions);
  st.tags=clone(arr(core.tags));st.tagSeq=+core.tagSeq||1;
  st.modelForecasts=clone(arr(core.forecasts));st.modelForecastSeq=+core.forecastSeq||normalizeNumericIds(st.modelForecasts);
  st.v4LayoutOverrides=clone(arr(core.layoutOverrides));st.v4MoveHistory=clone(arr(core.moveHistory));st.v4HybridProfiles=clone(obj(core.hybridProfiles));
  st.savedAt=now();
  writeJSON(STATE_KEY,st);
  if(sections.hana)writeJSON(HANA_KEY,sections.hana.value||{});
  await idbPut(EXTERNAL_KEY,arr(pkg.externalDays));
  await writeAnalysisSnapshots(pkg.analysisSnapshots);
  for(const [k,v] of Object.entries(sections)){
    meta.sectionMeta[k]={hash:hash32(v.value),updatedAt:+v.updatedAt||now()};
  }
  saveClient(meta);
}
async function gzipBytes(bytes){
  if(typeof CompressionStream!=='function')return{zip:'none',bytes};
  const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return{zip:'gzip',bytes:new Uint8Array(await new Response(stream).arrayBuffer())};
}
async function gunzipBytes(bytes,zip){
  if(zip!=='gzip')return bytes;
  if(typeof DecompressionStream!=='function')throw new Error('このSafariでは同期データの展開に対応してないよ');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function encryptPackage(pkg,keyText){
  if(!global.crypto?.subtle)throw new Error('このブラウザでは暗号化同期を使えないよ');
  const raw=new TextEncoder().encode(JSON.stringify(pkg)),z=await gzipBytes(raw);
  const key=await crypto.subtle.importKey('raw',fromB64url(keyText),{name:'AES-GCM'},false,['encrypt']);
  const iv=randomBytes(12),ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,z.bytes));
  return{v:1,zip:z.zip,iv:b64url(iv),ct:b64url(ct)};
}
async function decryptPackage(payload,keyText){
  if(!payload)return null;
  if(+payload.v!==1||!payload.iv||!payload.ct)throw new Error('クラウド同期データの形式を認識できないよ');
  const key=await crypto.subtle.importKey('raw',fromB64url(keyText),{name:'AES-GCM'},false,['decrypt']);
  let plain;
  try{plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(payload.iv)},key,fromB64url(payload.ct)))}
  catch{throw new Error('共有コードが違うか、同期データを復号できなかったよ')}
  plain=await gunzipBytes(plain,payload.zip);
  const pkg=JSON.parse(new TextDecoder().decode(plain));
  if(pkg?.schema!==SYNC_SCHEMA)throw new Error('同期データの種類を認識できないよ');
  return pkg;
}
const SYNC_TRANSPORT_CHUNK_CHARS=700000;
const SYNC_TRANSPORT_DIRECT_CHARS=2500000;
function splitJsonChunks(text,maxChars=SYNC_TRANSPORT_CHUNK_CHARS){
  const s=String(text||''),out=[];
  if(!s)return[''];
  for(let i=0;i<s.length;i+=maxChars)out.push(s.slice(i,i+maxChars));
  return out;
}
function joinJsonChunks(chunks){return arr(chunks).join('')}
async function apiRaw(body){
  const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  let x={};try{x=await r.json()}catch{}
  if(!r.ok){const e=new Error(x.message||`同期APIエラー (${r.status})`);e.status=r.status;e.body=x;throw e}
  return x;
}
async function api(body){
  if(body?.action==='push'&&body.payload){
    const payloadText=JSON.stringify(body.payload);
    if(payloadText.length>SYNC_TRANSPORT_DIRECT_CHARS){
      const chunks=splitJsonChunks(payloadText),start=await apiRaw({action:'pushStart',syncId:body.syncId,authToken:body.authToken,baseRevision:body.baseRevision,totalChunks:chunks.length,totalBytes:payloadText.length});
      for(let i=0;i<chunks.length;i++)await apiRaw({action:'pushChunk',syncId:body.syncId,authToken:body.authToken,uploadId:start.uploadId,index:i,totalChunks:chunks.length,chunk:chunks[i]});
      return await apiRaw({action:'pushCommit',syncId:body.syncId,authToken:body.authToken,uploadId:start.uploadId});
    }
  }
  const x=await apiRaw(body);
  if(body?.action==='pull'&&!body.metaOnly&&x?.chunked&&x.chunkTotal>0){
    const chunks=[];
    for(let i=0;i<x.chunkTotal;i++){const c=await apiRaw({action:'pullChunk',syncId:body.syncId,authToken:body.authToken,revision:+x.revision||0,index:i});chunks.push(String(c.chunk||''))}
    x.payload=JSON.parse(joinJsonChunks(chunks));delete x.chunked;delete x.chunkTotal;delete x.payloadBytes;
  }
  return x;
}
function linkCode(link){return `JGS1.${link.id}.${link.auth}.${link.key}`}
function parseCode(text){
  const s=String(text||'').trim(),m=s.match(/^JGS1\.([A-Za-z0-9_-]{12,80})\.([A-Za-z0-9_-]{20,100})\.([A-Za-z0-9_-]{40,60})$/);
  if(!m)throw new Error('共有コードの形式が違うよ');
  return{id:m[1],auth:m[2],key:m[3]};
}
async function createLink(meta){
  const x=await api({action:'create'}),link={id:x.syncId,auth:x.authToken,key:b64url(randomBytes(32))};
  meta.link=link;meta.lastRevision=0;meta.lastSyncAt=0;saveClient(meta);return link;
}
async function validateLink(link){return await api({action:'pull',syncId:link.id,authToken:link.auth,metaOnly:true})}
async function syncNow(meta,onProgress=()=>{},hooks={}){
  const link=meta.link;if(!link)throw new Error('先に端末共有を設定してね');
  onProgress('端末の保存データをまとめてる…');
  let local=await buildLocalPackage(meta),remote=null,pull=null;
  for(let attempt=0;attempt<3;attempt++){
    onProgress(attempt?'更新競合を再調整してる…':'クラウドのデータを確認してる…');
    pull=await api({action:'pull',syncId:link.id,authToken:link.auth});
    remote=pull.payload?await decryptPackage(pull.payload,link.key):null;
    const merged=mergePackages(local,remote);
    const encrypted=await encryptPackage(merged,link.key);
    const bytes=JSON.stringify(encrypted).length;
    if(bytes>4_700_000)throw new Error(`同期データが大きすぎるよ（約${(bytes/1048576).toFixed(1)}MB）。この版の上限を超えてる`);
    onProgress('クラウドへ統合データを保存してる…');
    try{
      const pushed=await api({action:'push',syncId:link.id,authToken:link.auth,baseRevision:+pull.revision||0,payload:encrypted});
      onProgress('この端末へ反映してる…');
      hooks.beforeApply?.();
      await applyPackage(merged,meta);
      meta.lastRevision=+pushed.revision||0;meta.lastSyncAt=now();
      meta.lastSummary={sessions:arr(merged.core?.sessions).length,externalDays:arr(merged.externalDays).length,analysis:arr(merged.analysisSnapshots).length};
      saveClient(meta);
      return{revision:meta.lastRevision,...meta.lastSummary};
    }catch(e){
      if(e.status!==409||attempt>=2)throw e;
      local=merged;
    }
  }
  throw new Error('同期の競合を解消できなかったよ');
}
function fmtTime(ms){if(!ms)return'まだなし';try{return new Date(ms).toLocaleString('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch{return'不明'}}
function copyText(text){
  if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text);
  return Promise.reject(new Error('clipboard unavailable'));
}

const internals={canon,stable,hash32,mergeByKey,mergeShops,mergeTags,mergeExternalDays,mergeAnalysis,mergePackages,parseCode,linkCode,splitJsonChunks,joinJsonChunks};
global.__JUGEST_SYNC_TEST__=internals;
global.JUGESTDeviceSync={
  getStatus:()=>clientState(),
  syncNow:async(onProgress=()=>{},hooks={})=>{const m=clientState();return syncNow(m,onProgress,hooks)},
  createShare:async()=>{const m=clientState(),link=await createLink(m);return{code:linkCode(link),status:clientState()}},
  joinShare:async(code)=>{const link=parseCode(code);await validateLink(link);const m=clientState();m.link=link;m.lastRevision=0;m.lastSyncAt=0;saveClient(m);return{status:clientState(),code:linkCode(link)}},
  unlink:()=>{const m=clientState();delete m.link;m.lastRevision=0;m.lastSyncAt=0;saveClient(m);return clientState()},
  getCode:()=>{const m=clientState();return m.link?linkCode(m.link):''}
};
})(typeof window!=='undefined'?window:globalThis);
