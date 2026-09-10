import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';

const ROOT=resolve(import.meta.dirname,'..');
const read=(path)=>readFileSync(join(ROOT,path),'utf8');

test('collector service is hardened, unprivileged, and uses persistent data paths',()=>{
  const unit=read('systemd/jugest-collector.service');
  assert.match(unit,/Type=oneshot/);
  assert.match(unit,/User=jugest/);
  assert.match(unit,/Group=jugest/);
  assert.match(unit,/WorkingDirectory=\/opt\/jugest\/current\/vps/);
  assert.match(unit,/ExecStart=\/usr\/bin\/node \/opt\/jugest\/current\/vps\/scripts\/collector\.mjs collect-now/);
  assert.match(unit,/After=network-online\.target/);
  assert.match(unit,/Wants=network-online\.target/);
  assert.match(unit,/EnvironmentFile=-\/etc\/jugest\/jugest\.env/);
  assert.match(unit,/JUGEST_DB_PATH=\/var\/lib\/jugest\/jugest\.sqlite/);
  assert.match(unit,/JUGEST_COLLECTOR_RAW_ROOT=\/var\/lib\/jugest\/collector\/raw/);
  assert.match(unit,/NoNewPrivileges=true/);
  assert.match(unit,/ProtectSystem=strict/);
  assert.match(unit,/ProtectHome=true/);
  assert.match(unit,/ReadWritePaths=\/var\/lib\/jugest/);
  assert.doesNotMatch(unit,/User=root/);
});

test('collector timer retries approximately once per minute and is installable but not self-starting',()=>{
  const timer=read('systemd/jugest-collector.timer');
  assert.match(timer,/OnBootSec=/);
  assert.match(timer,/OnUnitInactiveSec=60s/);
  assert.match(timer,/Persistent=true/);
  assert.match(timer,/Unit=jugest-collector\.service/);
  assert.match(timer,/WantedBy=timers\.target/);
});

test('installer creates durable directories and installs units without enabling collection',()=>{
  const script=read('scripts/install-collector.sh');
  assert.match(script,/mkdir -p .*\/var\/lib\/jugest\/collector\/raw/);
  assert.match(script,/chown .*jugest:jugest.*\/var\/lib\/jugest/);
  assert.match(script,/chmod 0700 .*\/var\/lib\/jugest\/collector\/raw/);
  assert.match(script,/jugest-collector\.service/);
  assert.match(script,/jugest-collector\.timer/);
  assert.match(script,/systemctl daemon-reload/);
  assert.doesNotMatch(script,/systemctl\s+(?:--\S+\s+)*enable\b/);
  assert.doesNotMatch(script,/systemctl\s+(?:--\S+\s+)*start\b/);
  assert.doesNotMatch(script,/>\s*\/etc\/jugest\/jugest\.env/);
  assert.match(script,/disabled/i);
});
