import {createPachinkoClient,PACHINKO_STORE_ID,MODEL_ORDER,MODEL_LABELS,escapePachinkoHtml as esc,statusLabel,modelLabel,formatPachinkoK,formatPachinkoCandidateK,formatPachinkoCount,formatPachinkoDiff,selectedSummary,buildRecordMap,modelSnapshotMap} from './pachinko-browser.mjs';

const STATE=new WeakMap();
const client=createPachinkoClient();
const FILTERS=[['','全機種'],...MODEL_ORDER.map(key=>[key,MODEL_LABELS[key]])];
function stateOf(app){
  if(!STATE.has(app))STATE.set(app,{loading:false,loaded:false,error:'',matrix:null,filter:'',selectedDate:'',detail:null,detailLoading:false,detailError:'',detailDate:'',detailSnapshotId:null,generation:0});
  return STATE.get(app);
}
function sourceDate(snapshot){return snapshot?.server_date?`${snapshot.server_date}${snapshot.server_time?' '+snapshot.server_time:''}`:'—'}
function captureScroll(app){const root=app.shadowRoot;return {page:root?.querySelector('#view')?.scrollTop??0,windowY:Number(globalThis.scrollY)||0,table:root?.querySelector('[data-pachinko-table-scroll]')?.scrollLeft??0,tableTop:root?.querySelector('[data-pachinko-table-scroll]')?.scrollTop??0}}
function restoreScroll(app,pos){const apply=()=>{const root=app.shadowRoot,view=root?.querySelector('#view'),table=root?.querySelector('[data-pachinko-table-scroll]');if(view)view.scrollTop=pos?.page||0;if(table){table.scrollLeft=pos?.table||0;table.scrollTop=pos?.tableTop||0}try{globalThis.scrollTo?.(0,pos?.windowY||0)}catch{}};apply();globalThis.requestAnimationFrame?.(apply)}
function rerender(app,pos=captureScroll(app)){app.render();restoreScroll(app,pos)}
function clearState(app,{message=''}={}){const old=stateOf(app);old.generation++;Object.assign(old,{loading:false,loaded:false,error:message,matrix:null,selectedDate:'',detail:null,detailLoading:false,detailError:'',detailDate:'',detailSnapshotId:null})}
async function refresh(app,{keepScroll=true}={}){
  const st=stateOf(app),generation=++st.generation,pos=keepScroll?captureScroll(app):{page:0,windowY:0,table:0,tableTop:0};st.loading=true;st.error='';st.detail=null;st.detailError='';rerender(app,pos);
  try{
    const matrix=await client.getMatrix({storeId:PACHINKO_STORE_ID,modelKey:st.filter,limit:30});if(generation!==st.generation)return;
    st.matrix=matrix;st.loaded=true;st.loading=false;if(!matrix.dates?.includes(st.selectedDate))st.selectedDate=matrix.dates?.[0]||'';rerender(app,pos);
  }catch(error){if(generation!==st.generation)return;st.loading=false;st.loaded=false;st.matrix=null;st.error=error.status===503?'PIA大船-Pはまだ準備中です。':error.status===401||error.status===403?'PIA大船-Pの閲覧権限を確認してください。':String(error?.message||error);if([401,403].includes(error.status))st.generation++;rerender(app,pos)}
}
async function openDetail(app,recordId,{date='',snapshotId=null}={}){
  const st=stateOf(app),generation=st.generation,pos=captureScroll(app);st.detailLoading=true;st.detailError='';st.detailDate=date;st.detailSnapshotId=snapshotId;rerender(app,pos);
  try{const detail=await client.getRecord(recordId);if(generation!==st.generation)return;st.detail=detail;st.detailLoading=false;rerender(app,pos)}catch(error){if(generation!==st.generation)return;st.detailLoading=false;st.detail=null;st.detailError=String(error?.message||error);if([401,403].includes(error.status))clearState(app,{message:'PIA大船-Pの閲覧権限を確認してください。'});rerender(app,pos)}
}
function ensureLoad(app){const st=stateOf(app);if(st.loading||st.loaded)return;st.loading=true;queueMicrotask(async()=>{st.loading=false;await refresh(app,{keepScroll:false})})}
function snapshotForDetail(st){const detail=st.detail;if(!detail)return null;if(st.detailSnapshotId!=null)return (detail.snapshots||[]).find(x=>Number(x.snapshot_id)===Number(st.detailSnapshotId))||detail.snapshot||null;if(st.detailDate){const assignment=(detail.date_assignments||[]).find(x=>x.business_date===st.detailDate);if(assignment?.current_snapshot)return assignment.current_snapshot}return detail.snapshot||null}
function assignmentForDetail(st){if(!st.detail)return null;if(st.detailDate)return (st.detail.date_assignments||[]).find(x=>x.business_date===st.detailDate)||null;return null}
function kv(label,value){return `<div class="p-kv"><small>${esc(label)}</small><b>${esc(value??'—')}</b></div>`}
function displayedK(row){return row?.estimator_status==='provisional'?formatPachinkoCandidateK(row.candidate_k):formatPachinkoK(row?.estimated_k,row?.estimator_status)}
function displayedSummaryK(summary,status){return status==='provisional'?formatPachinkoCandidateK(summary?.candidate_pooled_k):formatPachinkoK(summary?.pooled_k,status)}

