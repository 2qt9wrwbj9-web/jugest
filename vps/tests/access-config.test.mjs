import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readAccessConfig,validateAccessConfig,assertPrivateAccessPath} from '../src/access/config.mjs';
import {ratePeerAddress} from '../src/access/handler.mjs';
import {createWebServer} from '../src/web-server.mjs';

test('access requires explicit enablement and a fixed HTTPS origin matching RP ID',()=>{
  assert.equal(readAccessConfig({}),null);
  for(const origin of ['http://jugest.net','https://jugest.net/path','https://jugest.net/','https://evil.example','https://user:pass@jugest.net'])assert.throws(()=>validateAccessConfig({dbPath:'/tmp/access.sqlite',origin,rpID:'jugest.net'}));
  assert.throws(()=>validateAccessConfig({dbPath:'/tmp/access.sqlite',origin:'http://localhost:1234',rpID:'localhost'}));
  assert.equal(validateAccessConfig({dbPath:'/tmp/access.sqlite',origin:'http://localhost:1234',rpID:'localhost',allowLocalhost:true}).rpID,'localhost');
});

test('rate-limit proxy address is opt-in, loopback-only, validated and never uses an arbitrary forwarded chain',()=>{
  const request={socket:{remoteAddress:'127.0.0.1'},headers:{'x-real-ip':'192.0.2.1','x-forwarded-for':'spoofed'}};
  assert.equal(ratePeerAddress(request,{}),'127.0.0.1');
  assert.equal(ratePeerAddress(request,{trustLoopbackProxy:true}),'192.0.2.1');
  request.socket.remoteAddress='192.0.2.2';assert.equal(ratePeerAddress(request,{trustLoopbackProxy:true}),'192.0.2.2');
  request.socket.remoteAddress='127.0.0.1';request.headers['x-real-ip']='192.0.2.1, 192.0.2.3';assert.equal(ratePeerAddress(request,{trustLoopbackProxy:true}),'127.0.0.1');
});

test('private database path checks symlinked parents even before a database exists',t=>{
  const dir=mkdtempSync(join(tmpdir(),'jugest-path-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const root=join(dir,'web');mkdirSync(root);symlinkSync(root,join(dir,'alias'));
  const config={dbPath:join(dir,'alias','new','access.sqlite')};
  assert.throws(()=>assertPrivateAccessPath(config,root),/private_and_separate/);
  assert.throws(()=>assertPrivateAccessPath({dbPath:join(dir,'collection.sqlite')},root,[join(dir,'collection.sqlite')]),/private_and_separate/);
  assert.doesNotThrow(()=>assertPrivateAccessPath({dbPath:join(dir,'private','access.sqlite')},root));
});

test('enabled sharing refuses legacy public mode and empty owner configuration, disabled sharing preserves it',t=>{
  const previous={mode:process.env.JUGEST_PIA_ACCESS_MODE,ids:process.env.JUGEST_PIA_OWNER_CHANNEL_IDS,file:process.env.JUGEST_PIA_OWNER_CHANNEL_FILE};
  t.after(()=>{for(const [key,value] of [['JUGEST_PIA_ACCESS_MODE',previous.mode],['JUGEST_PIA_OWNER_CHANNEL_IDS',previous.ids],['JUGEST_PIA_OWNER_CHANNEL_FILE',previous.file]]){if(value===undefined)delete process.env[key];else process.env[key]=value}});
  const dir=mkdtempSync(join(tmpdir(),'jugest-boundary-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const rootDir=join(dir,'web');mkdirSync(rootDir);
  const config={rootDir,accessConfig:{dbPath:join(dir,'access.sqlite'),origin:'https://jugest.net',rpID:'jugest.net'}};
  process.env.JUGEST_PIA_ACCESS_MODE='public';process.env.JUGEST_PIA_OWNER_CHANNEL_IDS='some-owner';
  assert.throws(()=>createWebServer(config),/pia_sharing_requires_owner_mode_and_allowlist/);
  assert.doesNotThrow(()=>createWebServer({rootDir,accessConfig:null}));
  process.env.JUGEST_PIA_ACCESS_MODE='owner';delete process.env.JUGEST_PIA_OWNER_CHANNEL_IDS;process.env.JUGEST_PIA_OWNER_CHANNEL_FILE=join(dir,'nonexistent');
  assert.throws(()=>createWebServer(config),/pia_sharing_requires_owner_mode_and_allowlist/);
  process.env.JUGEST_PIA_OWNER_CHANNEL_IDS='some-owner';assert.doesNotThrow(()=>createWebServer(config));
});
