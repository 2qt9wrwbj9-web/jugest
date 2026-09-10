import test from 'node:test';
import assert from 'node:assert/strict';
import {PARSER_VERSION,parseAnaSloHtml} from '../src/collector/ana-parser.mjs';

const DATE='2026-09-09';
const URL=`https://ana-slo.com/${DATE}-abc-data/`;

function explicitTable(rows){
  return `<html><body><table><tr><th>台番</th><th>機種名</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr>${rows.join('')}</table></body></html>`;
}
function row(no,name,games,diff,bb,rb){
  return `<tr><td>${no}</td><td>${name}</td><td>${games}</td><td>${diff}</td><td>${bb}</td><td>${rb}</td></tr>`;
}

test('ana-slo parser preserves representative Juggler and HANA rows',()=>{
  assert.equal(PARSER_VERSION,4500);
  const html=explicitTable([
    row('275','マイジャグラーV','8,123','+1,450','31','29'),
    row('501','キングハナハナ','7,000','-320','25','20')
  ]);
  const day=parseAnaSloHtml({html,date:DATE,sourceUrl:URL,expectedMedian:NaN});
  assert.deepEqual(day.machines,[
    {machine:'my',category:'juggler',sourceMachineName:'マイジャグラーV',tableNo:'275',games:8123,diff:1450,bb:31,rb:29},
    {machine:'king',category:'hanahana',sourceMachineName:'キングハナハナ',tableNo:'501',games:7000,diff:-320,bb:25,rb:20}
  ]);
  assert.equal(day.quality.grade,'A');
  assert.equal(day.quality.totalMachines,2);
});

test('ana-slo parser prefers explicit machine-name tables over inferred helper tables',()=>{
  const html=`<h2>マイジャグラーV</h2>
    <table><tr><th>台番</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr>
      <tr><td>100</td><td>5000</td><td>500</td><td>20</td><td>18</td></tr></table>
    ${explicitTable([row('101','マイジャグラーV','6000','800','24','22')]).replace('<html><body>','').replace('</body></html>','')}`;
  const day=parseAnaSloHtml({html,date:DATE,sourceUrl:URL});
  assert.deepEqual(day.machines.map(x=>x.tableNo),['101']);
  assert.equal(day.quality.explicitTablePreferred,true);
  assert.match(day.quality.warnings.join('\n'),/機種名列つき表を優先/);
});

test('ana-slo parser deduplicates same physical table and drops machine conflicts',()=>{
  const html=explicitTable([
    row('200','マイジャグラーV','5000','-','20','18'),
    row('200','マイジャグラーV','6100','500','25','23'),
    row('300','マイジャグラーV','5000','100','18','17'),
    row('300','キングハナハナ','5200','120','19','18')
  ]);
  const day=parseAnaSloHtml({html,date:DATE,sourceUrl:URL});
  assert.equal(day.machines.length,1);
  assert.equal(day.machines[0].tableNo,'200');
  assert.equal(day.machines[0].games,6100);
  assert.equal(day.machines[0].diff,500);
  assert.equal(day.quality.duplicateRows,2);
  assert.equal(day.quality.conflictRows,1);
});

test('ana-slo parser returns diagnostics instead of accepting unsupported HTML',()=>{
  const html=explicitTable([row('1','別のスロット','5000','100','20','15')]);
  const day=parseAnaSloHtml({html,date:DATE,sourceUrl:URL});
  assert.equal(day.machines.length,0);
  assert.equal(day.quality.totalMachines,0);
  assert.equal(day.date,DATE);
  assert.equal(day.sourceUrl,URL);
});
