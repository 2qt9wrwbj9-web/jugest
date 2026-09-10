# JUGEST VPS Auto Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `deploy/vps` の更新だけを KAGOYA VPS が自動検知し、別 release で全テストを通した更新だけを `jugest.net` に切り替え、切替後異常時は直前正常版へ戻す。

**Architecture:** pull 型の自動デプロイを VPS 上で 1 分ごとの systemd timer として実行する。デプロイ処理は `deploy/vps` の commit SHA を固定して `/opt/jugest/releases/<sha>` に取得し、テスト成功後だけ `/opt/jugest/current` の symlink を原子的に差し替える。切替後の内部 health が失敗した場合は previous release へ戻し、同一失敗 SHA の無限再試行を抑止する。

**Tech Stack:** Node.js >=22.13.0, built-in `node:test`, Git, systemd, flock, Nginx, curl, POSIX shell

**Spec:** `docs/superpowers/specs/2026-09-10-vps-auto-deploy-design.md`

## Global Constraints

- `main` は変更しない。
- 自動デプロイ対象は `deploy/vps` だけに限定する。
- force update は使わない。
- 判別数学、strict Champion、Calibration、store-share constraint、Juggler/HANA 判別式、HANA hard constraints、単一根拠エンジン、店舗解析の保護領域には触れない。
- GitHub 側に VPS の SSH 秘密鍵やサーバー用シークレットを置かない。
- Nginx / DNS / Let’s Encrypt 設定は自動デプロイ処理から変更しない。
- KAGOYA VPS 上で timer を enable/start する直前にはヒロの明示確認を取る。
- `deploy/vps` は検証済み commit のみ fast-forward する。
- テスト件数を 43 に固定せず、`npm test` の終了コード 0 を成功条件にする。

---

### Task 1: Deployment State and Release Switching Core

**Files:**
- Create: `vps/src/deploy-core.mjs`
- Test: `vps/tests/deploy-core.test.mjs`

**Interfaces:**
- Produces: `readState(stateDir) -> Promise<object>`
- Produces: `writeState(stateDir, patch) -> Promise<object>`
- Produces: `resolveCurrentSha(currentPath, execGit) -> Promise<string|null>`
- Produces: `shouldAttemptDeploy({remoteSha,currentSha,state}) -> {attempt:boolean,reason:string}`
- Produces: `atomicSwitchCurrent({currentPath,targetPath,fsOps}) -> Promise<void>`
- Produces: `cleanupReleases({releasesDir,currentTarget,previousTarget,keep,fsOps}) -> Promise<string[]>`

- [ ] **Step 1: Write failing tests for state, retry suppression, atomic switch, and cleanup**

Add `vps/tests/deploy-core.test.mjs` using temporary directories. Cover:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,mkdir,readlink,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {
  readState,
  writeState,
  shouldAttemptDeploy,
  atomicSwitchCurrent,
  cleanupReleases
} from '../src/deploy-core.mjs';

test('same current SHA is skipped',()=>{
  assert.deepEqual(
    shouldAttemptDeploy({remoteSha:'abc',currentSha:'abc',state:{}}),
    {attempt:false,reason:'already-current'}
  );
});

test('same previously failed SHA is skipped',()=>{
  assert.deepEqual(
    shouldAttemptDeploy({remoteSha:'bad',currentSha:'old',state:{lastAttemptSha:'bad',lastResult:'failed'}}),
    {attempt:false,reason:'previously-failed'}
  );
});
```

Also test that `atomicSwitchCurrent` leaves `current` pointing entirely at old or new, never a half-written path, and cleanup never deletes current/previous.

- [ ] **Step 2: Run the new test and verify it fails because the module does not exist**

Run: `cd vps && node --test tests/deploy-core.test.mjs`

Expected: FAIL with module-not-found for `../src/deploy-core.mjs`.

- [ ] **Step 3: Implement the minimal core module**

Create `vps/src/deploy-core.mjs` using only Node built-ins. State must be persisted as JSON under `stateDir/state.json` with keys:

```js
{
  lastSuccessfulSha: null,
  previousSuccessfulSha: null,
  lastAttemptSha: null,
  lastResult: null,
  lastError: null,
  updatedAt: null
}
```

`writeState` must write to a temporary file then rename it. `atomicSwitchCurrent` must create a temporary symlink in the same parent directory and rename it over `current`. `cleanupReleases` must sort candidate release directories by mtime descending and keep at least `keep=5`, while always excluding current and previous targets from deletion.

- [ ] **Step 4: Run the focused tests**

Run: `cd vps && node --test tests/deploy-core.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Commit message: `feat: add VPS deploy state and release switching core`

