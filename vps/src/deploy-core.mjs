import path from 'node:path';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises';

const DEFAULT_STATE=Object.freeze({
  lastSuccessfulSha:null,
  previousSuccessfulSha:null,
  lastAttemptSha:null,
  lastResult:null,
  lastError:null,
  updatedAt:null
});

function statePath(stateDir) {
  return path.join(stateDir,'state.json');
}

export async function readState(stateDir) {
  try {
    const parsed=JSON.parse(await readFile(statePath(stateDir),'utf8'));
    if (!parsed || typeof parsed!=='object' || Array.isArray(parsed)) {
      throw new Error('deploy state must be a JSON object');
    }
    return {...DEFAULT_STATE,...parsed};
  } catch (error) {
    if (error?.code==='ENOENT') return {...DEFAULT_STATE};
    throw error;
  }
}

export async function writeState(stateDir,patch) {
  await mkdir(stateDir,{recursive:true});
  const current=await readState(stateDir);
  const next={...current,...patch,updatedAt:new Date().toISOString()};
  const finalPath=statePath(stateDir);
  const tempPath=`${finalPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(tempPath,`${JSON.stringify(next,null,2)}\n`,{encoding:'utf8',mode:0o600});
    await rename(tempPath,finalPath);
  } finally {
    await rm(tempPath,{force:true}).catch(()=>{});
  }
  return next;
}

export function shouldAttemptDeploy({remoteSha,currentSha,state={}}) {
  if (!remoteSha) return {attempt:false,reason:'no-remote-sha'};
  if (remoteSha===currentSha) return {attempt:false,reason:'already-current'};
  if (state.lastAttemptSha===remoteSha && state.lastResult==='failed') {
    return {attempt:false,reason:'previously-failed'};
  }
  return {attempt:true,reason:'new-release'};
}

export async function atomicSwitchCurrent({currentPath,targetPath}) {
  const parent=path.dirname(currentPath);
  await mkdir(parent,{recursive:true});
  const tempPath=path.join(parent,`.current-next-${process.pid}-${Date.now()}`);
  try {
    await symlink(targetPath,tempPath,'dir');
    await rename(tempPath,currentPath);
  } finally {
    await rm(tempPath,{force:true}).catch(()=>{});
  }
}

export async function resolveCurrentTarget(currentPath) {
  try {
    const info=await lstat(currentPath);
    if (!info.isSymbolicLink()) return null;
    const target=await readlink(currentPath);
    return path.resolve(path.dirname(currentPath),target);
  } catch (error) {
    if (error?.code==='ENOENT') return null;
    throw error;
  }
}

export async function resolveCurrentSha(currentPath,execGit) {
  try {
    const result=await execGit('git',['rev-parse','HEAD'],{cwd:currentPath});
    if (result.code!==0) return null;
    const sha=String(result.stdout??'').trim();
    return /^[0-9a-f]{40}$/i.test(sha)?sha:null;
  } catch {
    return null;
  }
}

export async function cleanupReleases({
  releasesDir,
  currentTarget,
  previousTarget,
  keep=5
}) {
  const protectedPaths=new Set(
    [currentTarget,previousTarget]
      .filter(Boolean)
      .map(value=>path.resolve(value))
  );
  let entries;
  try {
    entries=await readdir(releasesDir,{withFileTypes:true});
  } catch (error) {
    if (error?.code==='ENOENT') return [];
    throw error;
  }
  const candidates=[];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath=path.resolve(releasesDir,entry.name);
    if (protectedPaths.has(fullPath)) continue;
    const info=await stat(fullPath);
    candidates.push({name:entry.name,fullPath,mtimeMs:info.mtimeMs});
  }
  candidates.sort((a,b)=>b.mtimeMs-a.mtimeMs || a.name.localeCompare(b.name));
  const removed=[];
  for (const entry of candidates.slice(Math.max(0,keep))) {
    await rm(entry.fullPath,{recursive:true,force:true});
    removed.push(entry.name);
  }
  return removed;
}
