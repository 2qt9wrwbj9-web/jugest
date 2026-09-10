import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,mkdtemp,readlink,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {readState} from '../src/deploy-core.mjs';
import {runDeployOnce} from '../src/deploy-runner.mjs';

const OLD_SHA='1111111111111111111111111111111111111111';
const NEW_SHA='2222222222222222222222222222222222222222';

async function fixture(t,{currentSha=OLD_SHA}={}) {
  const rootDir=await mkdtemp(path.join(tmpdir(),'jugest-deploy-runner-'));
  t.after(()=>rm(rootDir,{recursive:true,force:true}));
  const releasesDir=path.join(rootDir,'releases');
  const stateDir=path.join(rootDir,'state');
  const currentPath=path.join(rootDir,'current');
  const oldRelease=path.join(releasesDir,currentSha);
  await mkdir(path.join(oldRelease,'vps'),{recursive:true});
  await writeFile(path.join(oldRelease,'vps','package.json'),'{}');
  await writeFile(path.join(oldRelease,'.fake-head'),currentSha);
  await symlink(oldRelease,currentPath,'dir');
  return {rootDir,releasesDir,stateDir,currentPath,oldRelease};
}

function makeExec({remoteSha=NEW_SHA,checkoutSha=NEW_SHA,testCode=0,restartCode=0}={}) {
  const calls=[];
  const exec=async(command,args,{cwd}={})=>{
    calls.push({command,args:[...args],cwd});
    if (command==='git' && args[0]==='ls-remote') {
      return {code:0,stdout:`${remoteSha}\trefs/heads/deploy/vps\n`,stderr:''};
    }
    if (command==='git' && args[0]==='clone') {
      const target=args.at(-1);
      await mkdir(path.join(target,'vps'),{recursive:true});
      await writeFile(path.join(target,'vps','package.json'),'{}');
      await writeFile(path.join(target,'.fake-head'),checkoutSha);
      return {code:0,stdout:'',stderr:''};
    }
    if (command==='git' && args[0]==='checkout') {
      return {code:0,stdout:'',stderr:''};
    }
    if (command==='git' && args.includes('rev-parse')) {
      const sha=(await import('node:fs/promises')).readFile(path.join(cwd,'.fake-head'),'utf8');
      return {code:0,stdout:await sha,stderr:''};
    }
    if (command==='npm' && args[0]==='test') {
      return {code:testCode,stdout:testCode===0?'ok':'',stderr:testCode===0?'':'tests failed'};
    }
    if (command==='npm' && args[0]==='ci') {
      return {code:0,stdout:'',stderr:''};
    }
    if (command==='systemctl' && args[0]==='restart') {
      return {code:restartCode,stdout:'',stderr:restartCode===0?'':'restart failed'};
    }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
  };
  return {exec,calls};
}

function options(fx,exec,overrides={}) {
  return {
    rootDir:fx.rootDir,
    releasesDir:fx.releasesDir,
    stateDir:fx.stateDir,
    currentPath:fx.currentPath,
    repoUrl:'https://example.invalid/jugest.git',
    deployBranch:'deploy/vps',
    exec,
    acquireLock:async()=>true,
    checkHealth:async()=>true,
    logger:()=>{},
    ...overrides
  };
}

test('remote SHA equal to current performs no clone, test, or restart',async t=>{
  const fx=await fixture(t);
  const {exec,calls}=makeExec({remoteSha:OLD_SHA});
  const result=await runDeployOnce(options(fx,exec));
  assert.equal(result.status,'up-to-date');
  assert.equal(calls.some(call=>call.args[0]==='clone'),false);
  assert.equal(calls.some(call=>call.command==='npm'),false);
  assert.equal(calls.some(call=>call.command==='systemctl'),false);
});

test('checkout SHA mismatch is rejected before current switches',async t=>{
  const fx=await fixture(t);
  const {exec,calls}=makeExec({checkoutSha:'3333333333333333333333333333333333333333'});
  const result=await runDeployOnce(options(fx,exec));
  assert.equal(result.status,'failed');
  assert.equal(await readlink(fx.currentPath),fx.oldRelease);
  assert.equal(calls.some(call=>call.command==='systemctl'),false);
});

