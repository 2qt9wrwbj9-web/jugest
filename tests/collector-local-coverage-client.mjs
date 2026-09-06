import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');
assert.match(html,/function v510CollectorCoveragePayload\(\)/,'built JUGEST must derive local date coverage from stored external days');
assert.match(html,/localCoverage:v510CollectorCoveragePayload\(\)/,'Collector status refresh must send local date coverage to Relay');
assert.match(html,/slice\(-370\)/,'coverage payload must stay bounded per store');
console.log('PASS JUGEST sends bounded local-day coverage during Collector status refresh');
