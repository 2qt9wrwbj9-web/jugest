import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s);
function once(src, from, to, label){
  const first=src.indexOf(from); if(first<0) throw new Error(`anchor missing: ${label}`);
  if(src.indexOf(from, first+from.length)>=0) throw new Error(`anchor not unique: ${label}`);
  return src.slice(0,first)+to+src.slice(first+from.length);
}

let html=read('public/index.html');
if(html.includes('STORE_ANALYSIS_INDEX_KEY="storeAnalysisHistoryIndexV1"')) throw new Error('v4.8.2 analysis history already applied');

const changelog=`v4.8.2 store-analysis snapshot history:\n- 店舗解析の法則探索が完了した時点を、店舗・解析条件・使用データ範囲・集計サマリ・上位単一根拠・上位複合候補・機種別配分として固定スナップショット保存する。保存履歴は現在データで再計算せず、過去時点の解析結果として閲覧できる。\n- 同一JUGEST版・同一解析条件・同一入力データ指紋の再実行は重複保存しない。履歴本文は1件ごとにgzip圧縮して既存IndexedDBの別キーへ分離し、通常表示では軽量インデックスだけ読むため、履歴件数が増えても起動時に全本文を展開しない。\n- 次回狙い台は従来どおりユーザーが明示的に予測タブを開いた時だけ計算し、その場合のみ同じ解析スナップショットへTop30を追記する。法則探索完了時に重いv4予測を自動追加しない。\n- 完全バックアップへ店舗解析履歴を含め、v4.8.2バックアップの復元時は履歴も復元する。旧バックアップに履歴が無い場合は既存履歴を消さない。\n- externalJudge、Juggler/HANA確率表、single-evidence算術、strict Champion、Calibration、store-share constraint、hybrid ranking、取得/Relay挙動は変更しない。\n\n`;
html=once(html,'v4.8.1 single-evidence alias dedup:',changelog+'v4.8.1 single-evidence alias dedup:','changelog');
html=once(html,'<title>ジャグラー設定判別 v4.8.1</title>','<title>ジャグラー設定判別 v4.8.2</title>','title');
html=once(html,'<h1>ジャグラー・ハナハナ設定判別 <span style="font-size:11px;color:#b7ad9f">v4.8.1</span></h1>','<h1>ジャグラー・ハナハナ設定判別 <span style="font-size:11px;color:#b7ad9f">v4.8.2</span></h1>','visible version');
html=html.replace("note:'v4.8.1 uses one hybrid ranking", "note:'v4.8.2 uses one hybrid ranking");

const historyHtml=read('scripts/v482-analysis-history.fragment.html').trimEnd();
html=once(html,'  <details><summary>信頼度の見方</summary>',historyHtml+'\n  <details><summary>信頼度の見方</summary>','history UI');

const historyJs=read('scripts/v482-analysis-history.fragment.js').trimEnd();
html=once(html,'async function externalDbClear(){',historyJs+'\nasync function externalDbClear(){','history JS');
html=once(html,'  externalSeq=Math.max(externalSeq,Math.max(0,...externalDays.map(r=>+r.id||0))+1);','  await storeAnalysisLoadIndex();\n  externalSeq=Math.max(externalSeq,Math.max(0,...externalDays.map(r=>+r.id||0))+1);','history init');
html=once(html,'prepLite={shop:prep.shop,latest:prep.latest,from:prep.from,days:[...prep.days],overall:{...prep.overall},rowCount};','prepLite={shop:prep.shop,latest:prep.latest,from:prep.from,days:[...prep.days],overall:{...prep.overall},rowCount,sourceFingerprint:storeAnalysisFingerprint(prep)};','analysis fingerprint');
html=once(html,'renderBruteView();await nextFrame();v4RenderTwin(false);showMiniToast("法則探索が終わったよ")','renderBruteView();await nextFrame();v4RenderTwin(false);try{await storeAnalysisSaveCurrent(bruteResults)}catch(e){console.warn("analysis snapshot save",e);showMiniToast("解析は完了したけど履歴保存に失敗したよ")}showMiniToast("法則探索が終わったよ")','save analysis snapshot');
html=once(html,'if(saved)queueAutoSave()\n}','if(saved)queueAutoSave();storeAnalysisAttachForecast(r,target,top).catch(e=>console.warn("analysis forecast snapshot",e))\n}','attach explicit forecast');
html=once(html,'renderBruteView()}\nasync function runBruteAnalysis','renderBruteView();renderStoreAnalysisHistory()}\nasync function runBruteAnalysis','render history with analysis page');
html=once(html,'$("BRUTE_SHOP").onchange=e=>{bruteShopFilter=e.target.value;bruteResults=null;v4InvalidatePredictionCache();queueAutoSave();renderBruteAnalysis();v4RenderTwin(false)};','$("BRUTE_SHOP").onchange=e=>{bruteShopFilter=e.target.value;bruteResults=null;storeAnalysisHistoryOpenId="";v4InvalidatePredictionCache();queueAutoSave();renderBruteAnalysis();v4RenderTwin(false)};','shop history refresh');
html=once(html,'$("BRUTE_RUN").onclick=runBruteAnalysis;','if($("BRUTE_HISTORY_REFRESH"))$("BRUTE_HISTORY_REFRESH").onclick=renderStoreAnalysisHistory;\n$("BRUTE_RUN").onclick=runBruteAnalysis;','history refresh button');

