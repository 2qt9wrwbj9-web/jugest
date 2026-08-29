import { readFile, writeFile } from 'node:fs/promises';

const files = [
  'tests/v470-single-evidence.mjs',
  'tests/v471-performance-regression.mjs',
  'tests/v474-lazy-execution.mjs',
  'tests/v475-trend-roster.mjs',
  'tests/v476-hybrid-ranking.mjs',
  'tests/v477-hybrid-weight-optimizer.mjs',
  'tests/v478-runtime-hybrid.mjs',
  'tests/v479-evidence-contribution-ui.mjs',
];

for (const file of files) {
  let text = await readFile(file, 'utf8');
  const before = text;
  text = text.replaceAll('v4\\.7\\.9', 'v4\\.\\d+\\.\\d+');
  text = text.replaceAll('4\\.7\\.9', '\\d+\\.\\d+\\.\\d+');
  if (text !== before) await writeFile(file, text);
}

console.log('late regression release-version pins normalized');
