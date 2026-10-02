(function(global){
'use strict';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(value,digits=2)=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('ja-JP',{maximumFractionDigits:digits}):'—';
const percent=value=>Number.isFinite(value)?`${(value*100).toFixed(1)}%`:'—';
const top=result=>result.mostLikelySettings.map(s=>`設定${s}`).join(' / ');
const rate=(games,count)=>count>0?`1/${number(games/count)}`:'0回';
const pair=(label,value)=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
function fields(row,machines){
 const x=row.input,id=esc(row.id);
 return `<div class="observed-fields" data-observed-row="${id}"><label>機種<select data-observed-field="machine"><option value="">選択してください</option>${machines.map(m=>`<option value="${esc(m.key)}" ${x.machine===m.key?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>${[['tableNo','台番（任意）'],['games','通常G'],['bb','BB'],['rb','RB'],['diff','差枚（任意）']].map(([key,label])=>`<label>${label}<input type="text" inputmode="${key==='diff'?'text':'numeric'}" data-observed-field="${key}" value="${esc(x[key])}" autocomplete="off" ${row.errors[key]?`aria-invalid="true" aria-describedby="observed-${id}-${key}"`:''}>${row.errors[key]?`<small id="observed-${id}-${key}" class="observed-error">${esc(row.errors[key])}</small>`:''}</label>`).join('')}</div>${Object.entries(row.errors).filter(([key])=>!['machine','games','bb','rb','diff'].includes(key)).map(([,message])=>`<p class="observed-error" role="alert">${esc(message)}</p>`).join('')}${row.errors.machine?`<p class="observed-error" role="alert">${esc(row.errors.machine)}</p>`:''}`;
}
function summary(result){return `<dl class="observed-summary">${pair('期待設定',number(result.expectedSetting))}${pair('最有力設定',top(result))}${pair('P4+',percent(result.p4))}${pair('P5+',percent(result.p5))}${pair('P6',percent(result.p6))}${pair('分布集中度',`${number(result.distributionConcentration,1)}%`)}</dl>`}
function result(result){
 const x=result.input,d=result.diagnostics,z=d.reverse,table=result.engine.table;
 return `<section class="observed-result" data-observed-result>
  <section class="panel"><h2>${esc(result.machineName)}${x.tableNo?` · 台${esc(x.tableNo)}`:''}</h2>${summary(result)}<p class="observed-help">分布集中度は、設定確率がどれだけ一部の設定へ集中しているかを表す指標で、判別の的中率ではありません。</p>${result.warnings.map(w=>`<p class="observed-error" role="alert">${esc(w)}</p>`).join('')}</section>
  <section class="panel"><h2>設定1〜6の確率</h2><div class="observed-distribution">${result.q.map((p,i)=>`<div class="observed-probability"><span>設定${i+1}</span><div class="observed-bar-track" aria-hidden="true"><div class="observed-bar" style="width:${p*100}%"></div></div><strong>${percent(p)}</strong></div>`).join('')}</div><p class="observed-help">すべての棒は0〜100%の共通スケールです。</p></section>
  <section class="panel"><h2>入力データ</h2><dl class="observed-input-summary">${pair('通常G',`${number(x.games,0)}G`)}${pair('BB',number(x.bb,0))}${pair('RB',number(x.rb,0))}${pair('差枚',x.diff==null?'未入力':`${x.diff>=0?'+':''}${number(x.diff,0)}枚`)}${pair('BB確率',rate(x.games,x.bb))}${pair('RB確率',rate(x.games,x.rb))}${pair('合算',rate(x.games,x.bb+x.rb))}</dl><p class="observed-help">確率表記は入力値からの参考表示です。判別への再入力には使用していません。</p></section>
  <details class="panel observed-details"><summary>詳細分析を見る</summary><dl class="observed-input-summary">${pair('使用モード（method）',result.method)}${pair('打ち方条件','不明（unknown）')}${pair('逆算警告',result.reverseWarn?'あり':'なし')}${pair('推定ブドウ確率',Number.isFinite(result.estimatedGrape)?`1/${number(result.estimatedGrape)}`:'未使用')}${pair('推定ブドウ個数',number(result.estimatedGrapeCount))}${pair('既存逆算範囲（個数）',Number.isFinite(result.grapeCountLo)&&Number.isFinite(result.grapeCountHi)?`${number(result.grapeCountLo)}〜${number(result.grapeCountHi)}`:'未使用')}</dl>
   <h3>設定別ログ尤度</h3><dl class="observed-input-summary">${(d.logs||[]).map((value,i)=>pair(`設定${i+1}`,Number.isFinite(value)?number(value,6):'−∞')).join('')}</dl><p class="observed-help">同じ判別実行で計算された値です。ログ尤度の大きさは、判別の的中率を表しません。</p>
   ${z?`<h3>既存の設定別逆算行</h3><div class="observed-diagnostic-rows">${z.rows.map(row=>`<details><summary>設定${row.s}</summary><dl class="observed-input-summary">${pair('逆算ブドウ個数 V',number(row.V))}${pair('逆算分母 vg',number(row.vg))}${pair('テーブルのブドウ分母 tg',number(row.tg))}${pair('テーブルのBB分母 b',number(row.b))}${pair('テーブルのRB分母 r',number(row.r))}${pair('逆算標準偏差 sd',number(row.sd))}</dl></details>`).join('')}</div><p class="observed-help">打ち方混合：${z.unknownMix?'既存の不明打ち方混合を使用':'なし'}。観測値ではなく、既存エンジンの逆算値です。</p>`:'<p class="observed-help">差枚を使用した逆算情報はありません。</p>'}
  </details>
  <details class="panel observed-details"><summary>技術情報を見る</summary><dl class="observed-input-summary">${pair('判別方式',result.method)}${pair('機種名',result.machineName)}${pair('内部機種キー',x.machine)}${pair('MCP判別識別子',result.engine.judgeVersion)}${pair('UIコード版',result.engine.uiVersion)}${pair('Bridgeコード版',result.engine.bridgeVersion)}${pair('判別の正','既存 externalJudge')}${pair('小役逆算の打ち方','unknown')}</dl><h3>使用した既存テーブル</h3><pre>${esc(JSON.stringify(table,null,2))}</pre><p class="observed-help">UI・Bridge・MCPの識別子はそれぞれ別のものです。単一の判別数学バージョンではありません。</p></details>
 </section>`;
}
global.JUGESTJudgementView=Object.freeze({fields,summary,result});
})(typeof globalThis!=='undefined'?globalThis:this);