const oldBackup=`function buildBackupPackage(){\n let st=currentStateObject();if(!st)throw new Error("保存データを取得できなかった");\n let now=new Date(),sum=dataSummaryFromState(st);\n return{app:"juggler-tool",backupVersion:1,appVersion:"4.8.1",createdAt:now.toISOString(),summary:sum,state:st}\n}`;
const newBackup=`async function buildBackupPackage(){\n let st=currentStateObject();if(!st)throw new Error("保存データを取得できなかった");\n let now=new Date(),sum=dataSummaryFromState(st),analysisHistory=await storeAnalysisExportAll();sum.analysisSnapshots=analysisHistory.snapshots.length;\n return{app:"juggler-tool",backupVersion:1,appVersion:"4.8.2",createdAt:now.toISOString(),summary:sum,state:st,analysisHistory}\n}`;
html=once(html,oldBackup,newBackup,'backup package');
html=once(html,'function saveCompleteBackup(){\n try{\n  let pkg=buildBackupPackage(),stamp=','async function saveCompleteBackup(){\n try{\n  let pkg=await buildBackupPackage(),stamp=','async backup save');
html=once(html,'if(obj&&obj.app==="juggler-tool"&&obj.state&&typeof obj.state==="object")return{state:obj.state,createdAt:obj.createdAt||null,backupVersion:obj.backupVersion||1};','if(obj&&obj.app==="juggler-tool"&&obj.state&&typeof obj.state==="object")return{state:obj.state,createdAt:obj.createdAt||null,backupVersion:obj.backupVersion||1,analysisHistory:obj.analysisHistory||null};','backup unpack');
html=once(html,'   await externalDbSet(ext);\n   storageSet(BACKUP_META_KEY','   await externalDbSet(ext);\n   if(u.analysisHistory)await storeAnalysisRestoreAll(u.analysisHistory,{replace:true});\n   storageSet(BACKUP_META_KEY','analysis history restore');
html=once(html,' / 外部 <strong>${(sum.externalMachines||0).toLocaleString("ja-JP")}台</strong></div>',' / 外部 <strong>${(sum.externalMachines||0).toLocaleString("ja-JP")}台</strong> / 解析履歴 <strong>${storeAnalysisHistoryReady?storeAnalysisHistoryIndex.length.toLocaleString("ja-JP"):"—"}件</strong></div>','data manager history count');
html=once(html,'バックアップには判別データ・台比較・店舗・稼働記録・メモなど、現在保存している状態をまとめて入れる。','バックアップには判別データ・台比較・店舗・稼働記録・メモ・店舗解析履歴など、現在保存している状態をまとめて入れる。','backup note');

write('public/index.html',html);write('index.html',html);

const pkg=JSON.parse(read('package.json'));
pkg.name='juggler-hanahana-tool-v4820';pkg.version='4.8.2';
for(const k of ['test','check']) if(!pkg.scripts[k].includes('tests/v482-analysis-history.mjs')) pkg.scripts[k]+=' && node tests/v482-analysis-history.mjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');

let t481=read('tests/v481-evidence-alias-dedup.mjs');
t481=t481.replace(/<title>ジャグラー設定判別 v4\\\.8\\\.1<\\\/title>/g,'<title>ジャグラー設定判別 v4\\.8\\.2<\\/title>');
write('tests/v481-evidence-alias-dedup.mjs',t481);

const test=`import fs from 'node:fs';\nimport assert from 'node:assert/strict';\nconst html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');\nconst root=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');\nassert.equal(html,root,'root/public index.html must remain byte-identical');\nassert.match(html,/<title>ジャグラー設定判別 v4\\.8\\.2<\\/title>/);\nassert.match(html,/STORE_ANALYSIS_INDEX_KEY="storeAnalysisHistoryIndexV1"/);\nassert.match(html,/STORE_ANALYSIS_PAYLOAD_PREFIX="storeAnalysisSnapshotV1:"/);\nassert.match(html,/function storeAnalysisFingerprint\\(prep\\)/);\nassert.match(html,/async function storeAnalysisEncode\\(obj\\)/);\nassert.match(html,/CompressionStream/);\nassert.match(html,/async function storeAnalysisSaveCurrent\\(r\\)/);\nassert.match(html,/signature===signature/,'same input+params must deduplicate');\nassert.match(html,/sourceFingerprint:storeAnalysisFingerprint\\(prep\\)/);\nassert.match(html,/await storeAnalysisSaveCurrent\\(bruteResults\\)/);\nassert.match(html,/storeAnalysisAttachForecast\\(r,target,top\\)/);\nassert.match(html,/次回狙い台はまだこの履歴に付いてないよ/);\nassert.match(html,/async function storeAnalysisExportAll\\(\\)/);\nassert.match(html,/analysisHistory=await storeAnalysisExportAll\\(\\)/);\nassert.match(html,/if\\(u\\.analysisHistory\\)await storeAnalysisRestoreAll/);\nassert.match(html,/id="BRUTE_HISTORY"/);\nassert.match(html,/id="BRUTE_HISTORY_DETAIL"/);\nconst saveFn=html.slice(html.indexOf('async function storeAnalysisSaveCurrent'),html.indexOf('function storeAnalysisCompactForecastRow'));\nassert.ok(!/v4PredictStore\\(/.test(saveFn),'saving a completed law search must not trigger heavy v4 prediction');\nconsole.log('PASS v4.8.2 store-analysis snapshot history regression');\n`;
write('tests/v482-analysis-history.mjs',test);

for(const p of ['scripts/v482-analysis-history.fragment.js','scripts/v482-analysis-history.fragment.html','scripts/patch-v482-analysis-history.mjs','.github/workflows/apply-v482-analysis-history.yml']){try{fs.rmSync(p)}catch{}}
console.log('Applied v4.8.2 analysis history patch');