test('npm test failure leaves current unchanged and records failed SHA',async t=>{
  const fx=await fixture(t);
  const {exec,calls}=makeExec({testCode:1});
  const result=await runDeployOnce(options(fx,exec));
  assert.equal(result.status,'failed');
  assert.equal(await readlink(fx.currentPath),fx.oldRelease);
  assert.equal(calls.some(call=>call.command==='systemctl'),false);
  const state=await readState(fx.stateDir);
  assert.equal(state.lastAttemptSha,NEW_SHA);
  assert.equal(state.lastResult,'failed');
});

test('successful test switches release, restarts once, and records success',async t=>{
  const fx=await fixture(t);
  const {exec,calls}=makeExec();
  const healthCalls=[];
  const result=await runDeployOnce(options(fx,exec,{
    checkHealth:async url=>{ healthCalls.push(url); return true; }
  }));
  assert.equal(result.status,'deployed');
  assert.equal(path.basename(await readlink(fx.currentPath)),NEW_SHA);
  assert.equal(calls.filter(call=>call.command==='systemctl').length,1);
  assert.deepEqual(healthCalls.slice(0,2),[
    'http://127.0.0.1:3000/api/health',
    'http://127.0.0.1/api/health'
  ]);
  const state=await readState(fx.stateDir);
  assert.equal(state.lastSuccessfulSha,NEW_SHA);
  assert.equal(state.previousSuccessfulSha,OLD_SHA);
  assert.equal(state.lastResult,'success');
});

test('mandatory health retries through a brief post-restart startup race',async t=>{
  const fx=await fixture(t);
  const {exec}=makeExec();
  let internalAttempts=0;
  const sleeps=[];
  const result=await runDeployOnce(options(fx,exec,{
    checkHealth:async url=>{
      if (url==='http://127.0.0.1:3000/api/health') {
        internalAttempts+=1;
        return internalAttempts>=2;
      }
      return true;
    },
    healthAttempts:3,
    healthRetryDelayMs:25,
    sleep:async ms=>{ sleeps.push(ms); }
  }));

  assert.equal(result.status,'deployed');
  assert.equal(internalAttempts,2);
  assert.deepEqual(sleeps,[25]);
  assert.equal(path.basename(await readlink(fx.currentPath)),NEW_SHA);
});

test('post-switch health failure rolls current back and restarts again',async t=>{
  const fx=await fixture(t);
  const {exec,calls}=makeExec();
  let mandatoryChecks=0;
  const result=await runDeployOnce(options(fx,exec,{
    checkHealth:async url=>{
      if (url.startsWith('https://')) return true;
      mandatoryChecks+=1;
      if (mandatoryChecks===1) return false;
      return true;
    },
    healthAttempts:1
  }));
  assert.equal(result.status,'rolled-back');
  assert.equal(await readlink(fx.currentPath),fx.oldRelease);
  assert.equal(calls.filter(call=>call.command==='systemctl').length,2);
  const state=await readState(fx.stateDir);
  assert.equal(state.lastAttemptSha,NEW_SHA);
  assert.equal(state.lastResult,'failed');
});

test('same failed SHA is not deployed repeatedly',async t=>{
  const fx=await fixture(t);
  await mkdir(fx.stateDir,{recursive:true});
  await writeFile(path.join(fx.stateDir,'state.json'),JSON.stringify({lastAttemptSha:NEW_SHA,lastResult:'failed'}));
  const {exec,calls}=makeExec();
  const result=await runDeployOnce(options(fx,exec));
  assert.equal(result.status,'previously-failed');
  assert.equal(calls.some(call=>call.args[0]==='clone'),false);
});

test('lock refusal exits without touching Git or current release',async t=>{
  const fx=await fixture(t);
  const {exec,calls}=makeExec();
  const result=await runDeployOnce(options(fx,exec,{acquireLock:async()=>false}));
  assert.equal(result.status,'locked');
  assert.equal(calls.length,0);
  assert.equal(await readlink(fx.currentPath),fx.oldRelease);
});
