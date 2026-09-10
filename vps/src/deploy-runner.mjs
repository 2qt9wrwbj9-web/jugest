import path from 'node:path';
import {access,mkdir,rename,rm,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {
  atomicSwitchCurrent,
  cleanupReleases,
  readState,
  resolveCurrentSha,
  resolveCurrentTarget,
  shouldAttemptDeploy,
  writeState
} from './deploy-core.mjs';

export const DEPLOY_DEFAULTS=Object.freeze({
  repoUrl:'https://github.com/2qt9wrwbj9-web/jugest.git',
  deployBranch:'deploy/vps',
  rootDir:'/opt/jugest',
  stateDir:'/var/lib/jugest-deploy',
  webService:'jugest-web.service',
  internalHealth:'http://127.0.0.1:3000/api/health',
  nginxHealth:'http://127.0.0.1/api/health',
  externalHealth:'https://jugest.net/api/health',
  keepReleases:5,
  healthAttempts:20,
  healthRetryDelayMs:250
});

export async function execCommand(command,args,{cwd}={}) {
  return await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,stdio:['ignore','pipe','pipe']});
    let stdout='';
    let stderr='';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data',chunk=>{ stdout+=chunk; });
    child.stderr.on('data',chunk=>{ stderr+=chunk; });
    child.once('error',reject);
    child.once('close',code=>resolve({code:code??1,stdout,stderr}));
  });
}

