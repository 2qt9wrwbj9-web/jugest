import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
function once(src,from,to,label){const i=src.indexOf(from);if(i<0)throw new Error(`anchor missing: ${label}`);if(src.indexOf(from,i+from.length)>=0)throw new Error(`anchor not unique: ${label}`);return src.slice(0,i)+to+src.slice(i+from.length)}

let html=read('public/index.html');
if(html.includes('BRUTE_HISTORY_STORAGE'))throw new Error('v4.8.3 storage meter already applied');

const changelog=`v4.8.3 analysis-history storage meter:\n- 解析履歴カードに、全履歴件数・圧縮済み履歴本文の概算容量と、StorageManager estimate() が利用できる環境ではこのサイト全体の使用量 / ブラウザ割当上限目安 / 使用率を表示する。\n- 容量表示は履歴インデックスに既に保存している storedBytes とブラウザの storage estimate だけを使い、履歴本文を全件読み込まない。履歴が増えても容量確認そのものが重くならない。\n- 70%以上を注意、90%以上を警告表示する。上限値はブラウザ・端末状況で変動する目安であり、固定容量として扱わない。\n- 判別数学、single-evidence、strict Champion、Calibration、hybrid ranking、確率表、取得/Relay挙動は変更しない。\n\n`;
html=once(html,'v4.8.2 store-analysis snapshot history:',changelog+'v4.8.2 store-analysis snapshot history:','changelog');
html=once(html,'<title>ジャグラー設定判別 v4.8.2</title>','<title>ジャグラー設定判別 v4.8.3</title>','title');
html=once(html,'>v4.8.2</span>','>v4.8.3</span>','visible version');
html=html.replaceAll('appVersion:"4.8.2"','appVersion:"4.8.3"');
html=html.replace('return["4.8.2",p.shop,','return["4.8.3",p.shop,');
html=html.replace("note:'v4.8.2 uses one hybrid ranking", "note:'v4.8.3 uses one hybrid ranking");

html=once(html,'    <div id="BRUTE_HISTORY"><div class="brute-empty">解析履歴を読み込み中…</div></div>','    <div id="BRUTE_HISTORY_STORAGE" class="hint">保存容量を確認中…</div>\n    <div id="BRUTE_HISTORY"><div class="brute-empty">解析履歴を読み込み中…</div></div>','history storage UI');

const oldFmt='function storeAnalysisFmtBytes(n){n=+n||0;return n>=1048576?(n/1048576).toFixed(1)+"MB":n>=1024?(n/1024).toFixed(1)+"KB":n+"B"}';
const newFmt=[
'function storeAnalysisFmtBytes(n){n=+n||0;return n>=1073741824?(n/1073741824).toFixed(1)+"GB":n>=1048576?(n/1048576).toFixed(1)+"MB":n>=1024?(n/1024).toFixed(1)+"KB":n+"B"}',
'let storeAnalysisStorageEstimateSeq=0;',
'async function storeAnalysisRenderStorageStatus(){let el=$("BRUTE_HISTORY_STORAGE");if(!el||!storeAnalysisHistoryReady)return;let seq=++storeAnalysisStorageEstimateSeq,total=storeAnalysisHistoryIndex.reduce((a,x)=>a+(+x.storedBytes||0),0),count=storeAnalysisHistoryIndex.length,text=`解析履歴：${count.toLocaleString("ja-JP")}件 / 約${storeAnalysisFmtBytes(total)}`,ratio=null;try{if(navigator.storage&&typeof navigator.storage.estimate==="function"){let est=await navigator.storage.estimate();if(seq!==storeAnalysisStorageEstimateSeq)return;let usage=+est?.usage||0,quota=+est?.quota||0;if(quota>0){ratio=usage/quota;text+=`　このサイト全体：${storeAnalysisFmtBytes(usage)} / 上限目安 ${storeAnalysisFmtBytes(quota)}（${(ratio*100).toFixed(1)}%）`}else if(usage>0)text+=`　このサイト全体：${storeAnalysisFmtBytes(usage)}`}}catch(e){console.warn("storage estimate",e)}el.textContent=text+(ratio!=null?" ※上限はブラウザ・端末状況で変動":" ※履歴本文は圧縮保存");el.className="hint"+(ratio>=.9?" modelperf-bad":ratio>=.7?" modelperf-warn":"")}'
].join('\n');
html=once(html,oldFmt,newFmt,'storage meter JS');
html=once(html,'function renderStoreAnalysisHistory(){let box=$("BRUTE_HISTORY"),detail=$("BRUTE_HISTORY_DETAIL");if(!box)return;if(!storeAnalysisHistoryReady){box.innerHTML=\'<div class="brute-empty">解析履歴を読み込み中…</div>\';return}','function renderStoreAnalysisHistory(){let box=$("BRUTE_HISTORY"),detail=$("BRUTE_HISTORY_DETAIL");if(!box)return;if(!storeAnalysisHistoryReady){box.innerHTML=\'<div class="brute-empty">解析履歴を読み込み中…</div>\';return}storeAnalysisRenderStorageStatus();','meter render hook');
html=html.replace('return{app:"juggler-tool",backupVersion:1,appVersion:"4.8.2",createdAt:now.toISOString(),summary:sum,state:st,analysisHistory}','return{app:"juggler-tool",backupVersion:1,appVersion:"4.8.3",createdAt:now.toISOString(),summary:sum,state:st,analysisHistory}');

