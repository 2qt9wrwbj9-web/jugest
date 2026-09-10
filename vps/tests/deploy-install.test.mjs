import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,readFile,readlink,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';

const execFileAsync=promisify(execFile);
const vpsRoot=path.resolve(import.meta.dirname,'..');

async function tempRoot(t) {
  const root=await mkdtemp(path.join(tmpdir(),'jugest-install-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return root;
}

async function makeCurrentRepo(root,{testPass=true}={}) {
  const current=path.join(root,'current');
  await mkdir(path.join(current,'vps'),{recursive:true});
  const script=testPass?'node -e "process.exit(0)"':'node -e "process.exit(1)"';
  await writeFile(path.join(current,'vps','package.json'),JSON.stringify({scripts:{test:script}},null,2));
  await writeFile(path.join(current,'index.html'),'<title>JUGEST</title>');
  await execFileAsync('git',['init'],{cwd:current});
  await execFileAsync('git',['config','user.email','test@example.invalid'],{cwd:current});
  await execFileAsync('git',['config','user.name','JUGEST Test'],{cwd:current});
  await execFileAsync('git',['add','.'],{cwd:current});
  await execFileAsync('git',['commit','-m','fixture'],{cwd:current});
  const {stdout}=await execFileAsync('git',['rev-parse','HEAD'],{cwd:current});
  return {current,sha:stdout.trim()};
}

function installerEnv(root) {
  return {
    ...process.env,
    JUGEST_INSTALL_TEST_MODE:'1',
    JUGEST_ROOT:root,
    JUGEST_STATE_DIR:path.join(root,'state'),
    JUGEST_SYSTEMD_DIR:path.join(root,'systemd'),
    JUGEST_SYSTEMCTL:'/bin/true'
  };
}

test('package exposes deploy and deploy status commands',async()=>{
  const pkg=JSON.parse(await readFile(path.join(vpsRoot,'package.json'),'utf8'));
  assert.equal(pkg.scripts.deploy,'node scripts/deploy-vps.mjs');
  assert.equal(pkg.scripts['deploy:status'],'node scripts/deploy-status.mjs');
});

test('systemd deploy service is oneshot, locked with flock, and uses stable deployer path',async()=>{
  const service=await readFile(path.join(vpsRoot,'systemd','jugest-deploy.service'),'utf8');
  assert.match(service,/Type=oneshot/);
  assert.match(service,/\/usr\/bin\/flock\s+-n\s+\/run\/jugest-deploy\.lock/);
  assert.match(service,/\/opt\/jugest\/deployer\/scripts\/deploy-vps\.mjs/);
  assert.doesNotMatch(service,/sol\/vps-auto-deploy/);
});

test('systemd timer polls about once per minute and is persistent',async()=>{
  const timer=await readFile(path.join(vpsRoot,'systemd','jugest-deploy.timer'),'utf8');
  assert.match(timer,/OnBootSec=2min/);
  assert.match(timer,/OnUnitActiveSec=1min/);
  assert.match(timer,/Persistent=true/);
  assert.match(timer,/Unit=jugest-deploy\.service/);
});

test('deploy branch is fixed to deploy/vps',async()=>{
  const runner=await readFile(path.join(vpsRoot,'src','deploy-runner.mjs'),'utf8');
  assert.match(runner,/deployBranch:'deploy\/vps'/);
});

test('installer migrates a tested current directory to releases and is safe to re-run',async t=>{
  const root=await tempRoot(t);
  const {current,sha}=await makeCurrentRepo(root);
  const installer=path.join(vpsRoot,'scripts','install-auto-deploy.sh');

  await execFileAsync('bash',[installer],{env:installerEnv(root)});

  assert.ok((await stat(path.join(root,'releases',sha))).isDirectory());
  assert.equal(await readlink(current),path.join(root,'releases',sha));
  assert.equal(await readFile(path.join(current,'index.html'),'utf8'),'<title>JUGEST</title>');
  assert.ok((await stat(path.join(root,'deployer','scripts','deploy-vps.mjs'))).isFile());
  assert.ok((await stat(path.join(root,'systemd','jugest-deploy.service'))).isFile());

  await execFileAsync('bash',[installer],{env:installerEnv(root)});
  assert.equal(await readlink(current),path.join(root,'releases',sha));
});

test('installer refuses migration when existing current tests fail',async t=>{
  const root=await tempRoot(t);
  const {current}=await makeCurrentRepo(root,{testPass:false});
  const installer=path.join(vpsRoot,'scripts','install-auto-deploy.sh');

  await assert.rejects(execFileAsync('bash',[installer],{env:installerEnv(root)}));

  assert.ok((await stat(current)).isDirectory());
});

test('installer never enables the deploy timer by itself',async()=>{
  const installer=await readFile(path.join(vpsRoot,'scripts','install-auto-deploy.sh'),'utf8');
  assert.doesNotMatch(installer,/systemctl\s+enable/);
  assert.doesNotMatch(installer,/systemctl\s+start\s+jugest-deploy\.timer/);
  assert.match(installer,/timer remains disabled/i);
});
