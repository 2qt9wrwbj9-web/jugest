import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createAxisRegistry} from '../research/axis-auto-selector/registry.mjs';
import {runShadowEvaluation,rankShadowRows} from '../research/axis-auto-selector/shadow.mjs';

const fixturePath=resolve('tests/fixtures/axis-auto-selector-sample.json');
const cliPath=resolve('scripts/axis-auto-selector.mjs');
const runCli=args=>spawnSync(process.execPath,[cliPath,...args],{cwd:resolve('.'),encoding:'utf8'});

function plain(value){return JSON.parse(JSON.stringify(value));}

function syntheticSamples(){
  const start=Date.parse('2026-08-09T00:00:00Z');
  const ymd=ms=>new Date(ms).toISOString().slice(0,10);
  const rows=Array.from({length:10},(_,i)=>{
    const good=i<5;
    return{key:String(i+1),controlRank:10-i,controlScore:good?0:1,fixedBonus:0,axes:{'practical-v1':good?1:0},actualES:good?1:0,actualP4:good?1:0};
  });
  return Array.from({length:24},(_,i)=>{
    const date=start+i*86400000;
    return{targetDate:ymd(date),trainingCutoff:ymd(date-86400000),sourceSignature:'s',rows:structuredClone(rows)};
  });
}

test('shadow orchestration creates an isolated profile and per-row audit without mutating input',async()=>{
  const samples=syntheticSamples();
  const before=JSON.stringify(samples);
  const dir=await mkdtemp(join(tmpdir(),'jugest-axis-shadow-'));
  const profilePath=join(dir,'profiles.json');
  const out=await runShadowEvaluation({store:'A',samples,registry:createAxisRegistry(),profilePath,trainedAt:'2026-09-08T00:00:00.000Z'});
  assert.equal(JSON.stringify(samples),before);
  assert.equal(out.shadowOnly,true);
  assert.equal(out.store,'A');
  assert.equal(out.profile.decision,'SHADOW_CHAMPION');
  assert.match(out.profile.id,/^sha256:[0-9a-f]{64}$/);
  assert.equal(out.rows.length,samples.at(-1).rows.length);
  assert.ok(out.rows.some(row=>row.shadowRank!==row.controlRank));
  for(const row of out.rows){
    assert.equal(typeof row.key,'string');
    assert.equal(typeof row.controlRank,'number');
    assert.equal(typeof row.shadowRank,'number');
    assert.equal(typeof row.controlScore,'number');
    assert.equal(typeof row.shadowScore,'number');
    assert.equal(typeof row.contributions,'object');
    assert.equal(typeof row.weights,'object');
    assert.equal(typeof row.disagreement,'number');
    assert.equal(row.profileId,out.profile.id);
  }
  const persisted=JSON.parse(await readFile(profilePath,'utf8'));
  assert.equal(persisted.length,1);
  assert.equal(persisted[0].id,out.profile.id);
});

test('rankShadowRows preserves fixed bonus, selected-axis contributions, and safe row fallback for missing signals',async()=>{
  const samples=syntheticSamples();
  const base=await runShadowEvaluation({store:'A',samples,registry:createAxisRegistry(),trainedAt:'2026-09-08T00:00:00.000Z'});
  const rows=plain(samples.at(-1).rows);
  rows[0].fixedBonus=.125;
  const ranked=rankShadowRows(rows,base.profile,createAxisRegistry());
  const first=ranked.find(row=>row.key===rows[0].key);
  const expected=rows[0].axes['practical-v1']*base.profile.selectedAxes[0].weight+.125;
  assert.ok(Math.abs(first.shadowScore-expected)<1e-12);
  assert.ok(Math.abs(first.contributions['practical-v1']-(rows[0].axes['practical-v1']*base.profile.selectedAxes[0].weight))<1e-12);
  rows[1].axes['practical-v1']=null;
  const withMissing=rankShadowRows(rows,base.profile,createAxisRegistry());
  const missing=withMissing.find(row=>row.key===rows[1].key);
  assert.equal(missing.shadowAvailable,false);
  assert.equal(missing.shadowScore,rows[1].controlScore);
});

test('CLI success writes deterministic shadow audit and isolated profile',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'jugest-axis-cli-'));
  const profile=join(dir,'profiles.json'),output=join(dir,'audit.json');
  const result=runCli(['--input',fixturePath,'--store','A','--through','2026-09-01','--profile',profile,'--output',output,'--shadow']);
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/store=A/);
  assert.match(result.stdout,/SHADOW_CHAMPION/);
  const audit=JSON.parse(await readFile(output,'utf8'));
  assert.equal(audit.shadowOnly,true);
  assert.equal(audit.store,'A');
  assert.equal(audit.through,'2026-09-01');
  assert.equal(audit.profile.decision,'SHADOW_CHAMPION');
  assert.equal(JSON.parse(await readFile(profile,'utf8')).length,1);
});

test('CLI rejects missing --shadow, invalid date, and missing store',()=>{
  const base=['--input',fixturePath,'--store','A','--through','2026-09-01','--profile','/tmp/jugest-p.json','--output','/tmp/jugest-a.json'];
  let result=runCli(base);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/--shadow/);
  result=runCli([...base,'--shadow'].map((value,index,array)=>array[index-1]==='--through'?'2026-02-30':value));
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/through|date/i);
  result=runCli(['--input',fixturePath,'--through','2026-09-01','--profile','/tmp/jugest-p.json','--output','/tmp/jugest-a.json','--shadow']);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/store/i);
});

test('CLI rejects malformed input, store mismatch, provenance violation, and unsafe profile path',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'jugest-axis-cli-fail-'));
  const malformed=join(dir,'malformed.json');
  await writeFile(malformed,'{not-json','utf8');
  let result=runCli(['--input',malformed,'--store','A','--through','2026-09-01','--profile',join(dir,'p.json'),'--output',join(dir,'a.json'),'--shadow']);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/JSON|input/i);

  result=runCli(['--input',fixturePath,'--store','B','--through','2026-09-01','--profile',join(dir,'p.json'),'--output',join(dir,'a.json'),'--shadow']);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/store/i);

  const samples=syntheticSamples();
  samples[0].trainingCutoff=samples[0].targetDate;
  const poison=join(dir,'poison.json');
  await writeFile(poison,JSON.stringify({schema:'jugest-axis-samples-v1',store:'A',samples}),'utf8');
  result=runCli(['--input',poison,'--store','A','--through','2026-09-01','--profile',join(dir,'p2.json'),'--output',join(dir,'a2.json'),'--shadow']);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/trainingCutoff|targetDate|provenance/i);

  const missingParent=join(dir,'does-not-exist','profiles.json');
  result=runCli(['--input',fixturePath,'--store','A','--through','2026-09-01','--profile',missingParent,'--output',join(dir,'a3.json'),'--shadow']);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/ENOENT|profile|write/i);
});