export async function defaultCheckHealth(url) {
  try {
    const response=await fetch(url,{signal:AbortSignal.timeout(5000),cache:'no-store'});
    if (!response.ok) return false;
    const body=await response.json();
    return body?.ok===true;
  } catch {
    return false;
  }
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function parseRemoteSha(stdout,branch) {
  const expected=`refs/heads/${branch}`;
  for (const line of String(stdout??'').trim().split(/\r?\n/)) {
    const [sha,ref]=line.trim().split(/\s+/);
    if (ref===expected && /^[0-9a-f]{40}$/i.test(sha)) return sha.toLowerCase();
  }
  return null;
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

async function requireCommand(exec,command,args,options) {
  const result=await exec(command,args,options);
  if (result.code!==0) {
    const detail=String(result.stderr||result.stdout||'').trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail?`: ${detail}`:''}`);
  }
  return result;
}

async function prepareRelease({remoteSha,releasesDir,repoUrl,exec}) {
  const releasePath=path.join(releasesDir,remoteSha);
  const stagingPath=path.join(releasesDir,`${remoteSha}.staging`);
  await mkdir(releasesDir,{recursive:true});

  if (!(await exists(releasePath))) {
    await rm(stagingPath,{recursive:true,force:true});
    await requireCommand(exec,'git',['clone','--no-checkout',repoUrl,stagingPath]);
    await requireCommand(exec,'git',['checkout','--detach',remoteSha],{cwd:stagingPath});
    const checkoutSha=await resolveCurrentSha(stagingPath,exec);
    if (checkoutSha!==remoteSha) {
      await rm(stagingPath,{recursive:true,force:true});
      throw new Error(`checkout SHA mismatch: expected ${remoteSha}, got ${checkoutSha??'unreadable'}`);
    }
    await rename(stagingPath,releasePath);
  } else {
    const checkoutSha=await resolveCurrentSha(releasePath,exec);
    if (checkoutSha!==remoteSha) {
      throw new Error(`existing release SHA mismatch: expected ${remoteSha}, got ${checkoutSha??'unreadable'}`);
    }
  }

  if (!(await exists(path.join(releasePath,'vps','package.json')))) {
    throw new Error('release is missing vps/package.json');
  }
  return releasePath;
}

async function verifyRelease({releasePath,exec}) {
  const vpsDir=path.join(releasePath,'vps');
  if (await exists(path.join(vpsDir,'package-lock.json'))) {
    await requireCommand(exec,'npm',['ci'],{cwd:vpsDir});
  }
  await requireCommand(exec,'npm',['test'],{cwd:vpsDir});
}

async function restartWeb(exec,webService) {
  await requireCommand(exec,'systemctl',['restart',webService]);
}

async function waitForHealth(checkHealth,url,{attempts,delayMs,sleep}) {
  const totalAttempts=Math.max(1,attempts);
  for (let attempt=1;attempt<=totalAttempts;attempt+=1) {
    if (await checkHealth(url)) return true;
    if (attempt<totalAttempts && delayMs>0) await sleep(delayMs);
  }
  return false;
}

async function mandatoryHealth(checkHealth,internalHealth,nginxHealth,retryOptions) {
  if (!(await waitForHealth(checkHealth,internalHealth,retryOptions))) {
    return {ok:false,failed:internalHealth};
  }
  if (!(await waitForHealth(checkHealth,nginxHealth,retryOptions))) {
    return {ok:false,failed:nginxHealth};
  }
  return {ok:true,failed:null};
}

export async function runDeployOnce(options={}) {
  const rootDir=options.rootDir??DEPLOY_DEFAULTS.rootDir;
  const releasesDir=options.releasesDir??path.join(rootDir,'releases');
  const currentPath=options.currentPath??path.join(rootDir,'current');
  const stateDir=options.stateDir??DEPLOY_DEFAULTS.stateDir;
  const repoUrl=options.repoUrl??DEPLOY_DEFAULTS.repoUrl;
  const deployBranch=options.deployBranch??DEPLOY_DEFAULTS.deployBranch;
  const webService=options.webService??DEPLOY_DEFAULTS.webService;
  const internalHealth=options.internalHealth??DEPLOY_DEFAULTS.internalHealth;
  const nginxHealth=options.nginxHealth??DEPLOY_DEFAULTS.nginxHealth;
  const externalHealth=options.externalHealth??DEPLOY_DEFAULTS.externalHealth;
  const keepReleases=options.keepReleases??DEPLOY_DEFAULTS.keepReleases;
  const healthAttempts=options.healthAttempts??DEPLOY_DEFAULTS.healthAttempts;
  const healthRetryDelayMs=options.healthRetryDelayMs??DEPLOY_DEFAULTS.healthRetryDelayMs;
  const sleep=options.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  const exec=options.exec??execCommand;
  const checkHealth=options.checkHealth??defaultCheckHealth;
  const acquireLock=options.acquireLock??(async()=>true);
  const logger=options.logger??(message=>console.log(message));
  const retryOptions={attempts:healthAttempts,delayMs:healthRetryDelayMs,sleep};

  if (!(await acquireLock())) return {status:'locked'};

  await mkdir(releasesDir,{recursive:true});
  await mkdir(stateDir,{recursive:true});

  const remoteResult=await exec('git',['ls-remote',repoUrl,`refs/heads/${deployBranch}`]);
  if (remoteResult.code!==0) {
    logger(`deploy: remote lookup failed: ${String(remoteResult.stderr||'').trim()}`);
    return {status:'failed',error:'remote-lookup-failed'};
  }
  const remoteSha=parseRemoteSha(remoteResult.stdout,deployBranch);
  if (!remoteSha) {
    logger('deploy: deploy/vps ref was not found');
    return {status:'failed',error:'remote-sha-missing'};
  }

  const currentSha=await resolveCurrentSha(currentPath,exec);
  const state=await readState(stateDir);
  const decision=shouldAttemptDeploy({remoteSha,currentSha,state});
  if (!decision.attempt) {
    const status=decision.reason==='already-current'?'up-to-date':decision.reason;
    logger(`deploy: skip ${remoteSha}: ${status}`);
    return {status,remoteSha,currentSha};
  }

  await writeState(stateDir,{
    lastAttemptSha:remoteSha,
    lastResult:'attempting',
    lastError:null
  });

  let releasePath;
  try {
    releasePath=await prepareRelease({remoteSha,releasesDir,repoUrl,exec});
    await verifyRelease({releasePath,exec});
  } catch (error) {
    const message=errorText(error);
    await writeState(stateDir,{lastAttemptSha:remoteSha,lastResult:'failed',lastError:message});
    logger(`deploy: pre-switch failure for ${remoteSha}: ${message}`);
    return {status:'failed',remoteSha,currentSha,error:message};
  }

  const previousTarget=await resolveCurrentTarget(currentPath);
  let switched=false;
  try {
    await atomicSwitchCurrent({currentPath,targetPath:releasePath});
    switched=true;
    await restartWeb(exec,webService);
    const health=await mandatoryHealth(checkHealth,internalHealth,nginxHealth,retryOptions);
    if (!health.ok) throw new Error(`mandatory health failed: ${health.failed}`);

    try {
      const externalOk=await checkHealth(externalHealth);
      logger(`deploy: external health ${externalOk?'ok':'failed'} for ${remoteSha}`);
    } catch (error) {
      logger(`deploy: external health error ignored: ${errorText(error)}`);
    }

    await writeState(stateDir,{
      lastSuccessfulSha:remoteSha,
      previousSuccessfulSha:currentSha,
      lastAttemptSha:remoteSha,
      lastResult:'success',
      lastError:null
    });
    await cleanupReleases({
      releasesDir,
      currentTarget:releasePath,
      previousTarget,
      keep:keepReleases
    });
    logger(`deploy: success ${currentSha??'none'} -> ${remoteSha}`);
    return {status:'deployed',remoteSha,currentSha};
  } catch (error) {
    const message=errorText(error);
    if (switched && previousTarget) {
      try {
        await atomicSwitchCurrent({currentPath,targetPath:previousTarget});
        await restartWeb(exec,webService);
        const rollbackHealth=await mandatoryHealth(checkHealth,internalHealth,nginxHealth,retryOptions);
        if (!rollbackHealth.ok) {
          throw new Error(`rollback health failed: ${rollbackHealth.failed}`);
        }
        await writeState(stateDir,{
          lastAttemptSha:remoteSha,
          lastResult:'failed',
          lastError:message
        });
        logger(`deploy: rolled back ${remoteSha}: ${message}`);
        return {status:'rolled-back',remoteSha,currentSha,error:message};
      } catch (rollbackError) {
        const combined=`${message}; rollback failed: ${errorText(rollbackError)}`;
        await writeState(stateDir,{
          lastAttemptSha:remoteSha,
          lastResult:'failed',
          lastError:combined
        });
        logger(`deploy: ${combined}`);
        return {status:'failed',remoteSha,currentSha,error:combined};
      }
    }
    await writeState(stateDir,{
      lastAttemptSha:remoteSha,
      lastResult:'failed',
      lastError:message
    });
    logger(`deploy: switch failure for ${remoteSha}: ${message}`);
    return {status:'failed',remoteSha,currentSha,error:message};
  }
}
