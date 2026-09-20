import test from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const pluginRoot=join(here,'..','..','plugins','jugest');
const read=path=>readFile(join(pluginRoot,path),'utf8');

test('JUGEST plugin binds the registered ChatGPT app instead of declaring a desktop-only MCP server',async()=>{
  const manifest=JSON.parse(await read('plugin.json'));
  assert.equal(manifest.$schema,'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.equal(manifest.name,'jugest');
  assert.equal(manifest.version,'0.1.1');
  assert.equal(manifest.extensions?.['com.openai']?.interface?.displayName,'JUGEST');
  assert.equal(manifest.extensions?.['com.openai']?.apps,'./.app.json');

  const app=JSON.parse(await read('.app.json'));
  assert.deepEqual(app,{apps:{jugest:{id:'asdk_app_6aae6ef520dc8191af6ccfa59395524d',required:true}}});
  await assert.rejects(access(join(pluginRoot,'mcp.json')));
});

test('JUGEST routing metadata strongly advertises implicit Juggler screenshot judgement',async()=>{
  const manifest=JSON.parse(await read('plugin.json'));
  assert.match(manifest.description,/automatically use JUGEST.*Juggler.*screenshot/i);
  assert.match(manifest.extensions?.['com.openai']?.interface?.longDescription||'',/without.*mention(?:ing)? JUGEST|even if.*JUGEST/i);

  const skill=await read('skills/jugest-live-analysis/SKILL.md');
  assert.match(skill,/even if (?:they|the user) do(?:es)? not mention JUGEST/i);
  assert.match(skill,/みんレポ|min-repo/i);
  assert.match(skill,/generic.*pachislot.*do not|do not.*generic.*pachislot/i);

  const openai=await read('skills/jugest-live-analysis/agents/openai.yaml');
  assert.match(openai,/short_description: "Automatically .*Juggler screenshots.*JUGEST"/i);
  assert.match(openai,/allow_implicit_invocation: true/);
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
  assert.doesNotMatch(openai,/dependencies:|type: "mcp"|value: "jugest"|https:\/\/jugest\.net\/mcp/);
  assert.doesNotMatch(openai,/Bearer|receiver-token|x-jugest-channel-id/i);
});
