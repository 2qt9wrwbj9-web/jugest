import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../vps-resource-ui.mjs',import.meta.url),'utf8');

for(const label of ['Queued','Retry待ち','Leased','Running','Scheduler','停止理由','次ジョブ']){
  assert.ok(source.includes(label),`resource diagnostics UI must show ${label}`);
}
assert.match(source,/latestSchedulerSample/,'resource diagnostics UI must consume scheduler sample freshness');
assert.match(source,/pendingJobs/,'resource diagnostics UI must consume pending job details');

console.log('vps resource queue diagnostics UI PASS');
