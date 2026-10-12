import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {__test as ui} from '../../vps-ui-store-v2.mjs';

const record=(index,name,avgDiff,avgG,win)=>({index,name,metrics:[
 {label:'総差枚',value:avgDiff==='—'?'—':avgDiff},
 {label:'平均差枚',value:avgDiff},
 {label:'平均G',value:avgG},
 {label:'勝率',value:win},
 {label:'台数',value:'24台'},
 {label:'平均出率',value:'104.20%'},
 {label:'平均設定',value:'4.20'}
]});

test('machine mobile comparison uses the existing machine summary without invented BB or RB',()=>{
 const html=ui.mobileMachineRows([record(0,'ゴーゴージャグラー3','+857枚','7,462G','66.7% (16/24)')]);
 assert.match(html,/ゴーゴージャグラー3/);
 assert.match(html,/\+857枚/);
 assert.match(html,/7,462G/);
 assert.match(html,/66\.7%/);
 for(const term of ['総差枚','台数','平均出率','平均設定'])assert.ok(html.includes(term),term);
 assert.ok(!html.includes('BB合算'));
 assert.ok(!html.includes('RB合算'));
 assert.match(html,/class="sv2-machine-mobile-row" name="sv2-machine-detail"/);
});

test('sort descending by selected comparison metric; missing values stay last; original restores order',()=>{
 const rows=[record(0,'A','-189枚','3,560G','33.3%'),record(1,'B','+857枚','7,462G','66.7%'),record(2,'C','—','—','—')];
 for(const [sort,expected] of [['diff',[1,0,2]],['games',[1,0,2]],['win',[1,0,2]],['original',[0,1,2]]]){
  assert.deepEqual(ui.sortedMachineRecords(rows,sort).map(row=>row.index),expected);
 }
 assert.equal(ui.machineMetricNumber('—'),null);
 assert.equal(ui.machineMetricNumber('-1,234枚'),-1234);
 assert.equal(ui.machineMetricNumber('66.7% (16/24)'),66.7);
});

test('machine name is escaped and opened row is retained during sorting',()=>{
 const html=ui.mobileMachineRows([record(3,'<img onerror="alert(1)">','+20枚','1,000G','50.0%')],'diff',3);
 assert.ok(!html.includes('<img'));
 assert.ok(html.includes('&lt;img'));
 assert.ok(html.includes('data-machine-index="3" open'));
});

test('mobile comparison hides the desktop horizontal table only on small screens',()=>{
 const css=readFileSync(new URL('../../vps-ui-store-v2.css',import.meta.url),'utf8');
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/\.sv2-workspace\.store-data-screen \.sv2-machine-table-scroll\{display:none\}/);
 assert.match(css,/\.sv2-workspace\.store-data-screen \.sv2-machine-mobile\{display:block;max-width:100%/);
 assert.match(css,/grid-template-columns:minmax\(0,1\.68fr\)/);
 const cardJs=readFileSync(new URL('../../vps-ui-audit-store.mjs',import.meta.url),'utf8');
 assert.ok(cardJs.includes("${kpi('勝率',fmtWinRate(row))}"));
 assert.ok(cardJs.includes("${kpi('台数',Number.isFinite"));
});