write('public/index.html',html);write('index.html',html);

const pkg=JSON.parse(read('package.json'));pkg.name='juggler-hanahana-tool-v4830';pkg.version='4.8.3';
for(const k of ['test','check'])if(!pkg.scripts[k].includes('tests/v483-storage-meter.mjs'))pkg.scripts[k]+=' && node tests/v483-storage-meter.mjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
if(fs.existsSync('package-lock.json')){let lock=JSON.parse(read('package-lock.json'));lock.name=pkg.name;lock.version=pkg.version;if(lock.packages?.['']){lock.packages[''].name=pkg.name;lock.packages[''].version=pkg.version}write('package-lock.json',JSON.stringify(lock,null,2)+'\n')}

for(const p of ['tests/netlify-deploy-preflight.mjs','tests/v480-jdata-setting-summary.mjs','tests/v481-evidence-alias-dedup.mjs','tests/v482-analysis-history.mjs']){let s=read(p).replaceAll('4.8.2','4.8.3');write(p,s)}

const test=`import fs from 'node:fs';\nimport assert from 'node:assert/strict';\nconst html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');\nconst root=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');\nassert.equal(html,root,'root/public index must remain byte-identical');\nassert.match(html,/<title>ジャグラー設定判別 v4\\.8\\.3<\\/title>/);\nassert.match(html,/id="BRUTE_HISTORY_STORAGE"/);\nassert.match(html,/async function storeAnalysisRenderStorageStatus\\(\\)/);\nassert.match(html,/navigator\\.storage&&typeof navigator\\.storage\\.estimate===\"function\"/);\nassert.match(html,/storeAnalysisHistoryIndex\\.reduce\\(\\(a,x\\)=>a\\+\\(\\+x\\.storedBytes\\|\\|0\\),0\\)/);\nassert.match(html,/ratio>=\\.9/);\nassert.match(html,/ratio>=\\.7/);\nassert.match(html,/storeAnalysisRenderStorageStatus\\(\\);/);\nassert.match(html,/1073741824/,'byte formatter should show GB');\nconst meter=html.slice(html.indexOf('async function storeAnalysisRenderStorageStatus'),html.indexOf('function renderStoreAnalysisHistory'));\nassert.ok(!/storeAnalysisDbGet\\(/.test(meter),'storage meter must not load snapshot payloads');\nassert.ok(!/storeAnalysisDecode\\(/.test(meter),'storage meter must not expand snapshot payloads');\nconsole.log('PASS v4.8.3 analysis-history storage meter regression');\n`;
write('tests/v483-storage-meter.mjs',test);

for(const p of ['scripts/patch-v483-storage-meter.mjs','.github/workflows/apply-v483-storage-meter.yml']){try{fs.rmSync(p)}catch{}}
console.log('Applied v4.8.3 storage meter patch');
