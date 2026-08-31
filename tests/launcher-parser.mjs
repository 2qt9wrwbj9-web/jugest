import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../ana-launcher.js',import.meta.url),'utf8');
const a=src.indexOf("const decEnt=");
const b=src.indexOf("function dateRangeBack",a);
if(a<0||b<0)throw new Error('parser core not found');
const code=src.slice(a,b)+`\nglobalThis.__P={parseHtml};`;
const ctx={console,globalThis:null,String,Number,Math,Map,Set,Array,Object,JSON,parseInt,isFinite};ctx.globalThis=ctx;
vm.createContext(ctx);vm.runInContext(code,ctx,{timeout:5000});
const html=`<html><body>
<h2>ネオアイムジャグラーEX</h2><table>
<tr><th>台番号</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr>
<tr><td>101</td><td>8,000</td><td>+1500</td><td>32</td><td>31</td></tr>
<tr><td>101</td><td>8,100</td><td>+1600</td><td>33</td><td>31</td></tr>
<tr><td>102</td><td>bad</td><td>+100</td><td>3</td><td>2</td></tr>
</table>
<h2>マイジャグラーV</h2><table>
<tr><th>台番号</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr>
<tr><td>201</td><td>7500</td><td>-300</td><td>26</td><td>25</td></tr>
</table></body></html>`;
const d=ctx.__P.parseHtml(html,'2026-08-23','https://ana-slo.com/x',2);
if(d.machines.length!==2)throw new Error('machine count '+d.machines.length);
if(!d.machines.some(x=>x.machine==='im'&&x.tableNo==='101'&&x.games===8100))throw new Error('duplicate replacement failed');
if(!d.machines.some(x=>x.machine==='my'&&x.tableNo==='201'))throw new Error('my parse failed');
if(d.quality.duplicateRows!==1)throw new Error('duplicate diagnostic failed');
if(d.quality.invalidRows!==1)throw new Error('invalid diagnostic failed');
if(!['A','B','C','D'].includes(d.quality.grade))throw new Error('quality grade missing');
console.log('launcher parser: ok',d.machines.length,d.quality.grade,d.quality.score);


// A full-data table with an explicit machine-name column must win over inferred helper tables.
// The same physical table number must never be counted twice under different machine guesses.
const html2=`<html><body>
<h3>全データ一覧</h3><table>
<tr><th>機種名</th><th>台番号</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr>
<tr><td>ネオアイムジャグラーEX</td><td>301</td><td>7000</td><td>+500</td><td>28</td><td>24</td></tr>
<tr><td>マイジャグラーV</td><td>302</td><td>7600</td><td>+900</td><td>31</td><td>29</td></tr>
</table>
<h2>ファンキージャグラー2</h2><table>
<tr><th>台番号</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr>
<tr><td>301</td><td>7000</td><td>+500</td><td>28</td><td>24</td></tr>
<tr><td>399</td><td>5000</td><td>-100</td><td>18</td><td>15</td></tr>
</table></body></html>`;
const d2=ctx.__P.parseHtml(html2,'2026-08-24','https://ana-slo.com/y',2);
if(d2.machines.length!==2)throw new Error('explicit table preference failed '+d2.machines.length);
if(!d2.quality.explicitTablePreferred)throw new Error('explicit table preference diagnostic missing');
if(d2.machines.some(x=>x.tableNo==='399'))throw new Error('helper table leaked into explicit parse');
if(new Set(d2.machines.map(x=>x.tableNo)).size!==d2.machines.length)throw new Error('tableNo uniqueness failed');

// Without an explicit machine-name table, same physical tableNo under conflicting inferred scopes is excluded.
const html3=`<html><body>
<h2>ネオアイムジャグラーEX</h2><table>
<tr><th>台番号</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr>
<tr><td>401</td><td>6000</td><td>+100</td><td>22</td><td>20</td></tr>
</table>
<h2>マイジャグラーV</h2><table>
<tr><th>台番号</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr>
<tr><td>401</td><td>6000</td><td>+100</td><td>22</td><td>20</td></tr>
<tr><td>402</td><td>6200</td><td>+200</td><td>24</td><td>21</td></tr>
</table></body></html>`;
const d3=ctx.__P.parseHtml(html3,'2026-08-24','https://ana-slo.com/z',2);
if(d3.machines.length!==1||d3.machines[0].tableNo!=='402')throw new Error('conflicting tableNo was not excluded');
if(!d3.quality.conflictRows)throw new Error('conflict diagnostic missing');
console.log('launcher parser hardening: ok',d2.machines.length,d3.machines.length);


