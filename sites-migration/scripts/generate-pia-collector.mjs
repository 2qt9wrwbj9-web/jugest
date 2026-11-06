import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';

const read = file => readFileSync(new URL('../upstream/vps/src/collectors/' + file, import.meta.url), 'utf8');
function section(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error('PIA source boundary not found: ' + start);
  return source.slice(from, to).trimEnd();
}
const collector = read('pia-public.mjs'), scheduler = read('pia-scheduler.mjs');
const sourceHash = createHash('sha256').update(collector).update(scheduler).digest('hex');
const kernel = section(collector, 'export const PIA_ENDPOINT', '\nfunction readState(');
const date = section(scheduler, 'const JST_OFFSET_MS=', '\nexport async function runPiaCollectorTick(');
writeFileSync(new URL('../lib/collectors/generated-pia.mjs', import.meta.url), `// Frozen PIA collector and scheduling rules. Source SHA-256: ${sourceHash}
import {createHash} from 'node:crypto';
import '../../upstream/machine-names.js';

${kernel}

${date}
`);
