import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {patchJugestIndexSource} from '../src/ui-source-patch.mjs';
import {MASK,normalizeConnectionInfo,tokenFieldValue} from '../../vps-ui-collector-credentials.mjs';

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
});
