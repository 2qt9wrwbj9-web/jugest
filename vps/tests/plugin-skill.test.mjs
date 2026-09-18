import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../plugins/jugest/',import.meta.url));

async function text(rel){return await readFile(new URL(rel,new URL('../../plugins/jugest/',import.meta.url)),'utf8');}

test('portable JUGEST plugin manifest and live judgement skill are present',async()=>{
  const manifest=JSON.parse(await text('plugin.json'));
  assert.equal(manifest.name,'jugest');
  assert.match(manifest.$schema,/agent-plugins\.org/);
  const skill=await text('skills/jugest-live-judge/SKILL.md');
  assert.match(skill,/judge_machines/);
  assert.match(skill,/スクリーンショット|画像/);
  assert.match(skill,/G.*BB.*RB/s);
});

test('live judgement skill forbids implicit PRE/store blending and manual probability math',async()=>{
  const skill=await text('skills/jugest-live-judge/SKILL.md');
  assert.match(skill,/PRE.*自動.*混ぜ|自動.*PRE.*混ぜ/s);
  assert.match(skill,/店舗名.*あっても|店舗名.*含まれても/s);
  assert.match(skill,/設定確率.*自分で.*計算|手計算.*しない/s);
});

test('store intelligence skill keeps PRE as a separate information source',async()=>{
  const skill=await text('skills/jugest-store-intelligence/SKILL.md');
  for(const name of ['list_stores','get_store_day','get_store_prediction','get_store_comparison'])assert.match(skill,new RegExp(name));
  assert.match(skill,/別枠|分離/);
});
