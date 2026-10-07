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

test('matrix renderer keeps newest date first, escapes labels and never renders provisional candidate K',()=>{
  const matrix={models:[{key:'OUMI5_SPECIAL_ALTA',estimatorStatus:'verified'},{key:'TOKYO_GHOUL_399',estimatorStatus:'provisional'},{key:'TOKYO_GHOUL_999',estimatorStatus:'provisional'}],dates:['2026-10-06','2026-10-05'],roster:[{identity:'sea',machine_model_key:'OUMI5_SPECIAL_ALTA',machine_no:'1101<script>',store_machine_id:'1'},{identity:'ghoul',machine_model_key:'TOKYO_GHOUL_999',machine_no:'999',store_machine_id:'2'}],records:[{record_id:1,business_date:'2026-10-06',identity:'sea',machine_model_key:'OUMI5_SPECIAL_ALTA',start:1500,estimated_k:20.294776,estimator_status:'verified',confidence:'B'},{record_id:2,business_date:'2026-10-06',identity:'ghoul',machine_model_key:'TOKYO_GHOUL_999',start:2200,estimated_k:null,estimator_status:'provisional',confidence:null}]};
  const html=ui.renderTable(matrix,'2026-10-06');assert.ok(html.indexOf('10-06')<html.indexOf('10-05'));assert.match(html,/20\.3/);assert.match(html,/追加検証中/);assert.doesNotMatch(html,/32\.4/);assert.doesNotMatch(html,/<script>/);assert.match(html,/1101&lt;script&gt;/);const map=buildRecordMap(matrix);assert.equal(map.get('sea\u00002026-10-06').record_id,1);
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
