import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import '../machine-names.js';

const registry=globalThis.JugestMachineNames;
const official={
  my:'マイジャグラーⅤ',my6:'マイジャグラーVI',im:'ネオアイムジャグラーEX',
  go:'ゴーゴージャグラー3',fk:'ファンキージャグラー2',hp:'ハッピージャグラーV Ⅲ',
  gg:'ジャグラーガールズSS',mr:'ミスタージャグラー',um:'ウルトラミラクルジャグラー',
  houou:'ハナハナホウオウ〜天翔〜',king:'キングハナハナ-30',
  dragon:'ドラゴンハナハナ〜閃光〜',star:'スターハナハナ',newkingv:'ニューキングハナハナV'
};
const examples={
  my:['マイジャグV','ＳマイジャグラーⅤＫＤ'],
  my6:['マイジャグⅥ','ＳマイジャグラーⅥＫＤ','マイジャグラーVI'],
  im:['ネオアイム','ネオアイムジャグラーEX'],
  go:['ゴージャグ3','ゴーゴージャグラー3'],
  fk:['ファンキー2','ファンキージャグラー2'],
  hp:['ハッピージャグラーVⅢ','ハッピーV3'],
  gg:['ガールズSS'],mr:['ミスター'],um:['ウルミラ'],
  houou:['ハナハナホウオウ～天翔～','ハナハナホウオウ〜天翔〜-30'],
  king:['キングハナハナ','キングハナハナ-30'],
  dragon:['ドラゴンハナハナ～閃光～','スマート沖スロ ドラゴンハナハナ〜閃光〜'],
  star:['スターハナハナ-30','スマート沖スロ スターハナハナ'],
  newkingv:['ニューキングハナハナV-30','スマート沖スロ ニューキングハナハナV']
};

test('all fourteen keys have canonical and space-saving display names, and no identifiers are merged',()=>{
  assert.deepEqual(registry.keys,Object.keys(official));
  for(const [key,name] of Object.entries(official)){
    assert.equal(registry.full(key),name,key);
    assert.ok(registry.short(key)?.length>0,key);
    assert.equal(registry.resolve(name),key,key);
    for(const variant of registry.variants(key))assert.equal(registry.resolve(variant),key,variant);
    for(const alias of examples[key])assert.equal(registry.resolve(alias),key,alias);
  }
  assert.equal(registry.resolve('新機種未登録'),null);
  assert.notEqual(registry.resolve('マイジャグラーVI'),registry.resolve('マイジャグラーⅤ'));
  assert.notEqual(registry.resolve('ニューキングハナハナV-30'),registry.resolve('キングハナハナ-30'));
});

test('Hana variants retain their separate actual product names without inventing new judgement keys',()=>{
  for(const key of ['houou','dragon','star','newkingv']){
    assert.ok(registry.variants(key).length>=2,key);
    assert.equal(new Set(registry.variants(key).map(name=>registry.resolve(name))).size,1,key);
  }
  assert.equal(registry.token('ドラゴンハナハナ～閃光～'),registry.token('ドラゴンハナハナ〜閃光〜'));
});

test('both standalone collectors accept canonical and legacy names with the same key precedence',()=>{
  for(const file of ['ana-launcher.js','ana-single-day.js']){
    const src=readFileSync(file,'utf8');
    const start=src.indexOf('const aliases=['),end=src.indexOf('const num=',start);
    assert.ok(start>=0&&end>start,file+' token parser present');
    const code=src.slice(start,end);
    for(const [key,forms] of Object.entries(examples))for(const input of [official[key],...forms]){
      const actual=vm.runInNewContext(code+';norm(input)',{input});
      assert.equal(actual,key,`${file}: ${input}`);
    }
    assert.equal(vm.runInNewContext(code+";norm('未登録機種')"), '');
  }
});

test('display names are built from one source and the standalone script is included in build output',()=>{
  const html=readFileSync('index.html','utf8'),build=readFileSync('build.mjs','utf8');
  assert.ok(html.includes('<script src="./machine-names.js"></script>'));
  assert.ok(html.includes('const MONTH_REPORT_LABEL=Object.fromEntries(JUGGLER_MACHINE_KEYS.map(k=>[k,NAMES.short(k)]))'));
  assert.ok(html.includes('function analysisMachineName(k){return NAMES.short(k)'));
  assert.ok(build.includes("'machine-names.js','index.html'"));
});
