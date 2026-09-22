import test from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const pluginRoot=join(here,'..','..','plugins','jugest');
const read=path=>readFile(join(pluginRoot,path),'utf8');

test('JUGEST plugin binds the registered ChatGPT app as the full analysis frontend',async()=>{
  const manifest=JSON.parse(await read('plugin.json'));
  assert.equal(manifest.$schema,'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.equal(manifest.name,'jugest');
  assert.equal(manifest.version,'0.2.0');
  assert.match(manifest.description,/JUGEST.*analysis/i);
  assert.equal(manifest.extensions?.['com.openai']?.interface?.displayName,'JUGEST');
  assert.equal(manifest.extensions?.['com.openai']?.apps,'./.app.json');
  const capabilities=manifest.extensions?.['com.openai']?.interface?.capabilities||[];
  assert.ok(capabilities.includes('Read store tendency analysis'));
  assert.ok(capabilities.includes('Read PRE and comparison data'));

  const app=JSON.parse(await read('.app.json'));
  assert.deepEqual(app,{apps:{jugest:{id:'asdk_app_6aae6ef520dc8191af6ccfa59395524d',required:true}}});
  await assert.rejects(access(join(pluginRoot,'mcp.json')));
});

test('JUGEST skill routes all supported analysis intents to live tools',async()=>{
  const skill=await read('skills/jugest-live-analysis/SKILL.md');
  assert.match(skill,/^---\nname: jugest-live-analysis\ndescription:/);
  assert.match(skill,/## Intent-to-tool routing/);
  for(const tool of ['judge_machines','list_stores','get_store_days','get_store_day','get_store_analysis','get_store_status','get_store_analysis_history','get_store_prediction','get_store_comparison']){
    assert.match(skill,new RegExp('`'+tool+'`'));
  }
  assert.match(skill,/Never embed or reproduce JUGEST probability tables, PRE formulas, ranking formulas/i);
  assert.match(skill,/generic.*pachislot.*do not|do not.*generic.*pachislot/i);

  const openai=await read('skills/jugest-live-analysis/agents/openai.yaml');
  assert.match(openai,/display_name: "JUGEST Analysis"/);
  assert.match(openai,/short_description: "Automatically route Juggler screenshots and store analysis to JUGEST"/);
  assert.match(openai,/allow_implicit_invocation: true/);
});

test('JUGEST plugin preserves safe screenshot extraction and evidence separation',async()=>{
  const skill=await read('skills/jugest-live-analysis/SKILL.md');
  assert.match(skill,/call `judge_machines` once/i);
  assert.match(skill,/If `diff` is unreadable, omit it/i);
  assert.match(skill,/never guess numeric values/i);
  assert.match(skill,/Do not reproduce or approximate JUGEST posterior math yourself/i);
  assert.match(skill,/known store.*does not authorize mixing PRE\/store tendencies|does not authorize mixing PRE\/store tendencies.*known store/i);
  assert.match(skill,/present them as separate evidence/i);

  const openai=await read('skills/jugest-live-analysis/agents/openai.yaml');
  assert.doesNotMatch(openai,/dependencies:|type: "mcp"|value: "jugest"|https:\/\/jugest\.net\/mcp/);
  assert.doesNotMatch(openai,/Bearer|receiver-token|x-jugest-channel-id/i);
});
