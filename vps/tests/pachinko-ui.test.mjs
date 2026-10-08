import test from 'node:test';
import assert from 'node:assert/strict';
import {createPachinkoClient,formatPachinkoCount,formatPachinkoDiff,formatPachinkoK,statusLabel,buildRecordMap} from '../../pachinko-browser.mjs';
import {__test as ui} from '../../vps-ui-pachinko.mjs';
import {patchJugestIndexSource,__test as patch} from '../src/ui-source-patch.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const receiverStorage={getItem(key){return key==='jugglerRelayReceiver:v1'?JSON.stringify({linked:true,channelId:'owner_channel_12345',receiverToken:'secret-receiver-token'}):null}};
function jsonResponse(status,payload){return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json'}})}

test('pachinko display helpers never manufacture zero from missing values',()=>{
  assert.equal(formatPachinkoCount(null),'—');assert.equal(formatPachinkoCount(''),'—');assert.equal(formatPachinkoDiff(undefined),'—');assert.equal(formatPachinkoK(null,'verified'),'—');
  assert.equal(formatPachinkoCount(1234),'1,234');assert.equal(formatPachinkoDiff(-1200),'-1,200玉');assert.equal(formatPachinkoK(20.294776,'verified'),'20.3');assert.equal(formatPachinkoK(32.4,'provisional'),'—');assert.equal(statusLabel('provisional'),'追加検証中');
});

test('client tries same-origin cookie first, then Receiver owner credentials only after 401/403',async()=>{
  const calls=[];const fetchFn=async(url,options)=>{calls.push({url,options});return calls.length===1?jsonResponse(401,{ok:false,code:'unauthorized'}):jsonResponse(200,{ok:true,stores:[{id:'pia:35-p'}]})};
  const client=createPachinkoClient({fetchFn,storage:receiverStorage});const stores=await client.listStores();assert.equal(stores[0].id,'pia:35-p');assert.equal(calls.length,2);assert.equal(calls[0].options.headers.authorization,undefined);assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[1].options.headers.authorization,'Bearer secret-receiver-token');assert.equal(calls[1].options.headers['x-jugest-channel-id'],'owner_channel_12345');
});

test('client reports preparation and auth failures in Japanese without leaking receiver secret',async()=>{
  for(const [status,code,pattern] of [[503,'pachinko_preparation_required',/準備中/],[403,'forbidden',/閲覧権限/]]){
    const client=createPachinkoClient({storage:{getItem(){return null}},fetchFn:async()=>jsonResponse(status,{ok:false,code})});await assert.rejects(()=>client.listStores(),error=>{assert.match(error.message,pattern);assert.doesNotMatch(error.message,/secret|Bearer/);return true});
  }
});

test('date toolbar matches the normal store date-select pattern and keeps newest date selected',()=>{
  const matrix={dates:['2026-10-06','2026-10-05'],roster:Array.from({length:48},(_,i)=>({machine_no:String(1101+i)}))};
  const html=ui.renderDateToolbar(matrix,'2026-10-06');assert.match(html,/class="data-toolbar p-date-toolbar"/);assert.match(html,/<small>日付<\/small><select data-pachinko-date-select>/);assert.ok(html.indexOf('2026-10-06')<html.indexOf('2026-10-05'));assert.match(html,/value="2026-10-06" selected/);assert.match(html,/>48台<\/span>/);
});

