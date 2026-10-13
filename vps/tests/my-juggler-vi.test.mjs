import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {judgeMachinesPublic} from '../src/mcp-handler.mjs';
import {normalizePiaJugglerRow} from '../src/collectors/pia-public.mjs';

const rootDir=resolve(dirname(fileURLToPath(import.meta.url)),'../..');

test('My Juggler VI is a distinct accepted MCP machine with identical V setting posterior, with or without difference',async()=>{
  const scenarios=[
    {games:8000,bb:34,rb:29},
    {games:6500,bb:19,rb:25,diff:-480},
    {games:4200,bb:23,rb:13,diff:920},
    {games:1500,bb:3,rb:6,diff:0}
  ];
  const inputs=scenarios.flatMap((s,i)=>[
    {machine:'my',tableNo:'V-'+i,...s},
    {machine:'my6',tableNo:'VI-'+i,...s}
  ]);
  const out=await judgeMachinesPublic(inputs,{rootDir});
  assert.equal(out.ok,true);
  for(let i=0;i<scenarios.length;i++){
    const a=out.machines[2*i],b=out.machines[2*i+1];
    assert.equal(a.ok,true,JSON.stringify(a));
    assert.equal(b.ok,true,JSON.stringify(b));
    assert.equal(a.machine,'my');
    assert.equal(b.machine,'my6');
    assert.notEqual(a.machineName,b.machineName);
    for(const field of ['q','expectedSetting','p4','p5','p6','estimatedGrape','estimatedGrapeCount','grapeCountLo','grapeCountHi','reverseWarn','method']){
      assert.deepEqual(b[field],a[field],field+' mismatch at scenario '+i);
    }
    assert.equal(b.tableNo,'VI-'+i);
    assert.deepEqual([a.diff,b.diff],scenarios[i].diff===undefined?[null,null]:[scenarios[i].diff,scenarios[i].diff]);
  }
});

test('PIA identifies VI before V and retains separate machine key',()=>{
  const row=name=>({store_id:35,machine_no:'601',name,source_machine_code:'j6',
    out:17000,special_out:2000,special_1:20,special_2d:16,difference:190});
  for(const name of ['ＳマイジャグラーⅥＫＤ','マイジャグラーVI','マイジャグラー6','マイジャグⅥ']){
    const r=normalizePiaJugglerRow(row(name));
    assert.equal(r?.machine,'my6',name);
    assert.equal(r?.sourceMachineName,'マイジャグラーⅥ');
  }
  assert.equal(normalizePiaJugglerRow(row('ＳマイジャグラーⅤＫＤ')).machine,'my');
});

test('Ana-slo collectors always check VI aliases ahead of V',()=>{
  for(const file of ['ana-launcher.js','ana-single-day.js']){
    const script=readFileSync(resolve(rootDir,file),'utf8');
    const vi=script.indexOf("['my6',[");
    const v=script.indexOf("['my',[");
    assert.ok(vi>=0&&v>vi,file+' machine alias precedence');
    assert.ok(script.includes('マイジャグラーⅥ'),file+' has VI name');
  }
});