function renderDetail(st){
  if(st.detailLoading)return '<section class="p-detail"><b>詳細を読み込み中…</b></section>';
  if(st.detailError)return `<section class="p-detail"><button type="button" data-pachinko-close-detail>閉じる</button><p class="p-error">${esc(st.detailError)}</p></section>`;
  const r=st.detail;if(!r)return '';
  const snap=snapshotForDetail(st),assignment=assignmentForDetail(st),raw=r.raw||{},date=assignment?.business_date||st.detailDate||'日付未確定';
  const counters=['special','special_1','special_2','special_2d','special_out','special_safe','out','safe'];
  return `<section class="p-detail" data-pachinko-detail><div class="p-detail-head"><div><small>台詳細</small><h2>${esc(r.machine_no)}番 ${esc(modelLabel(r.machine_model_key))}</h2></div><button type="button" data-pachinko-close-detail>閉じる</button></div><div class="p-kvs">${kv('営業日',date)}${kv(r.estimator_status==='provisional'?'暫定K':'推定K',`${displayedK(r)} 回/250玉`)}${kv('推定状態',statusLabel(r.estimator_status))}${kv('推定方法',`${r.estimator_status==='provisional'?(r.candidate_method_id||'—'):(r.estimator_id||'—')} / v${r.estimator_status==='provisional'?(r.candidate_method_version||'—'):(r.estimator_version||'—')}`)}${kv('観測量',`${formatPachinkoCount(r.sample_size)}回 / ${r.confidence||'—'}`)}${kv('start',formatPachinkoCount(raw.start))}${kv('final_start',formatPachinkoCount(raw.final_start))}${kv('差玉',formatPachinkoDiff(raw.difference))}${kv('設置ID',r.store_machine_id)}${kv('機種コード',r.sis_machine_code)}${kv('日付状態',assignment?.date_status||r.date_status||'未確定')}${kv('復元方式',assignment?.date_assignment_method||r.date_assignment_method||'—')}</div>${r.estimator_status==='provisional'?'<p class="p-candidate-note">暫定KはPIAカウンターからの参考計算値。独立実測との照合は未完了です。</p>':''}<details class="p-details"><summary>rawカウンタ</summary><div class="p-kvs">${counters.map(key=>kv(key,formatPachinkoCount(raw[key]))).join('')}</div><p>out / safe / special_out / special_safe はPIA APIの10玉相当カウンタ。special_2 / special_2d はLT・RUSH等へ固定解釈していません。</p></details><details class="p-details"><summary>取得元・provenance</summary><div class="p-kvs">${kv('snapshot',snap?.snapshot_id??'—')}${kv('PIAサーバー日時',sourceDate(snap))}${kv('観測時刻',snap?.observed_at||'不明')}${kv('取込時刻',snap?.imported_at||'—')}${kv('raw SHA-256',snap?.raw_sha256||'—')}</div><pre>${esc(JSON.stringify(snap?.provenance||{},null,2))}</pre></details></section>`;
}
function avgPerMachine(total,count){const t=Number(total),c=Number(count);return Number.isFinite(t)&&Number.isFinite(c)&&c>0?t/c:null}
function roundSigned(value){const n=Number(value);return Number.isFinite(n)?(n<0?-Math.round(-n):Math.round(n)):null}
function summaryMetrics(s,status){
  const hasRows=Number(s?.total_machine_count)>0;
  return {
    hasRows,
    rotation:hasRows?displayedSummaryK(s,status):'—',
    activity:formatPachinkoCount(hasRows?roundSigned(avgPerMachine(s.total_start,s.total_machine_count)):null),
    difference:formatPachinkoDiff(hasRows?roundSigned(avgPerMachine(s.total_difference,s.total_machine_count)):null)
  };
}
function metricCard(label,value,unit=''){return `<article class="p-metric-card"><small>${esc(label)}</small><div><strong>${esc(value)}</strong>${unit?`<span>${esc(unit)}</span>`:''}</div></article>`}
function renderSummary(matrix,date,filter=''){
  const summaries=selectedSummary(matrix,date),models=matrix.models||[];
  if(filter){
    const model=models.find(x=>x.key===filter),s=summaries.find(x=>x.machine_model_key===filter),status=s?.estimator_status||model?.estimatorStatus||'unverified',m=summaryMetrics(s,status);
    const hist=(matrix.historySummaries||[]).find(x=>x.machine_model_key===filter),isCandidate=status==='provisional';
    const historyInfo=isCandidate&&hist?.history_count?`<p class="p-summary-note p-history-candidate">最新取得の履歴：${formatPachinkoCount(hist.history_count)}件（${formatPachinkoCount(hist.machine_count)}台、${formatPachinkoCount(hist.minimum_histories_per_machine)}〜${formatPachinkoCount(hist.maximum_histories_per_machine)}履歴/台） · <b>暫定加重K ${esc(formatPachinkoCandidateK(hist.candidate_pooled_k))}回/250玉</b></p>`:'';
    return `<section class="p-selected-summary"><div class="p-summary-head"><div><small>機種サマリー</small><h2>${esc(modelLabel(filter))}</h2></div><span class="p-status ${esc(status)}">${esc(statusLabel(status))}</span></div>${m.hasRows?`<div class="p-summary-grid">${metricCard(isCandidate?'暫定平均回転率':'平均回転率',m.rotation,'回/250玉')}${metricCard('平均稼働',m.activity,'回')}${metricCard('平均差玉',m.difference)}</div><p class="p-summary-note">${isCandidate?'暫定K':'回転率'} ${formatPachinkoCount(isCandidate?s.candidate_valid_machine_count:s.valid_machine_count)}/${formatPachinkoCount(s.total_machine_count)}台算出可能</p>`:'<div class="p-empty">この日の日付確定データはありません。</div>'}${historyInfo}${isCandidate?'<p class="p-candidate-note">暫定Kはメーカーのカウンター定義・独立実測と未照合の参考値。日別と最新履歴の平均は別集計です。</p>':''}</section>`;
  }
  return `<section class="p-summary-compare"><div class="p-summary-head"><div><small>機種比較</small><h2>${esc(date)}</h2></div></div><div class="p-compare-scroll"><table><thead><tr><th>機種</th><th>平均回転率</th><th>平均稼働</th><th>平均差玉</th></tr></thead><tbody>${MODEL_ORDER.map(key=>{const model=models.find(x=>x.key===key),s=summaries.find(x=>x.machine_model_key===key),status=s?.estimator_status||model?.estimatorStatus||'unverified',m=summaryMetrics(s,status);return `<tr><th><b>${esc(modelLabel(key))}</b><span class="p-status ${esc(status)}">${esc(statusLabel(status))}</span></th><td>${m.hasRows?`${esc(m.rotation)}<small>${status==='provisional'?'暫定 · ':''}回/250玉</small>`:'—'}</td><td>${m.hasRows?`${esc(m.activity)}<small>回</small>`:'—'}</td><td>${m.hasRows?esc(m.difference):'—'}</td></tr>`}).join('')}</tbody></table></div></section>`;
}
function renderDateToolbar(matrix,selectedDate){
  const dates=matrix?.dates||[],count=(matrix?.roster||[]).length;
  if(!dates.length)return '';
  return `<div class="data-toolbar p-date-toolbar"><label><small>日付</small><select data-pachinko-date-select>${dates.map(d=>`<option value="${esc(d)}" ${d===selectedDate?'selected':''}>${esc(d)}</option>`).join('')}</select></label><span>${formatPachinkoCount(count)}台</span></div>`;
}
function renderTable(matrix,selectedDate){
  const records=buildRecordMap(matrix),dates=matrix.dates||[],roster=matrix.roster||[];
  if(!dates.length)return '<div class="p-empty">営業日を安全に復元できた履歴はまだありません。</div>';
  return `<div class="p-table-scroll" data-pachinko-table-scroll><table class="p-matrix"><thead><tr><th class="p-seat">台番 / 機種</th>${dates.map(d=>`<th><span class="p-date-head ${d===selectedDate?'selected':''}" data-pachinko-date-head="${esc(d)}">${esc(d.slice(5))}</span></th>`).join('')}</tr></thead><tbody>${roster.map(machine=>`<tr><th class="p-seat"><b>${esc(machine.machine_no)}番</b><small>${esc(modelLabel(machine.machine_model_key))}</small></th>${dates.map(date=>{const r=records.get(`${machine.identity}\u0000${date}`),selected=date===selectedDate?' selected':'';if(!r)return `<td class="p-no-data${selected}">—</td>`;return `<td class="p-day-col${selected}"><button type="button" class="p-cell ${r.estimator_status}" data-pachinko-record="${r.record_id}" data-pachinko-record-date="${esc(date)}"><b>${displayedK(r)}</b><small>${r.estimator_status==='verified'?`${formatPachinkoCount(r.start)}回 / ${esc(r.confidence||'—')}`:r.estimator_status==='provisional'&&r.candidate_k!=null?`暫定 · ${formatPachinkoCount(r.start)}回`:statusLabel(r.estimator_status)}</small></button></td>`}).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function renderUndated(matrix){
  const snapshotByModel=modelSnapshotMap(matrix),records=matrix.undated?.records||[];if(!matrix.undated?.occurrence_count)return '';
  return `<section class="p-undated"><div class="p-section-head"><div><small>日付未確定</small><h2>${formatPachinkoCount(matrix.undated.occurrence_count)}履歴</h2></div><span>初回履歴や安全に日付化できない差分は推測しません。</span></div>${MODEL_ORDER.map(key=>{const meta=(matrix.undated.models||[]).find(x=>x.machine_model_key===key),rows=records.filter(x=>x.machine_model_key===key),snap=snapshotByModel.get(key);if(!meta?.occurrence_count)return '';return `<details class="p-undated-model"><summary><b>${esc(modelLabel(key))}</b><span>${meta.occurrence_count}履歴 · source ${esc(sourceDate(snap))}</span></summary><div class="p-undated-list">${rows.map(r=>`<button type="button" data-pachinko-record="${r.record_id}" data-pachinko-snapshot-id="${r.snapshot_id??meta.snapshot_id??''}"><span>${esc(r.machine_no)}番</span><b>${displayedK(r)}</b><small>start ${formatPachinkoCount(r.start)} · ${statusLabel(r.estimator_status)} · 同値件数 ${r.occurrence_count}</small></button>`).join('')}</div>${meta.truncated?'<p class="p-note">表示は200レコードまで。全台が先に1件ずつ含まれるよう均等に抽出しています。</p>':''}</details>`}).join('')}</section>`;
}
export function renderPachinkoScreenState(st){
  ensureLoad(st.app);
  const matrix=st.matrix,selected=st.selectedDate||matrix?.dates?.[0]||'';
  return `<section class="workspace pachinko-data-screen"><style>${STYLE}</style><button class="back-row" type="button" data-workspace="store">‹ 店舗</button><div class="kicker">STORE / PACHINKO</div><div class="p-title-row"><button class="store-title compact" type="button" data-open-store-selector><span>PIA大船-P</span><span class="store-down">⌄</span></button><button type="button" class="p-refresh" data-pachinko-refresh ${st.loading?'disabled':''}>更新</button></div><p class="p-venue">4円・250玉貸し・等価交換 / Kは回/250玉。差玉とは別指標です。</p><div class="p-filters" role="group" aria-label="機種フィルタ">${FILTERS.map(([key,label])=>`<button type="button" data-pachinko-filter="${esc(key)}" class="${st.filter===key?'selected':''}">${esc(label)}</button>`).join('')}</div>${st.loading&&!matrix?'<div class="p-loading">PIA大船-Pを読み込み中…</div>':''}${st.error?`<div class="p-error">${esc(st.error)}${/権限/.test(st.error)?' 「設定」→PIAデータ閲覧も確認してね。':''}</div>`:''}${matrix?`${renderDateToolbar(matrix,selected)}${selected?renderSummary(matrix,selected,st.filter):''}${renderTable(matrix,selected)}${renderUndated(matrix)}${renderDetail(st)}`:''}</section>`;
}
const STYLE=`
.pachinko-data-screen{
  --p-ink:#101a33;
  --p-title:#111c3c;
  --p-accent:#315bea;
  --p-accent-soft:#edf2ff;
  --p-panel:rgba(255,255,255,.97);
  --p-panel-soft:#f7f9ff;
  --p-border:#e2e8f3;
  --p-border-strong:#cbd6ea;
  --p-muted:#7e899f;
  --p-muted-strong:#69758e;
  --p-shadow:0 8px 28px rgba(35,61,112,.055);
  max-width:100%;min-width:0;overflow:hidden;color:var(--p-ink)
}
.pachinko-data-screen *{box-sizing:border-box}
.pachinko-data-screen .kicker{color:var(--p-accent)}
.p-title-row{display:flex;align-items:center;gap:10px;margin-top:2px}
.p-title-row .store-title{min-width:0;flex:1;color:var(--p-title)}
.p-refresh{min-height:44px;border:0;background:var(--p-accent);color:#fff;border-radius:16px;padding:10px 15px;font-size:13px;font-weight:850;box-shadow:none;transition:transform .16s ease,opacity .16s ease,background .16s ease}
.p-refresh:active{transform:scale(.98)}.p-refresh:disabled{opacity:.48}
.p-venue,.p-note{font-size:12px;line-height:1.55;color:var(--p-muted);margin:8px 0 14px}
.p-candidate-note{font-size:11px;line-height:1.6;color:#916a26;margin:10px 0}.p-history-candidate{color:var(--p-ink)}
.p-filters{display:flex;gap:7px;overflow:auto;padding:1px 1px 10px;scrollbar-width:none}
.p-filters::-webkit-scrollbar{display:none}
.p-filters button{min-height:38px;white-space:nowrap;border:1px solid var(--p-border);background:var(--p-panel);color:var(--p-muted-strong);border-radius:16px;padding:8px 12px;font-size:12px;font-weight:800;box-shadow:none;transition:background .16s ease,color .16s ease,border-color .16s ease,transform .16s ease}
.p-filters button:active{transform:scale(.98)}
.p-filters .selected{background:var(--p-accent-soft);color:var(--p-accent);border-color:#cdd9ff;outline:0}
.p-loading,.p-error,.p-empty{padding:20px;border-radius:20px;background:var(--p-panel);border:1px solid var(--p-border);box-shadow:var(--p-shadow);margin:12px 0;color:var(--p-muted-strong);font-size:12px;line-height:1.55}
.p-empty{text-align:center;border-style:dashed;background:rgba(255,255,255,.65)}
.p-error{background:#fff8f8;border-color:#f0d4d8;color:#9a3c47;box-shadow:none}
.p-selected-summary,.p-summary-compare{margin:12px 0 14px}
.p-summary-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 2px 8px}
.p-summary-head small{display:block;color:var(--p-accent);font-size:10px;font-weight:900;letter-spacing:.08em}
.p-summary-head h2{margin:3px 0 0;color:var(--p-title);font-size:19px;line-height:1.25}
.p-summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:0}
.p-summary-grid article{min-width:0;padding:14px;border:1px solid var(--p-border);border-radius:18px;background:var(--p-panel);box-shadow:var(--p-shadow)}
.p-metric-card>small{display:block;color:var(--p-muted);font-size:10px;font-weight:800;line-height:1.3}
.p-metric-card>div{display:flex;align-items:baseline;gap:4px;flex-wrap:wrap;margin-top:7px}
.p-metric-card strong{display:inline-block;font-size:24px;line-height:1.05;color:var(--p-title);letter-spacing:-.03em;font-weight:900}
.p-metric-card span{color:var(--p-muted);font-size:9px;font-weight:750}
.p-summary-note{font-size:10px;line-height:1.5;color:var(--p-muted);margin:7px 2px 0}
.p-compare-scroll{overflow:auto;border:1px solid var(--p-border);border-radius:18px;background:var(--p-panel);box-shadow:var(--p-shadow);-webkit-overflow-scrolling:touch}
.p-summary-compare table{width:100%;min-width:510px;border-collapse:collapse;font-size:11px}
.p-summary-compare th,.p-summary-compare td{padding:10px 11px;border-bottom:1px solid var(--p-border);text-align:right;white-space:nowrap;color:var(--p-title)}
.p-summary-compare tr:last-child th,.p-summary-compare tr:last-child td{border-bottom:0}
.p-summary-compare thead th{background:#f9fbff;color:var(--p-muted-strong);font-size:9px;font-weight:850}
.p-summary-compare thead th:first-child,.p-summary-compare tbody th{text-align:left}
.p-summary-compare tbody th{min-width:128px}.p-summary-compare tbody th b{display:block;font-size:11px;font-weight:900}.p-summary-compare tbody th .p-status{margin-top:4px}
.p-summary-compare td{font-size:14px;font-weight:900}.p-summary-compare td small{display:block;font-size:8px;color:var(--p-muted);font-weight:700;margin-top:2px}
.p-status{display:inline-flex;align-items:center;min-height:22px;font-size:9px;font-weight:850;border-radius:999px;padding:4px 7px;background:#eef1f6;color:#68758d}
.p-status.verified{background:#e9f8f1;color:#168a5c}.p-status.provisional{background:#fff5dc;color:#9a6a08}
.p-table-scroll{width:100%;max-width:100%;overflow:auto;border:1px solid var(--p-border);border-radius:20px;background:var(--p-panel);box-shadow:var(--p-shadow);overscroll-behavior-inline:contain;-webkit-overflow-scrolling:touch}
.p-matrix{border-collapse:separate;border-spacing:0;min-width:max-content;font-size:12px;color:var(--p-ink)}
.p-matrix th,.p-matrix td{border-right:1px solid var(--p-border);border-bottom:1px solid var(--p-border);padding:0;text-align:center;background:var(--p-panel)}
.p-matrix thead th{position:sticky;top:0;z-index:3;background:#f9fbff}
.p-matrix .p-seat{position:sticky;left:0;z-index:2;min-width:118px;max-width:118px;text-align:left;padding:9px 10px;background:#fbfcff}
.p-matrix thead .p-seat{z-index:4;background:#f6f8fe}
.p-seat b{display:block;color:var(--p-title);font-size:12px;font-weight:900}.p-seat small{display:block;color:var(--p-muted);font-size:10px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.p-date-toolbar{margin:10px 0 12px}.p-date-toolbar label{min-width:150px}
.p-date-head{display:block;min-height:42px;color:var(--p-muted-strong);padding:12px 13px 9px;white-space:nowrap;font-size:11px;font-weight:800}
.p-date-head.selected{color:var(--p-accent);font-weight:900;background:var(--p-accent-soft);box-shadow:inset 0 -2px 0 var(--p-accent)}
.p-matrix td.selected,.p-matrix .p-day-col.selected{background:#fbfcff}
.p-cell{border:0;background:transparent;min-width:96px;padding:8px 9px;color:var(--p-ink);border-radius:0}
.p-cell b,.p-cell small{display:block}.p-cell b{font-size:18px;color:var(--p-title);font-weight:900}.p-cell small{font-size:10px;color:var(--p-muted);margin-top:2px}.p-cell.provisional b{color:#a77119;opacity:1}
.p-no-data{min-width:96px;color:#a8b1c2}
.p-section-head{display:flex;align-items:end;justify-content:space-between;gap:10px;margin:22px 2px 9px}.p-section-head small{display:block;color:var(--p-accent);font-size:10px;font-weight:900;letter-spacing:.08em}.p-section-head h2{margin:3px 0 0;color:var(--p-title);font-size:20px}.p-section-head span{font-size:11px;line-height:1.5;color:var(--p-muted);max-width:55%}
.p-undated-model{border:1px solid var(--p-border);border-radius:16px;margin:8px 0;overflow:hidden;background:var(--p-panel);box-shadow:0 4px 18px rgba(35,61,112,.035)}
.p-undated-model summary{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 14px;cursor:pointer;color:var(--p-title)}
.p-undated-model summary b{font-size:12px;font-weight:900}.p-undated-model summary span{font-size:10px;color:var(--p-muted)}
.p-undated-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--p-border);border-top:1px solid var(--p-border)}
.p-undated-list button{border:0;text-align:left;background:#fff;padding:11px 12px;min-width:0;color:var(--p-ink);border-radius:0}
.p-undated-list button span,.p-undated-list button b,.p-undated-list button small{display:block}.p-undated-list button span{font-size:11px;color:var(--p-muted-strong);font-weight:800}.p-undated-list button b{font-size:18px;color:var(--p-title);margin-top:2px}.p-undated-list button small{font-size:10px;color:var(--p-muted);margin-top:3px;overflow-wrap:anywhere}
.p-detail{margin-top:16px;border:1px solid var(--p-border);border-radius:20px;padding:18px;background:var(--p-panel);box-shadow:var(--p-shadow);max-width:100%;overflow:hidden}
.p-detail-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.p-detail-head small{display:block;color:var(--p-accent);font-size:10px;font-weight:900;letter-spacing:.08em}.p-detail-head h2{margin:4px 0 0;color:var(--p-title);font-size:20px}.p-detail-head button{border:0;background:var(--p-accent-soft);color:var(--p-accent);border-radius:14px;min-height:38px;padding:8px 12px;font-size:11px;font-weight:850}
.p-kvs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.p-kv{padding:10px 11px;border:1px solid #edf0f6;border-radius:12px;background:var(--p-panel-soft);min-width:0}.p-kv small,.p-kv b{display:block;overflow-wrap:anywhere}.p-kv small{color:var(--p-muted);font-size:9px;font-weight:700}.p-kv b{color:var(--p-title);font-size:12px;margin-top:4px;font-weight:850}
.p-details{margin-top:10px;border-top:1px solid var(--p-border);padding-top:10px}.p-details summary{color:var(--p-accent);font-size:11px;font-weight:850;cursor:pointer;padding:4px 0}.p-details p{font-size:11px;line-height:1.55;color:var(--p-muted)}.p-details pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:10px;color:var(--p-muted-strong);background:var(--p-panel-soft);border-radius:12px;padding:10px;max-height:240px;overflow:auto}
@media(max-width:560px){.p-selected-summary .p-summary-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.p-selected-summary .p-summary-grid article{padding:11px 9px;border-radius:16px}.p-selected-summary .p-metric-card strong{font-size:20px}.p-selected-summary .p-metric-card span{font-size:8px}.p-summary-compare{margin-top:10px}.p-compare-scroll{border-radius:16px}.p-undated-list{grid-template-columns:1fr}.p-kvs{grid-template-columns:1fr}.p-section-head{align-items:start;flex-direction:column}.p-section-head span{max-width:none}.p-title-row{align-items:stretch}.p-title-row .store-title{font-size:20px}.p-refresh{padding-inline:14px}.p-table-scroll{border-radius:16px}.p-detail{border-radius:18px;padding:15px}}
`;

function patchApp(){
  const App=customElements.get('jugest-app');if(!App||App.prototype.__jugestPachinkoPatched)return;const proto=App.prototype;proto.__jugestPachinkoPatched=true;
  const oldSub=proto.renderSubscreen,oldClick=proto.onClick,oldChange=proto.onChange;
  proto.renderSubscreen=function(){if(this.state?.workspace==='store'&&this.state?.screen==='pachinko'){const st=stateOf(this);st.app=this;return renderPachinkoScreenState(st)}return oldSub.call(this)};
  proto.onClick=function(event){
    const p=event.target.closest?.('[data-pachinko-store],[data-pachinko-filter],[data-pachinko-record],[data-pachinko-refresh],[data-pachinko-close-detail]');
    if(p){
      if(p.hasAttribute('data-pachinko-store')){this.state.storeSelectorOpen=false;this.navigate('store','pachinko');const st=stateOf(this);st.loaded=false;st.matrix=null;st.error='';ensureLoad(this);return}
      if(p.hasAttribute('data-pachinko-filter')){const st=stateOf(this);st.filter=p.dataset.pachinkoFilter||'';st.loaded=false;st.matrix=null;st.selectedDate='';void refresh(this,{keepScroll:false});return}
      if(p.hasAttribute('data-pachinko-record')){void openDetail(this,Number(p.dataset.pachinkoRecord),{date:p.dataset.pachinkoRecordDate||'',snapshotId:p.dataset.pachinkoSnapshotId||null});return}
      if(p.hasAttribute('data-pachinko-refresh')){void refresh(this);return}
      if(p.hasAttribute('data-pachinko-close-detail')){const st=stateOf(this);st.detail=null;st.detailError='';rerender(this);return}
    }
    return oldClick.call(this,event)
  };
  proto.onChange=function(event){
    const date=event.target.closest?.('[data-pachinko-date-select]');
    if(date){const st=stateOf(this);st.selectedDate=date.value||'';st.detail=null;rerender(this);return}
    return oldChange.call(this,event)
  };
}
function visibleStoreRowName(row){return String(row?.querySelector?.('.store-row-main b')?.textContent||'').trim()}
function compareStoreNames(a,b){return String(a||'').localeCompare(String(b||''),'ja',{numeric:true,sensitivity:'base'})}
function sortStoreSelectorRows(list){
  const rows=[...list.querySelectorAll(':scope > .store-row')],sorted=[...rows].sort((a,b)=>compareStoreNames(visibleStoreRowName(a),visibleStoreRowName(b)));
  if(rows.some((row,i)=>row!==sorted[i]))for(const row of sorted)list.append(row);
}
function reconcileStoreSelector(){
  const app=document.querySelector('jugest-app'),root=app?.shadowRoot,list=root?.querySelector('.store-list[data-store-list]');if(!app||!list)return;
  for(const row of list.querySelectorAll('[data-store-name]'))if(row.dataset.storeName==='PIA大船1'){const b=row.querySelector('.store-row-main b');if(b&&b.textContent!=='PIA大船-S')b.textContent='PIA大船-S'}
  const q=String(app.state?.storeQuery||'').trim().toLocaleLowerCase('ja-JP'),show=!q||'pia大船-p'.toLocaleLowerCase('ja-JP').includes(q)||'大船'.includes(q);
  let row=list.querySelector('[data-pachinko-store]');if(!show){row?.remove();sortStoreSelectorRows(list);return}if(!row){row=document.createElement('button');row.type='button';row.className='store-row';row.dataset.pachinkoStore=PACHINKO_STORE_ID;row.innerHTML='<span class="store-row-main"><b>PIA大船-P</b><small>パチンコ回転率データ</small></span><span class="store-badge ok">P</span><span class="chev">›</span>';list.append(row)}sortStoreSelectorRows(list)
}
function boot(){customElements.whenDefined('jugest-app').then(()=>{patchApp();const app=document.querySelector('jugest-app');if(!app?.shadowRoot)return;const observer=new MutationObserver(()=>reconcileStoreSelector());observer.observe(app.shadowRoot,{childList:true,subtree:true});reconcileStoreSelector();globalThis.addEventListener?.('jugest:pia-access-changed',event=>{if(event.detail?.active===false){clearState(app);if(app.state?.workspace==='store'&&app.state?.screen==='pachinko')rerender(app)}else if(app.state?.workspace==='store'&&app.state?.screen==='pachinko')void refresh(app)});document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='visible'&&app.state?.workspace==='store'&&app.state?.screen==='pachinko')void refresh(app)});globalThis.addEventListener?.('pageshow',()=>{if(app.state?.workspace==='store'&&app.state?.screen==='pachinko')void refresh(app)})})}
if(typeof window!=='undefined'&&typeof document!=='undefined'&&typeof customElements!=='undefined')boot();

export const __test={stateOf,clearState,renderSummary,renderDateToolbar,renderTable,renderUndated,renderDetail,snapshotForDetail,assignmentForDetail,visibleStoreRowName,compareStoreNames,sortStoreSelectorRows,STYLE};