---

### Task 2: Pull-Deploy Runner with Test Gate and Rollback

**Files:**
- Create: `vps/src/deploy-runner.mjs`
- Create: `vps/scripts/deploy-vps.mjs`
- Test: `vps/tests/deploy-runner.test.mjs`
- Modify: `vps/package.json`

**Interfaces:**
- Consumes Task 1 state/switch helpers.
- Produces: `runDeployOnce(options) -> Promise<{status:string,remoteSha?:string,currentSha?:string}>`
- Produces CLI script `node scripts/deploy-vps.mjs`.

- [ ] **Step 1: Write failing runner tests with injected command and filesystem operations**

The test doubles must simulate these cases without touching real systemd or GitHub:

1. remote SHA equals current -> no clone/test/restart.
2. checkout SHA mismatch -> reject before switch.
3. `npm test` nonzero -> current unchanged and state records failure.
4. successful test -> switch current, restart once, health checks pass, success state recorded.
5. post-switch health failure -> switch back to previous, restart again, previous health checked.
6. same failed SHA -> no repeated test/deploy.
7. lock acquisition failure -> status `locked` and no action.

Use a command adapter shaped as:

```js
async function exec(command,args,{cwd}={}) {
  return {code:0,stdout:'',stderr:''};
}
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `cd vps && node --test tests/deploy-runner.test.mjs`

Expected: FAIL because `deploy-runner.mjs` does not exist.

- [ ] **Step 3: Implement `runDeployOnce`**

Defaults:

```js
const DEFAULTS = {
  repoUrl:'https://github.com/2qt9wrwbj9-web/jugest.git',
  deployBranch:'deploy/vps',
  rootDir:'/opt/jugest',
  stateDir:'/var/lib/jugest-deploy',
  webService:'jugest-web.service',
  internalHealth:'http://127.0.0.1:3000/api/health',
  nginxHealth:'http://127.0.0.1/api/health',
  externalHealth:'https://jugest.net/api/health',
  keepReleases:5
};
```

Required execution order:

```text
acquire lock
-> git ls-remote origin refs/heads/deploy/vps
-> read current SHA
-> retry suppression
-> clone --no-checkout into releases/<sha>.staging
-> git checkout --detach <sha>
-> verify HEAD == <sha>
-> rename staging -> releases/<sha>
-> npm ci only when vps/package-lock.json exists
-> npm test in release/vps
-> record previous target
-> atomic current switch
-> systemctl restart jugest-web.service
-> internal health
-> nginx health
-> optional external health log
-> success state
-> cleanup
```

If mandatory health fails after switch, rollback to previous target, restart, re-check mandatory health, persist failure state, and exit nonzero. Pre-switch failures must never modify current.

- [ ] **Step 4: Add CLI wrapper and package scripts**

Add to `vps/package.json`:

```json
"deploy": "node scripts/deploy-vps.mjs",
"deploy:status": "node scripts/deploy-status.mjs"
```

`deploy-vps.mjs` calls `runDeployOnce()` and exits nonzero only for real deployment failures, not `up-to-date`, `previously-failed`, or `locked` statuses.

- [ ] **Step 5: Run focused runner/core tests**

Run: `cd vps && node --test tests/deploy-core.test.mjs tests/deploy-runner.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Commit message: `feat: add safe pull deploy runner with rollback`

---

### Task 3: Status Command, Installer, and systemd Units

**Files:**
- Create: `vps/scripts/deploy-status.mjs`
- Create: `vps/scripts/install-auto-deploy.sh`
- Create: `vps/systemd/jugest-deploy.service`
- Create: `vps/systemd/jugest-deploy.timer`
- Test: `vps/tests/deploy-install.test.mjs`

**Interfaces:**
- Consumes Task 1 state JSON.
- Installer prepares release layout and installs units but does **not** enable/start timer by default.

- [ ] **Step 1: Write failing installer/unit tests**

Tests must read the repository files as text and assert:

