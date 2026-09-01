from pathlib import Path
import json
R=Path('.')
# keep public app identical
s=(R/'index.html').read_text();(R/'public/index.html').write_text(s)
# sync client version + independent merge of saved-balance vs exchange-rate edits
for p in [R/'sync-ui.js',R/'public/sync-ui.js']:
 x=p.read_text().replace("const APP_VERSION='4.8.7';","const APP_VERSION='4.8.8';",1)
 old='''      const a=+cur.savedCoinBaseUpdatedAt||0,b=+x.savedCoinBaseUpdatedAt||0;\n      const preferred=b>a?clone(x):cur;\n      const id=cur.id||x.id;\n      Object.assign(cur,preferred,{id,name,createdAt:Math.min(+cur.createdAt||Infinity,+x.createdAt||Infinity)});\n      if(!Number.isFinite(cur.createdAt))cur.createdAt=+preferred.createdAt||0;'''
 new='''      const baseCur=+cur.savedCoinBaseUpdatedAt||0,baseNew=+x.savedCoinBaseUpdatedAt||0,rateCur=+cur.financeRateUpdatedAt||0,rateNew=+x.financeRateUpdatedAt||0;\n      const preferred=chooseNewer(cur,x),basePick=baseNew>baseCur?x:cur,ratePick=rateNew>rateCur?x:cur;\n      const id=cur.id||x.id;\n      Object.assign(cur,preferred,{id,name,createdAt:Math.min(+cur.createdAt||Infinity,+x.createdAt||Infinity),savedCoinBase:basePick.savedCoinBase,savedCoinBaseUpdatedAt:+basePick.savedCoinBaseUpdatedAt||0,loanCoinsPer1000:ratePick.loanCoinsPer1000??null,exchangeCoinsPer1000:ratePick.exchangeCoinsPer1000??null,financeRateUpdatedAt:+ratePick.financeRateUpdatedAt||0});\n      if(!Number.isFinite(cur.createdAt))cur.createdAt=+preferred.createdAt||0;'''
 if old not in x: raise SystemExit('sync merge marker')
 p.write_text(x.replace(old,new,1))
# current release metadata
p=R/'README.md';x=p.read_text().replace('Current app release: **v4.8.7**.','Current app release: **v4.8.8**.',1)
x+='''\n\n## v4.8.8 run finance + edit hotfix\n- Run records use shop rate snapshots, saved-medal investment, cash investment, collected medals and exchanged yen. Actual coin difference, cash P/L and saved-medal delta are calculated automatically.\n- The shop rate is remembered for later runs; optional exchanged-medal override handles rounding/prize differences. Legacy records remain compatible.\n- Saved-medal balance continues to be base balance + recorded run deltas, now derived from the finance inputs.\n- Fixed the run-record Edit button under lazy page rendering. Judgment/ranking and Launcher acquisition logic are unchanged.\n''';p.write_text(x)
p=R/'package.json';j=json.loads(p.read_text());j['name']='juggler-hanahana-tool-v4880';j['version']='4.8.8';
if 'tests/v488-run-finance.mjs' not in j['scripts']['test']:j['scripts']['test']+=' && node tests/v488-run-finance.mjs'
p.write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n')
# Keep lock metadata consistent with package.json without touching dependency locks.
p=R/'package-lock.json';lock=json.loads(p.read_text());lock['name']='juggler-hanahana-tool-v4880';lock['version']='4.8.8';lock.setdefault('packages',{}).setdefault('',{})['name']='juggler-hanahana-tool-v4880';lock['packages']['']['version']='4.8.8';p.write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n')
# Three release-policy regressions intentionally pin the whole current version string.
for p in [R/'tests/netlify-deploy-preflight.mjs',R/'tests/v486-device-sync.mjs',R/'tests/v487-evidence-policy.mjs']:
 x=p.read_text().replace('4.8.7','4.8.8').replace(r'4\.8\.7',r'4\.8\.8');p.write_text(x)
# Other historical regressions should keep their historical feature labels, but any assertion
# that explicitly refers to the *current app metadata/header* must advance with the release.
for p in R.glob('tests/*.mjs'):
 x=p.read_text()
 x=x.replace('appVersion:"4.8.7"','appVersion:"4.8.8"')
 x=x.replace('>v4.8.7</span>','>v4.8.8</span>')
 x=x.replace('ジャグラー設定判別 v4.8.7','ジャグラー設定判別 v4.8.8')
 x=x.replace("const APP_VERSION='4.8.7'","const APP_VERSION='4.8.8'")
 p.write_text(x)
# dedicated regression
(R/'tests/v488-run-finance.mjs').write_text(r'''import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const root=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),pub=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');assert.equal(root,pub);assert.match(root,/ジャグラー設定判別 v4\.8\.8/);
for(const id of ['LOG_LOAN_RATE','LOG_EXCHANGE_RATE','LOG_SAVED_INVEST','LOG_CASH_INVEST','LOG_COLLECTED','LOG_EXCHANGED_YEN','LOG_EXCHANGE_COINS_OVERRIDE','LOG_FINANCE_PREVIEW'])assert.ok(root.includes(`id="${id}"`),'missing '+id);
for(const t of ['function runFinance(p)','cashInvest/1000*loan','collected-totalInvestCoins','exchangedYen/1000*exchange','collected-savedInvest-exchangeUsedCoins','cashDiff=exchangedYen-cashInvest','markLazyPageDirty("runlog");setPage("runlog")'])assert.ok(root.includes(t),t);
for(const id of ['LOG_ACTUAL_DIFF','LOG_CASH_DIFF','LOG_SAVED_DELTA'])assert.ok(!root.includes(`id="${id}"`),'legacy manual input remains '+id);
const src=fs.readFileSync(new URL('../sync-ui.js',import.meta.url),'utf8');assert.ok(src.includes("const APP_VERSION='4.8.8'"));assert.equal(src,fs.readFileSync(new URL('../public/sync-ui.js',import.meta.url),'utf8'));
const sb={console,globalThis:null,window:undefined,document:undefined,crypto:globalThis.crypto,Date,Math,JSON,Map,Set,Promise,Number,String,Array,Object,Infinity,NaN,parseInt,isFinite,TextEncoder,TextDecoder,Blob,Response,CompressionStream,DecompressionStream,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary')};sb.globalThis=sb;vm.createContext(sb);vm.runInContext(src,sb,{timeout:10000});const a=sb.__JUGEST_SYNC_TEST__;
const mk=(dev,shop)=>({schema:'juggler-device-sync',version:1,sourceDevice:dev,core:{shops:[shop],tags:[],sessions:[],forecasts:[],layoutOverrides:[],moveHistory:[],hybridProfiles:{},sections:{}},externalDays:[],analysisSnapshots:[]});
const sh=a.mergePackages(mk('A',{id:'a',name:'店',savedCoinBase:500,savedCoinBaseUpdatedAt:100,loanCoinsPer1000:46,exchangeCoinsPer1000:52,financeRateUpdatedAt:10}),mk('B',{id:'b',name:'店',savedCoinBase:250,savedCoinBaseUpdatedAt:20,loanCoinsPer1000:47,exchangeCoinsPer1000:53,financeRateUpdatedAt:200})).core.shops[0];assert.equal(sh.savedCoinBase,500);assert.equal(sh.loanCoinsPer1000,47);assert.equal(sh.exchangeCoinsPer1000,53);console.log('v4.8.8 run finance + edit regression: ok');
''')
print('v488 stage D done')
