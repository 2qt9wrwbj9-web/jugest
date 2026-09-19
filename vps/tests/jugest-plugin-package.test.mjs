import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const pluginRoot=join(here,'..','..','plugins','jugest');
const read=path=>readFile(join(pluginRoot,path),'utf8');

test('JUGEST plugin manifest and MCP config use the portable plugin format',async()=>{
  const manifest=JSON.parse(await read('plugin.json'));
  assert.equal(manifest.$schema,'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.equal(manifest.name,'jugest');
  assert.equal(manifest.version,'0.1.0');
  assert.equal(manifest.extensions?.['com.openai']?.interface?.displayName,'JUGEST');

  const mcp=JSON.parse(await read('mcp.json'));
  assert.equal(mcp.$schema,'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
  assert.equal(mcp.mcpServers?.jugest?.type,'streamable-http');
  assert.equal(mcp.mcpServers?.jugest?.url,'https://jugest.net/mcp');
  assert.equal(JSON.stringify(mcp).includes('receiver-token'),false);
});

test('JUGEST skill keeps current-machine judgement separate from PRE/store read',async()=>{
  const skill=await read('skills/jugest-live-analysis/SKILL.md');
  assert.match(skill,/^---\nname: jugest-live-analysis\ndescription:/);
  assert.match(skill,/Call `judge_machines` once with all readable machines/);
  assert.match(skill,/does \*\*not\*\* authorize mixing PRE v2/i);
  assert.match(skill,/Do not call `get_store_prediction` merely because the store is known/i);
  assert.match(skill,/Do not reproduce or approximate JUGEST posterior math yourself/i);
  assert.match(skill,/If `diff` is unreadable, omit it/i);

  const openai=await read('skills/jugest-live-analysis/agents/openai.yaml');
  assert.match(openai,/allow_implicit_invocation: true/);
  assert.match(openai,/value: "jugest"/);
  assert.match(openai,/url: "https:\/\/jugest\.net\/mcp"/);
  assert.doesNotMatch(openai,/Bearer|receiver-token|x-jugest-channel-id/i);
});

test('JUGEST package strongly cues implicit judgement for ordinary Juggler requests',async()=>{
  const manifest=JSON.parse(await read('plugin.json'));
  const iface=manifest.extensions?.['com.openai']?.interface||{};
  assert.match(String(manifest.description||''),/automatically|implicit/i);
  assert.match(String(iface.shortDescription||''),/screenshot|setting judgement/i);
  assert.match(String(iface.longDescription||''),/without.*mention.*JUGEST|even if.*JUGEST/i);

  const skill=await read('skills/jugest-live-analysis/SKILL.md');
  assert.match(skill,/do not require the user to mention `?JUGEST`?/i);
  assert.match(skill,/Juggler.*screenshot|screenshot.*Juggler/i);
  assert.match(skill,/G\s*\/\s*BB\s*\/\s*RB|games.*BB.*RB/i);
  assert.match(skill,/prefer.*`judge_machines`|`judge_machines`.*prefer/i);

  const openai=await read('skills/jugest-live-analysis/agents/openai.yaml');
  assert.match(openai,/allow_implicit_invocation: true/);
  assert.match(openai,/automatically|implicit/i);
  assert.match(openai,/Juggler|ジャグラー/i);
});