- service is `Type=oneshot`.
- service executes `/usr/bin/node /opt/jugest/current/vps/scripts/deploy-vps.mjs` or an equivalent stable launcher path.
- timer interval is about one minute using `OnBootSec` + `OnUnitActiveSec=1min`.
- timer is `Persistent=true`.
- deploy branch is fixed to `deploy/vps` in code/config, never derived from current dev branch.
- installer contains no `systemctl enable --now jugest-deploy.timer`.
- installer migrates an existing directory-form `/opt/jugest/current` only after `git rev-parse HEAD` and `npm test` succeed.
- installer can be re-run when `current` is already a symlink.

- [ ] **Step 2: Run focused test and verify failure**

Run: `cd vps && node --test tests/deploy-install.test.mjs`

Expected: FAIL because installer/units do not exist.

- [ ] **Step 3: Implement status command**

`deploy-status.mjs` prints a compact JSON object containing state plus resolved `current` symlink target and current Git SHA if readable. It must not expose secrets.

- [ ] **Step 4: Implement installer**

`install-auto-deploy.sh` must use `set -euo pipefail` and:

```text
require root
create /opt/jugest/releases and /var/lib/jugest-deploy
if current is a real directory:
  read HEAD SHA
  run current/vps npm test
  move directory to releases/<sha> only after tests pass
  create current symlink atomically
if current is already symlink:
  validate target exists
install systemd unit files from current repo
systemctl daemon-reload
print explicit next command but DO NOT enable timer
```

The final message must say the timer remains disabled until explicit approval.

- [ ] **Step 5: Implement systemd units**

`jugest-deploy.service`:

```ini
[Service]
Type=oneshot
User=root
ExecStart=/usr/bin/node /opt/jugest/current/vps/scripts/deploy-vps.mjs
```

Add hardening that does not block required GitHub HTTPS, `/opt/jugest`, `/var/lib/jugest-deploy`, or `systemctl restart jugest-web.service` behavior.

`jugest-deploy.timer`:

```ini
[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
Persistent=true
Unit=jugest-deploy.service
```

Do not enable it in repository code.

- [ ] **Step 6: Run focused installer tests**

Run: `cd vps && node --test tests/deploy-install.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Commit message: `feat: add VPS auto deploy installer and timer units`

---

### Task 4: Full Regression, CI Proof, and Deploy Branch Bootstrap

**Files:**
- Temporarily create: `.github/workflows/vps-auto-deploy-verification.yml`
- Remove after successful evidence capture.
- No production server changes.

**Interfaces:**
- Consumes all previous tasks.
- Produces a verified implementation commit suitable to fast-forward into `deploy/vps`.

- [ ] **Step 1: Run full VPS suite locally when execution environment is available**

Run: `cd vps && npm test`

Expected: every test PASS, `# fail 0`.

- [ ] **Step 2: Add a temporary branch-scoped GitHub Actions workflow**

Workflow requirements:

```yaml
on:
  push:
    branches: [sol/vps-auto-deploy]
```

Use Ubuntu runner + Node 22, run `cd vps && npm test`. The workflow must not deploy and must not access secrets.

- [ ] **Step 3: Verify a fresh CI run for the exact implementation SHA**

Capture run ID, job ID, Node version, total tests/pass/fail, and exact commit SHA from logs. Do not claim completion from an older run.

- [ ] **Step 4: Remove the temporary workflow**

After verification, delete `.github/workflows/vps-auto-deploy-verification.yml` and verify the final tree contains no temporary CI file.

- [ ] **Step 5: Compare protected scope**

Compare base `e228207854b7720fcb43d6972e832b411cd2c223` to final `sol/vps-auto-deploy`. Confirm changes are limited to docs and VPS deploy infrastructure/tests plus the expected `vps/package.json` script change. No protected judgement/store-analysis file may change.

- [ ] **Step 6: Create `deploy/vps` only after final implementation verification**

Create `deploy/vps` at the verified final implementation SHA. Do not force-update it. Creating the branch alone must not alter the VPS because the timer is still disabled.

- [ ] **Step 7: Stop before enabling the real VPS timer**

Report the exact final branch SHA, test evidence, `deploy/vps` SHA, and the manual installation command. Ask ヒロ for explicit approval before any `systemctl enable --now jugest-deploy.timer` instruction is executed on the KAGOYA VPS.
