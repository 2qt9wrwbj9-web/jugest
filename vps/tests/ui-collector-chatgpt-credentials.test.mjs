import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {patchJugestIndexSource} from '../src/ui-source-patch.mjs';
import {MASK,normalizeConnectionInfo,tokenFieldValue,__test as credentialTest} from '../../vps-ui-collector-credentials.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');

test('Collector credentials bridge is injected without exposing receiver token by default',async()=>{
  const source=await readFile(path.join(root,'index.html'),'utf8');
  const patched=patchJugestIndexSource(source);
  assert.match(patched,/getCollectorConnectionInfo:\(includeSecret=false\)=>/);
  assert.match(patched,/receiverToken:includeSecret\?String\(relayReceiver\?\.receiverToken\|\|""\):""/);
  assert.match(patched,/vps-ui-collector-credentials\.mjs/);
});

test('Receiver token stays masked until explicitly revealed',()=>{
  const info=normalizeConnectionInfo({channelId:'channel-123',receiverToken:'secret-token'});
  assert.equal(info.channelId,'channel-123');
  assert.equal(tokenFieldValue(info,false),MASK);
  assert.notEqual(tokenFieldValue(info,false),info.receiverToken);
  assert.equal(tokenFieldValue(info,true),'secret-token');
});

test('ChatGPT credential card targets the gear Collector settings overlay, not Data auto-acquisition',async()=>{
  const source=await readFile(path.join(root,'vps-ui-collector-credentials.mjs'),'utf8');
  assert.match(source,/\.vps-settings-overlay/);
  assert.match(source,/Collector連携設定/);
  assert.doesNotMatch(source,/\.workspace\.data-screen/);
  assert.doesNotMatch(source,/textContent\?\.trim\(\)!=='自動取得'/);
});


test('ChatGPT credential card manages a one-time visible PRE read-only key without localStorage persistence',async()=>{
  const source=await readFile(path.join(root,'vps-ui-collector-credentials.mjs'),'utf8');
  for(const token of ['assistant-key','PRE参照鍵を発行','PRE参照鍵をコピー','PRE参照鍵を失効','data-chatgpt-assistant-key'])assert.match(source,new RegExp(token));
  assert.match(source,/assistantKeyRequest\('POST'\)/);
  assert.match(source,/assistantKeyRequest\('DELETE'\)/);
  assert.doesNotMatch(source,/localStorage[^\n]*assistant/i);
  assert.match(source,/assistantKeyStatusLoaded/);
  assert.match(source,/assistantKeyStatusPromise/);
  assert.match(source,/if\(assistantKeyStatusLoaded\)\{renderAssistantKey\(card\);return\}/);
  assert.match(source,/if\(!assistantKeyStatusPromise\)/);
  assert.match(source,/状態取得に失敗/);
});


test('PRE read-only key status request is deduplicated across rapid settings rerenders',async()=>{
  const previousBridge=globalThis.JUGEST_CORE_BRIDGE,previousFetch=globalThis.fetch;
  let fetchCount=0,resolveJson;
  const jsonPromise=new Promise(resolve=>{resolveJson=resolve});
  const field={textContent:'状態確認中…'},status={textContent:'',isConnected:true};
  const button={textContent:'',disabled:false};
  const card={querySelector(selector){
    if(selector==='[data-chatgpt-assistant-key]')return field;
    if(selector==='[data-chatgpt-credential-status]')return status;
    if(selector==='[data-chatgpt-issue-assistant-key]'||selector==='[data-chatgpt-copy-assistant-key]'||selector==='[data-chatgpt-revoke-assistant-key]')return button;
    return null;
  }};
  try{
    globalThis.JUGEST_CORE_BRIDGE={getCollectorConnectionInfo:()=>({channelId:'channel-123456789',receiverToken:'receiver-token'})};
    globalThis.fetch=async()=>{fetchCount+=1;return {ok:true,status:200,json:async()=>jsonPromise}};
    const calls=Array.from({length:10},()=>credentialTest.refreshAssistantKeyStatus(card));
    await Promise.resolve();
    assert.equal(fetchCount,1);
    resolveJson({ok:true,active:false});
    await Promise.all(calls);
    assert.equal(field.textContent,'未発行');
    assert.equal(fetchCount,1);
    await credentialTest.refreshAssistantKeyStatus(card);
    assert.equal(fetchCount,1);
    assert.equal(field.textContent,'未発行');
  }finally{
    globalThis.JUGEST_CORE_BRIDGE=previousBridge;globalThis.fetch=previousFetch;
  }
});
