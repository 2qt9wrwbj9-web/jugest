import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const source=readFileSync(resolve('vps-resource-ui.mjs'),'utf8');
assert.match(source,/処理実績/,'VPS resource UI must expose per-task history');
assert.match(source,/taskHistory/,'VPS resource UI must consume bounded task history telemetry');
assert.match(source,/Peak RAM/,'task history must show peak RAM');
assert.match(source,/CPU/,'task history must show CPU time');
assert.match(source,/storeMachineCount/,'task history must show store machine scale');
assert.match(source,/rowCount/,'task history must show machine-day workload rows');
console.log('VPS resource task history static PASS');
