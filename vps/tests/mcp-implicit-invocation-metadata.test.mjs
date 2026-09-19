import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

test('judge_machines metadata invites implicit use for Juggler screenshots and ordinary judgement requests',async()=>{
  const source=await readFile(fileURLToPath(new URL('../src/mcp-handler.mjs',import.meta.url)),'utf8');
  const judgeBlock=source.match(/name:'judge_machines'[\s\S]*?annotations:\{readOnlyHint:true,openWorldHint:false\}/)?.[0]||'';
  assert.match(judgeBlock,/screenshot/i);
  assert.match(judgeBlock,/even if.*(?:does not|doesn't).*JUGEST|without.*(?:saying|mentioning).*JUGEST/i);
  assert.match(judgeBlock,/observed current machine data/i);
  assert.doesNotMatch(judgeBlock,/automatically.*PRE|mix.*PRE/i);
});