// v4.0.7: all 8 live/canonical labels and Unicode/common aliases must resolve.
const html4=`<html><body><h3>全データ一覧</h3><table>
<tr><th>機種名</th><th>台番号</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr>
<tr><td>マイジャグラーⅤ</td><td>501</td><td>7000</td><td>+100</td><td>25</td><td>24</td></tr>
<tr><td>ネオアイムジャグラーEX</td><td>502</td><td>7000</td><td>+100</td><td>25</td><td>24</td></tr>
<tr><td>ゴーゴージャグラーⅢ</td><td>503</td><td>7000</td><td>+100</td><td>25</td><td>24</td></tr>
<tr><td>ファンキージャグラーⅡ</td><td>504</td><td>7000</td><td>+100</td><td>25</td><td>24</td></tr>
<tr><td>ハッピージャグラーVⅢ</td><td>505</td><td>7000</td><td>+100</td><td>25</td><td>24</td></tr>
<tr><td>ジャグラーガールズ</td><td>506</td><td>7000</td><td>+100</td><td>25</td><td>24</td></tr>
<tr><td>ミスタージャグラー</td><td>507</td><td>7000</td><td>+100</td><td>25</td><td>24</td></tr>
<tr><td>ウルトラミラクルジャグラー</td><td>508</td><td>7000</td><td>+100</td><td>25</td><td>24</td></tr>
</table></body></html>`;
const d4=ctx.__P.parseHtml(html4,'2026-08-24','https://ana-slo.com/live-labels',8);
if(d4.machines.length!==8)throw new Error('all-8 live labels failed '+d4.machines.length);
const keys4=new Set(d4.machines.map(x=>x.machine));for(const k of ['my','im','go','fk','hp','gg','mr','um'])if(!keys4.has(k))throw new Error('missing live label key '+k);
if(d4.quality.unmatchedJugglerRows!==0)throw new Error('live labels unexpectedly unmatched');

// Unknown Juggler-looking labels should be diagnosable rather than silently invisible.
const html5=`<html><body><table>
<tr><th>機種名</th><th>台番号</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr>
<tr><td>マイジャグラーV</td><td>601</td><td>5000</td><td>0</td><td>18</td><td>17</td></tr>
<tr><td>未来のジャグラーX</td><td>602</td><td>5000</td><td>0</td><td>18</td><td>17</td></tr>
</table></body></html>`;
const d5=ctx.__P.parseHtml(html5,'2026-08-24','https://ana-slo.com/unknown-label',2);
if(d5.machines.length!==1)throw new Error('unknown Juggler row handling failed');
if(d5.quality.unmatchedJugglerRows!==1||!d5.quality.unmatchedJugglerLabels.includes('未来のジャグラーX'))throw new Error('unknown Juggler diagnostics missing');
console.log('launcher parser aliases/diagnostics: ok',d4.machines.length,d5.quality.unmatchedJugglerRows);


// 96-machine regression: 11 rows use ana-slo's current 「ジャグラーガールズ」 label.
let rows96=[];
for(let i=0;i<96;i++){
  const label=i<11?'ジャグラーガールズ':(i<31?'マイジャグラーV':(i<51?'ネオアイムジャグラーEX':(i<66?'ゴーゴージャグラー3':(i<76?'ファンキージャグラー2':(i<84?'ハッピージャグラーVⅢ':(i<90?'ミスタージャグラー':'ウルトラミラクルジャグラー'))))));
  rows96.push(`<tr><td>${label}</td><td>${700+i}</td><td>6000</td><td>0</td><td>20</td><td>18</td></tr>`);
}
const html96=`<html><body><table><tr><th>機種名</th><th>台番号</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr>${rows96.join('')}</table></body></html>`;
const d96=ctx.__P.parseHtml(html96,'2026-08-24','https://ana-slo.com/96-regression',96);
if(d96.machines.length!==96)throw new Error('96-machine regression failed '+d96.machines.length);
if((d96.quality.machineCounts.gg||0)!==11)throw new Error('girls 11-machine regression failed '+(d96.quality.machineCounts.gg||0));
console.log('launcher parser 96-machine regression: ok',d96.machines.length,d96.quality.machineCounts.gg);

// v4.8.6: 5 HANA HANA canonical IDs must absorb media/diameter naming differences.
const hanaHtml=`<html><body><table>
<tr><th>機種名</th><th>台番号</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr>
<tr><td>Sハナハナホウオウ～天翔～-30</td><td>801</td><td>7000</td><td>+400</td><td>27</td><td>20</td></tr>
<tr><td>Lキングハナハナ-30</td><td>802</td><td>7000</td><td>+500</td><td>28</td><td>20</td></tr>
<tr><td>スマート沖スロ ドラゴンハナハナ～閃光～</td><td>803</td><td>7000</td><td>+600</td><td>29</td><td>19</td></tr>
<tr><td>スターハナハナ-25</td><td>804</td><td>7000</td><td>+700</td><td>30</td><td>22</td></tr>
<tr><td>スマート沖スロ ニューキングハナハナV</td><td>805</td><td>7000</td><td>+800</td><td>31</td><td>23</td></tr>
</table></body></html>`;
const hd=ctx.__P.parseHtml(hanaHtml,'2026-08-25','https://ana-slo.com/hana',5);
if(hd.machines.length!==5)throw new Error('HANA 5-machine parse failed '+hd.machines.length);
for(const k of ['houou','king','dragon','star','newkingv']){
 const r=hd.machines.find(x=>x.machine===k);if(!r)throw new Error('HANA canonical key missing '+k);if(r.category!=='hanahana')throw new Error('HANA category missing '+k);
}
if(hd.machines.find(x=>x.tableNo==='805')?.machine!=='newkingv')throw new Error('New King V collided with King alias');
const unknownHana=`<html><body><table><tr><th>機種名</th><th>台番号</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr><tr><td>未来のハナハナX</td><td>900</td><td>5000</td><td>0</td><td>20</td><td>15</td></tr></table></body></html>`;
const hu=ctx.__P.parseHtml(unknownHana,'2026-08-25','https://ana-slo.com/hana-unknown',1);
if(hu.quality.unmatchedHanaRows!==1||!hu.quality.unmatchedHanaLabels.includes('未来のハナハナX'))throw new Error('unknown HANA diagnostics missing');
console.log('launcher HANA aliases: ok',hd.machines.map(x=>x.machine).join(','));
