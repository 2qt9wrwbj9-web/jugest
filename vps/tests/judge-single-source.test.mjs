import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const judgeSource=readFileSync(new URL('../src/judge/juggler-external-judge.mjs',import.meta.url),'utf8');
const runtimeSource=readFileSync(new URL('../src/analysis/runtime-adapter.mjs',import.meta.url),'utf8');

test('MCP Juggler judgement delegates to the protected JUGEST runtime instead of owning copied math',()=>{
  assert.doesNotMatch(judgeSource,/const\s+MACHINES\s*=|function\s+reverseCoreKnown|function\s+reverseCoreUnknown|function\s+bonusOnlyQ/);
  assert.match(judgeSource,/runExistingJugglerJudgementBatch/);
  assert.match(runtimeSource,/export\s+async\s+function\s+runExistingJugglerJudgementBatch/);
});
