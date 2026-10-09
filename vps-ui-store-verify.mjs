// Read-only VPS verification. No prediction or backtest work may run on the handset.
import {createVpsAnalyticsClient} from './vps-browser-analytics.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>v==null||v===''||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('ja-JP',{maximumFractionDigits:2});
const pct=v=>v==null||!Number.isFinite(Number(v))?'—':(100*Number(v)).toFixed(1)+'%';
const lift=v=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toFixed(2)+'×';
const winner=v=>v==='pre_research'?'PRE版':v==='current_shadow'?'現行版':v==='tie'?'引き分け':'未採点';
const value=v=>v==null||!Number.isFinite(Number(v))?'—':Math.max(0,Number(v)).toLocaleString('ja-JP');
function stat(name,result){return '<div class="sv2-verify-stat"><small>'+name+'</small><strong>'+esc(result)+'</strong></div>'}
function message(title,details){return '<div class="sv2-verify-message"><b>'+esc(title)+'</b><span>'+esc(details)+'</span></div>'}
function engineTable(a,b){
 const metrics=[['Top1 lift',lift(a?.top1?.lift),lift(b?.top1?.lift)],['Top3 lift',lift(a?.top3?.lift),lift(b?.top3?.lift)],['Top5 lift',lift(a?.top5?.lift),lift(b?.top5?.lift)],['順位相関',n(a?.rankCorrelation),n(b?.rankCorrelation)],['対象台カバー率',pct(a?.coverage),pct(b?.coverage)]];
 return '<div class="sv2-verify-matrix-scroll"><table class="sv2-verify-matrix"><thead><tr><th>指標</th><th>PRE版</th><th>現行版</th></tr></thead><tbody>'+
 metrics.map(([key,x,y])=>'<tr><th scope="row">'+key+'</th><td>'+esc(x)+'</td><td>'+esc(y)+'</td></tr>').join('')+'</tbody></table></div>';
}
function dayList(rows,mode){
 if(!rows.length)return message('表示できる日別結果はまだありません','予測の固定・実績取得・採点が完了すると、ここに蓄積されます。');
 return '<div class="sv2-verify-days">'+rows.slice(0,30).map(row=>{
  const pre=mode==='live'?row?.scores?.pre_research?.metrics:row?.preMetrics;
  const cur=mode==='live'?row?.scores?.current_shadow?.metrics:row?.currentMetrics;
  const status=row?.excludedReason?'未採点':winner(row?.winner);
  return '<details class="sv2-verify-day"><summary><b>'+esc(row?.targetDate||'—')+'</b><span>'+esc(status)+'</span></summary><div>'+
   (row?.excludedReason?'<p>状態：'+esc(row.excludedReason)+'</p>':'<p>PRE評価 '+esc(n(pre?.quality))+' / 現行評価 '+esc(n(cur?.quality))+'</p>')+
   '<p>固定予測と実績の比較記録（この画面では再計算しません）</p></div></details>';
 }).join('')+'</div>';
}
export function renderVerificationResults(comparison,mode){
 if(!comparison)return message('検証データを取得できません','VPSの保存済み結果がまだ利用できません。');
 if(mode==='historical'){
  const h=comparison.historical;
  if(!h)return message('過去検証の準備中','VPSのwalk-forward検証が未作成です。ジョブの処理状況を確認してください。');
  const processed=Number(h.processed)||0,total=Number(h.totalCandidates)||0,scored=Number(h.scored)||0;
  let body='<div class="sv2-verify-kpis">'+stat('採点済み',scored+'日')+stat('進捗',total?processed+'/'+total:'未作成')+stat('未採点',value(h.excluded)+'日')+'</div>';
  if(h.refreshPending)body+='<p class="sv2-verify-notice">新しい実績を反映する再検証を待っています。</p>';
  if(total)body+='<progress class="sv2-verify-progress" max="'+total+'" value="'+Math.min(processed,total)+'"></progress>';
  if(scored>0){
   body+='<div class="sv2-verify-card"><b>PRE版 vs 現行版</b><div class="sv2-verify-kpis">'+stat('PRE版優勢',value(h.newWins)+'日')+stat('現行版優勢',value(h.currentWins)+'日')+stat('引き分け',value(h.ties)+'日')+'</div>'+engineTable(h.newEngine,h.currentEngine)+'</div>';
  }else body+=message('採点可能な結果はまだありません',total?'VPSで過去検証を進行中です。':'学習履歴が不足しているか、検証ジョブがまだ始まっていません。');
  body+='<div class="sv2-verify-card"><b>過去の日別結果</b>'+dayList(Array.isArray(h.rows)?h.rows:[],'historical')+'</div>';
  return body+'<p class="sv2-verify-disclaimer">各日より前のデータだけで予測した過去検証。LIVE実績とは分けて集計しています。</p>';
 }
 const live=comparison.live;
 if(!live)return message('LIVE検証の記録がありません','翌日予測を固定し、実績が到着した後に採点した結果を表示します。');
 const days=Number(live.days)||0,unscored=Number(live.excluded)||0;
 let body='<div class="sv2-verify-kpis">'+stat('採点済み',days+'日')+stat('未採点',unscored+'日')+stat('方式','日次固定予測')+'</div>';
 if(days>0){
  body+='<div class="sv2-verify-card"><b>PRE版 vs 現行版</b><div class="sv2-verify-kpis">'+stat('PRE版優勢',value(live.newWins)+'日')+stat('現行版優勢',value(live.currentWins)+'日')+stat('引き分け',value(live.ties)+'日')+'</div>'+engineTable(live.newEngine,live.currentEngine)+'</div>';
 }else body+=message('答え合わせを蓄積中','VPSが翌日予測を固定保存し、後日届いた実績データで自動採点します。');
 body+='<div class="sv2-verify-card"><b>日別の答え合わせ</b>'+dayList(Array.isArray(live.rows)?live.rows:[],'live')+'</div>';
 return body+'<p class="sv2-verify-disclaimer">未来情報を使わない日次固定予測の成績です。端末内の過去予測とは異なる指標で評価します。</p>';
}
export function errorMessage(error){
 const code=String(error?.code||'');
 if(code==='vps_credentials_unavailable'||code==='unauthorized'||code==='http_401')return message('VPS連携が必要です','設定からiPhone Collector連携を行ってください。端末側で検証計算は実行しません。');
 if(code==='vps_store_not_found'||code==='store_not_found')return message('VPSにこの店舗の検証記録がありません','店舗データの収集・同期状況を確認してください。');
 if(code==='forbidden'||code==='pia_view_scope_denied'||code==='http_403')return message('この検証記録への閲覧権限がありません','VPSのCollector連携またはアクセス権限を確認してください。');
 return message('VPSから結果を取得できませんでした',String(error?.message||'通信状態を確認して再試行してください。'));
}
export function createVerificationReader({client=createVpsAnalyticsClient(),clock=()=>Date.now(),ttlMs=60000}={}){
 const cache=new Map(),pending=new Map();
 async function read(shop,{force=false}={}){
  const key=String(shop||'').trim();
  if(!key)throw Object.assign(new Error('店舗が未選択です'),{code:'vps_store_required'});
  const cached=cache.get(key);
  if(!force&&cached&&clock()-cached.when<ttlMs)return cached.result;
  if(pending.has(key))return pending.get(key);
  const work=Promise.resolve().then(()=>client.getResearchComparison(key,{limit:90})).then(payload=>{
   const result=payload?.comparison??null;cache.set(key,{when:clock(),result});return result;
  }).finally(()=>{if(pending.get(key)===work)pending.delete(key)});
  pending.set(key,work);return work;
 }
 return {read,peek:shop=>{const item=cache.get(shop);return item&&clock()-item.when<ttlMs?item.result:null},clear:shop=>cache.delete(shop)};
}
export const __test={n,pct,lift,dayList};