test('PIA大船-P uses the same store overview then data navigation as slot stores, without registering a fake slot shop',()=>{
  const savedCustomElements=globalThis.customElements,savedStorage=globalThis.localStorage;
  const selections=[];
  class FakeApp{
    constructor(){this.state={workspace:'store',screen:'hub',activeStore:'PIA大船1',storeSelectorOpen:true};this.nativeClicks=0;}
    renderStore(){return '<div>native-slot-store</div><span>PIA大船1</span>'}
    renderSubscreen(){return '<div>native-slot-subscreen</div><span>PIA大船1</span>'}
    onClick(){this.nativeClicks++}
    onChange(){}
    navigate(workspace,screen='hub'){this.state.workspace=workspace;this.state.screen=screen;this.state.storeSelectorOpen=false}
  }
  const target=attribute=>({
    dataset:{pachinkoStore:'pia:35-p',storeName:'PIA大船1'},
    hasAttribute:name=>name===attribute,
    closest(selector){return selector.includes(`[${attribute}]`)?this:null}
  });
  try{
    globalThis.customElements={get:name=>name==='jugest-app'?FakeApp:null};
    globalThis.localStorage={setItem:(key,value)=>selections.push([key,value])};
    ui.patchApp();ui.patchApp();
    const app=new FakeApp();
    assert.match(app.renderStore(),/native-slot-store/);assert.match(app.renderStore(),/PIA大船-S/);
    app.onClick({target:target('data-pachinko-store')});
    assert.equal(app.state.screen,'hub');assert.equal(app.state.workspace,'store');
    assert.equal(app.state.activeStore,'PIA大船1');assert.equal(ui.isPachinkoStoreSelected(app),true);
    assert.equal(app.nativeClicks,0);assert.equal(app.state.storeSelectorOpen,false);
    const st=ui.stateOf(app);st.loaded=true;st.matrix={dates:['2026-10-07'],latestSnapshot:{server_date:'2026-10-08'},historySummaries:[{machine_count:48},{machine_count:12},{machine_count:48}]};
    const overview=app.renderStore();
    assert.match(overview,/PIA大船-P/);assert.match(overview,/data-open-store-selector/);
    assert.match(overview,/日付確定/);assert.match(overview,/108台/);
    assert.match(overview,/data-action="store-data"/);assert.match(overview,/店舗内ナビ/);
    const action={closest:selector=>selector.includes('[data-action="store-data"]')?{}:null};
    app.onClick({target:action});
    assert.equal(app.state.screen,'data');
    const page=app.renderSubscreen();
    assert.match(page,/pachinko-data-screen/);assert.match(page,/PIA大船-P/);
    assert.match(page,/data-workspace="store"/);assert.match(page,/data-action="store-data"/);
    assert.doesNotMatch(page,/native-slot-subscreen/);
    st.yutimeLoaded=true;st.yutime={business_date:'2026-10-07',available:true,rows:[{rank:1,machine_no:'1124',record_id:44,final_start:430,above_yutime_threshold:false}]};
    app.onClick({target:target('data-pachinko-yutime')});
    assert.equal(app.state.screen,'yutime');
    assert.match(app.renderSubscreen(),/前日最終スタート順/);
    const toData={closest:selector=>selector.includes('[data-action="store-data"]')?{}:null};
    app.onClick({target:toData});assert.equal(app.state.screen,'data');
    app.onClick({target:target('data-store-name')});
    assert.equal(ui.isPachinkoStoreSelected(app),false);
    assert.equal(app.nativeClicks,1);
    assert.match(app.renderStore(),/native-slot-store/);assert.match(app.renderStore(),/PIA大船-S/);
    assert.equal(selections.at(-1)[1],'S');
  }finally{
    if(savedCustomElements===undefined)delete globalThis.customElements;else globalThis.customElements=savedCustomElements;
    if(savedStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=savedStorage;
  }
});
test('yutime page shows yesterday-only final-start ranking and makes no exact remaining-spin claim',()=>{
  const mock={app:null,yutimeLoaded:true,yutimeLoading:false,yutimeError:'',detail:null,
    yutime:{business_date:'2026-10-07',available:true,machine_count:2,excluded_count:0,rows:[
      {rank:1,machine_no:'1124',record_id:44,final_start:430,start:625,above_yutime_threshold:false},
      {rank:2,machine_no:'1097',record_id:9,final_start:1309,start:958,above_yutime_threshold:true}
    ]}};
  const html=ui.renderPachinkoYutimeState(mock);
  assert.match(html,/前日最終スタート順/);assert.match(html,/2026-10-07/);
  assert.match(html,/1124番/);assert.match(html,/430回/);assert.match(html,/1097番/);
  assert.match(html,/1,309回/);assert.match(html,/遊タイム状態要確認/);
  assert.match(html,/ラムクリア/);assert.match(html,/data-pachinko-record-date="2026-10-07"/);
  assert.doesNotMatch(html,/950\s*[-−]\s*430/);assert.doesNotMatch(html,/残り\d+回/);
  const missing=ui.renderPachinkoYutimeState({...mock,yutime:{business_date:'2026-10-08',latest_available_date:'2026-10-07',available:false,rows:[]}});
  assert.match(missing,/前日分の確定データがありません/);assert.match(missing,/2026-10-07/);
  assert.doesNotMatch(missing,/1124番/);
  const overview=ui.renderPachinkoOverview({matrix:null,loading:false,error:''});
  assert.match(overview,/data-pachinko-yutime/);assert.match(overview,/遊タイム宵越しランキング/);
  assert.match(ui.pachinkoStoreTabs('yutime'),/class="on" type="button" data-pachinko-yutime/);
});
test('store selector ordering uses displayed Japanese store names',()=>{
  const names=['Z店','PIA大船-S','アビバ関内','PIA大船-P','123ホール'];
  const sorted=[...names].sort(ui.compareStoreNames);assert.deepEqual(sorted,[...names].sort((a,b)=>a.localeCompare(b,'ja',{numeric:true,sensitivity:'base'})));
});

test('matrix renderer keeps newest date first, escapes labels and only renders separately supplied candidate K',()=>{
  const matrix={models:[{key:'OUMI5_SPECIAL_ALTA',estimatorStatus:'verified'},{key:'TOKYO_GHOUL_399',estimatorStatus:'provisional'},{key:'TOKYO_GHOUL_999',estimatorStatus:'provisional'}],dates:['2026-10-06','2026-10-05'],roster:[{identity:'sea',machine_model_key:'OUMI5_SPECIAL_ALTA',machine_no:'1101<script>',store_machine_id:'1'},{identity:'ghoul',machine_model_key:'TOKYO_GHOUL_999',machine_no:'999',store_machine_id:'2'}],records:[{record_id:1,business_date:'2026-10-06',identity:'sea',machine_model_key:'OUMI5_SPECIAL_ALTA',start:1500,estimated_k:20.294776,estimator_status:'verified',confidence:'B'},{record_id:2,business_date:'2026-10-06',identity:'ghoul',machine_model_key:'TOKYO_GHOUL_999',start:2200,estimated_k:null,estimator_status:'provisional',confidence:null}]};
  const html=ui.renderTable(matrix,'2026-10-06');assert.ok(html.indexOf('10-06')<html.indexOf('10-05'));assert.match(html,/20\.3/);assert.match(html,/追加検証中/);assert.doesNotMatch(html,/32\.4/);assert.doesNotMatch(html,/<script>/);assert.match(html,/1101&lt;script&gt;/);const map=buildRecordMap(matrix);assert.equal(map.get('sea\u00002026-10-06').record_id,1);
});

test('candidate K is visibly provisional in Ghoul matrix, summary, 30-history and record detail',()=>{
  const candidate={record_id:80,business_date:'2026-10-07',identity:'g999',machine_model_key:'TOKYO_GHOUL_999',machine_no:'2030',store_machine_id:'5010',start:3000,difference:30000,estimated_k:null,estimator_status:'provisional',candidate_k:32.371052815,candidate_method_id:'tokyo-ghoul-999-normal-consumption-10-candidate',candidate_method_version:'1',confidence:null};
  const model={key:'TOKYO_GHOUL_999',estimatorStatus:'provisional'};
  const matrix={models:[model],dates:['2026-10-07'],roster:[candidate],records:[candidate],
    summaries:[{business_date:'2026-10-07',models:[{machine_model_key:model.key,total_machine_count:48,candidate_valid_machine_count:48,total_start:120192,total_difference:30460,pooled_k:null,candidate_pooled_k:32.010567919,estimator_status:'provisional'}]}],
    historySummaries:[{machine_model_key:model.key,history_count:1440,machine_count:48,minimum_histories_per_machine:30,maximum_histories_per_machine:30,candidate_valid_history_count:1440,candidate_pooled_k:32.398616973}],
    modelSnapshots:[{machine_model_key:model.key,snapshot:{server_date:'2026-10-08'}}],undated:{occurrence_count:1,models:[{machine_model_key:model.key,occurrence_count:1,snapshot_id:5}],records:[{...candidate,snapshot_id:5,occurrence_count:1}]}};
  const html=ui.renderTable(matrix,'2026-10-07');assert.match(html,/>32\.4<\/b>/);assert.match(html,/暫定/);assert.doesNotMatch(html,/実データ検証済み/);
  const summary=ui.renderSummary(matrix,'2026-10-07','TOKYO_GHOUL_999');
  assert.match(summary,/暫定平均回転率/);assert.match(summary,/32\.0/);assert.match(summary,/暫定加重K 32\.4/);
  assert.match(summary,/1,440件/);assert.match(summary,/30〜30履歴/);assert.match(summary,/メーカーのカウンター定義/);
  const all=ui.renderSummary(matrix,'2026-10-07','');assert.match(all,/32\.0/);assert.match(all,/暫定/);
  const undated=ui.renderUndated(matrix);assert.match(undated,/>32\.4<\/b>/);
  const st={detail:{...candidate,raw:{start:3000,final_start:70,special:10,special_1:11,special_2:5,special_2d:1,special_out:100,special_safe:1000,out:3000,safe:2000,difference:-10000},snapshots:[{snapshot_id:5,server_date:'2026-10-08'}],snapshot:{snapshot_id:5,server_date:'2026-10-08'},date_assignments:[]},detailDate:'',detailSnapshotId:5,detailLoading:false,detailError:''};
  const detail=ui.renderDetail(st);assert.match(detail,/暫定K/);assert.match(detail,/32\.4/);assert.match(detail,/tokyo-ghoul-999-normal-consumption-10-candidate/);assert.match(detail,/独立実測/);
});
test('filtered summary shows only the selected model with average rotation, activity and difference',()=>{
  const matrix={models:[{key:'OUMI5_SPECIAL_ALTA',estimatorStatus:'verified'},{key:'TOKYO_GHOUL_399',estimatorStatus:'provisional'},{key:'TOKYO_GHOUL_999',estimatorStatus:'provisional'}],summaries:[{business_date:'2026-10-06',models:[{machine_model_key:'OUMI5_SPECIAL_ALTA',total_machine_count:48,valid_machine_count:46,total_start:48951,total_difference:-45480,pooled_k:20.294776,estimator_status:'verified'}]}],modelSnapshots:[{machine_model_key:'OUMI5_SPECIAL_ALTA',snapshot:{server_date:'2026-10-07',server_time:'23:43:44'}},{machine_model_key:'TOKYO_GHOUL_399',snapshot:{server_date:'2026-10-07',server_time:'23:43:44'}}],undated:{occurrence_count:25,models:[{machine_model_key:'TOKYO_GHOUL_399',snapshot_id:9,occurrence_count:24,truncated:false}],records:[{record_id:7,snapshot_id:9,machine_model_key:'TOKYO_GHOUL_399',machine_no:'1025',start:1320,estimated_k:null,estimator_status:'provisional',occurrence_count:2}]}};
  const summary=ui.renderSummary(matrix,'2026-10-06','OUMI5_SPECIAL_ALTA');
  assert.match(summary,/大海5SP/);assert.match(summary,/平均回転率/);assert.match(summary,/20\.3/);assert.match(summary,/平均稼働/);assert.match(summary,/1,020/);assert.match(summary,/平均差玉/);assert.match(summary,/-948玉/);assert.match(summary,/46\/48台/);
  assert.doesNotMatch(summary,/東京喰種399/);assert.doesNotMatch(summary,/東京喰種999/);
  const undated=ui.renderUndated(matrix);assert.match(undated,/東京喰種399/);assert.match(undated,/source 2026-10-07 23:43:44/);assert.match(undated,/追加検証中/);assert.doesNotMatch(undated,/32\.4/);
});

test('all-model summary is a compact comparison instead of three oversized cards',()=>{
  const matrix={models:[{key:'OUMI5_SPECIAL_ALTA',estimatorStatus:'verified'},{key:'TOKYO_GHOUL_399',estimatorStatus:'provisional'},{key:'TOKYO_GHOUL_999',estimatorStatus:'provisional'}],summaries:[{business_date:'2026-10-06',models:[{machine_model_key:'OUMI5_SPECIAL_ALTA',total_machine_count:48,valid_machine_count:46,total_start:48951,total_difference:-45480,pooled_k:20.294776,estimator_status:'verified'}]}]};
  const html=ui.renderSummary(matrix,'2026-10-06','');assert.match(html,/p-summary-compare/);assert.match(html,/平均回転率/);assert.match(html,/平均稼働/);assert.match(html,/平均差玉/);assert.match(html,/大海5SP/);assert.match(html,/東京喰種399/);assert.match(html,/東京喰種999/);assert.doesNotMatch(html,/p-summary-grid/);
});

test('detail selection uses matching business-date assignment or requested undated snapshot',()=>{
  const detail={record_id:3,machine_model_key:'OUMI5_SPECIAL_ALTA',machine_no:'1101',estimated_k:20.2,estimator_status:'verified',estimator_id:'sea-normal-consumption-10',estimator_version:'1',sample_size:1000,confidence:'B',store_machine_id:'x',sis_machine_code:'00021',raw:{start:1000,final_start:200,special:1,special_1:1,special_2:0,special_2d:0,special_out:100,special_safe:10,out:1400,safe:200,difference:-12000},snapshots:[{snapshot_id:8,server_date:'2026-10-06'},{snapshot_id:9,server_date:'2026-10-07'}],snapshot:{snapshot_id:9,server_date:'2026-10-07'},date_assignments:[{business_date:'2026-10-05',date_status:'derived',date_assignment_method:'consecutive_snapshot_multiset_previous_day',current_snapshot:{snapshot_id:8,server_date:'2026-10-06'}}]};
  const dated={detail,detailDate:'2026-10-05',detailSnapshotId:null,detailLoading:false,detailError:''};assert.equal(ui.snapshotForDetail(dated).snapshot_id,8);assert.equal(ui.assignmentForDetail(dated).business_date,'2026-10-05');assert.match(ui.renderDetail(dated),/2026-10-05/);assert.match(ui.renderDetail(dated),/special_2/);assert.doesNotMatch(ui.renderDetail(dated),/>LT</);
  const undated={...dated,detailDate:'',detailSnapshotId:9};assert.equal(ui.snapshotForDetail(undated).snapshot_id,9);
});

test('source patch injects the independent pachinko module exactly once',()=>{
  const root=fileURLToPath(new URL('../..',import.meta.url)),source=readFileSync(`${root}/index.html`,'utf8');const once=patchJugestIndexSource(source),twice=patchJugestIndexSource(once);assert.match(once,/vps-ui-pachinko\.mjs/);assert.equal(twice.match(/vps-ui-pachinko\.mjs/g)?.length,1);assert.equal(patch.PACHINKO_UI_MODULE_TAG,'<script type="module" src="./vps-ui-pachinko.mjs"></script>');
});

test('pachinko styles reuse the existing JUGEST blue-white visual system and keep only the matrix horizontally scrollable',()=>{
  assert.match(ui.STYLE,/\.pachinko-data-screen\{[\s\S]*--p-accent:#315bea/);
  assert.match(ui.STYLE,/--p-panel:rgba\(255,255,255,\.97\)/);assert.match(ui.STYLE,/--p-border:#e2e8f3/);assert.match(ui.STYLE,/--p-shadow:0 8px 28px rgba\(35,61,112,\.055\)/);
  assert.match(ui.STYLE,/\.pachinko-data-screen\{[\s\S]*max-width:100%;min-width:0;overflow:hidden/);assert.match(ui.STYLE,/\.p-table-scroll\{[^}]*overflow:auto/);assert.match(ui.STYLE,/\.p-summary-grid article\{[^}]*border-radius:18px[^}]*box-shadow:var\(--p-shadow\)/);assert.match(ui.STYLE,/\.p-refresh\{[^}]*background:var\(--p-accent\)[^}]*border-radius:16px/);assert.match(ui.STYLE,/@media\(max-width:560px\)/);
});
