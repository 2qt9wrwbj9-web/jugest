(function(global){
'use strict';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(value,digits=2)=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('ja-JP',{maximumFractionDigits:digits}):'—';
const grape=value=>Number.isFinite(value)?`1/${number(value)}`:'—';
const percent=value=>Number.isFinite(value)?`${(value*100).toFixed(1)}%`:'—';
const top=result=>result.mostLikelySettings.map(s=>`設定${s}`).join(' / ');
const rate=(games,count)=>count>0?`1/${number(games/count)}`:'0回';
const pair=(label,value)=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
function fields(row,machines){
 const x=row.input,id=esc(row.id);
 return `<div class="observed-fields" data-observed-row="${id}"><label>機種<select data-observed-field="machine"><option value="">選択してください</option>${machines.map(m=>`<option value="${esc(m.key)}" ${x.machine===m.key?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>${[['tableNo','台番（任意）'],['games','通常G'],['bb','BB'],['rb','RB'],['diff','差枚（任意）']].map(([key,label])=>`<label>${label}<input type="text" inputmode="${key==='diff'?'text':'numeric'}" data-observed-field="${key}" value="${esc(x[key])}" autocomplete="off" ${row.errors[key]?`aria-invalid="true" aria-describedby="observed-${id}-${key}"`:''}>${row.errors[key]?`<small id="observed-${id}-${key}" class="observed-error">${esc(row.errors[key])}</small>`:''}</label>`).join('')}</div>${Object.entries(row.errors).filter(([key])=>!['machine','games','bb','rb','diff'].includes(key)).map(([,message])=>`<p class="observed-error" role="alert">${esc(message)}</p>`).join('')}${row.errors.machine?`<p class="observed-error" role="alert">${esc(row.errors.machine)}</p>`:''}`;
}
// Display aliases only; the existing machine keys and judgement inputs are unchanged.
const shortNames=Object.freeze({my:'マイV',im:'アイム',go:'ゴー3',fk:'ファン2',hp:'ハッピー',gg:'ガールズ',mr:'ミスター',um:'ウルミラ'});
function parallelEditor(rows,machines){
 const columns=[['tableNo','台番'],['machine','機種'],['games','G'],['bb','BB'],['rb','RB'],['diff','差枚']];
 const lines=rows.map((row,index)=>{
  const errorId=`observed-row-errors-${esc(row.id)}`,x=row.input;
  const cells=columns.map(([key,label])=>{
   const invalid=row.errors[key]?` aria-invalid="true" aria-describedby="${errorId}"`:'';
   const attrs=`data-observed-field="${key}" aria-label="${index+1}行目 ${label}"${invalid}`;
   return key==='machine'?`<select ${attrs}><option value="">選択</option>${machines.map(m=>`<option value="${esc(m.key)}" ${x.machine===m.key?'selected':''}>${esc(shortNames[m.key]||m.name)}</option>`).join('')}</select>`:`<input type="text" inputmode="${key==='diff'?'text':'numeric'}" ${attrs} value="${esc(x[key])}" autocomplete="off" autocorrect="off" spellcheck="false">`;
  }).join('');
  const errors=Object.values(row.errors);
  return `<div class="observed-table-row" data-observed-row="${esc(row.id)}" data-observed-card>${cells}<button type="button" data-observed-action="delete" data-row-id="${esc(row.id)}" aria-label="${index+1}行目を削除">×</button>${errors.length?`<div class="observed-error observed-row-errors" id="${errorId}" role="alert">${index+1}行目：${errors.map(esc).join(' ')}</div>`:''}</div>`;
 }).join('');
 return `<div class="observed-parallel-editor" data-observed-parallel-editor role="group" aria-label="並列判別の台データ"><div class="observed-table-head" aria-hidden="true">${columns.map(([,label])=>`<span>${label}${label==='機種'?' ▾':''}</span>`).join('')}<span>削除</span></div>${lines||'<p class="observed-help">行を追加して入力してください。</p>'}</div>`;
}
function parallelResults(rows){
 const judged=rows.filter(row=>row.result);
 if(!judged.length)return '';
 return `<section class="observed-parallel-results" aria-label="並列判別結果"><h2>判別結果</h2>${judged.map((row,index)=>{
  const r=row.result;
  return `<button type="button" class="observed-result-row" data-row-summary data-observed-result-row="${esc(row.id)}" data-observed-action="detail" data-row-id="${esc(row.id)}"><span class="observed-result-main"><b>${esc(r.input.tableNo||`台番なし（${rows.indexOf(row)+1}行目）`)}</b><span>${esc(shortNames[r.input.machine]||r.machineName)}</span><span>期待設定 <strong>${number(r.expectedSetting)}</strong></span><span>${esc(top(r))}</span></span><span class="observed-result-probs"><span>P4+ <b>${percent(r.p4)}</b></span><span>P5+ <b>${percent(r.p5)}</b></span><span>P6 <b>${percent(r.p6)}</b></span></span><span>推定ブドウ <b>${grape(r.estimatedGrape)}</b></span></button>`;
 }).join('')}<p class="observed-help">結果をタップすると詳細を表示します。</p></section>`;
}
function summary(result){return `<dl class="observed-summary">${pair('期待設定',number(result.expectedSetting))}${pair('最有力設定',top(result))}${pair('P4+',percent(result.p4))}${pair('P5+',percent(result.p5))}${pair('P6',percent(result.p6))}${pair('推定ブドウ',grape(result.estimatedGrape))}${pair('分布集中度',`${number(result.distributionConcentration,1)}%`)}</dl>`}
function developerInfo(result){
 const x=result.input,d=result.diagnostics,z=d.reverse,table=result.engine.table;
 return `<details class="panel observed-details" data-observed-debug><summary>開発者情報</summary><dl class="observed-input-summary">${pair('使用モード（method）',result.method)}${pair('打ち方条件','不明（unknown）')}</dl>
   <h3>設定別ログ尤度</h3><dl class="observed-input-summary">${(d.logs||[]).map((value,i)=>pair(`設定${i+1}`,Number.isFinite(value)?number(value,6):'−∞')).join('')}</dl><p class="observed-help">同じ判別実行で計算された値です。ログ尤度の大きさは、判別の的中率を表しません。</p>
   ${z?`<h3>既存の設定別逆算行</h3><div class="observed-diagnostic-rows">${z.rows.map(row=>`<details><summary>設定${row.s}</summary><dl class="observed-input-summary">${pair('逆算ブドウ個数 V',number(row.V))}${pair('逆算分母 vg',number(row.vg))}${pair('テーブルのブドウ分母 tg',number(row.tg))}${pair('テーブルのBB分母 b',number(row.b))}${pair('テーブルのRB分母 r',number(row.r))}${pair('逆算標準偏差 sd',number(row.sd))}</dl></details>`).join('')}</div><p class="observed-help">打ち方混合：${z.unknownMix?'既存の不明打ち方混合を使用':'なし'}。観測値ではなく、既存エンジンの逆算値です。</p>`:'<p class="observed-help">差枚を使用した逆算情報はありません。</p>'}
  <details class="panel observed-details"><summary>技術情報を見る</summary><dl class="observed-input-summary">${pair('判別方式',result.method)}${pair('機種名',result.machineName)}${pair('内部機種キー',x.machine)}${pair('MCP判別識別子',result.engine.judgeVersion)}${pair('UIコード版',result.engine.uiVersion)}${pair('Bridgeコード版',result.engine.bridgeVersion)}${pair('判別の正','既存 externalJudge')}${pair('小役逆算の打ち方','unknown')}</dl><details><summary>使用テーブルJSON</summary><h3>使用した既存テーブル</h3><pre>${esc(JSON.stringify(table,null,2))}</pre></details><p class="observed-help">UI・Bridge・MCPの識別子はそれぞれ別のものです。単一の判別数学バージョンではありません。</p></details>
 </details>`;
}
/* Display-only interpolation. Existing judgement probabilities are untouched. */
function equivalentSetting(observedProbability,denominators){
 if(!Array.isArray(denominators)||denominators.length!==6||denominators.some(d=>!Number.isFinite(d)||d<=0))return{kind:'missing',label:'—'};
 const p=denominators.map(d=>1/d),eps=1e-12;
 if(p.some((v,i)=>i&&v+eps<p[i-1]))return{kind:'missing',label:'—'};
 if(!Number.isFinite(observedProbability)||observedProbability<0)return{kind:'missing',label:'—'};
 if(p.every(v=>Math.abs(v-p[0])<=eps))return{kind:'range',start:1,end:6,value:3.5,label:'設定差なし'};
 if(observedProbability<p[0]-eps)return{kind:'below',value:1,label:'1未満'};
 if(observedProbability>p[5]+eps)return{kind:'above',value:6,label:'6超'};
 const matches=p.flatMap((v,i)=>Math.abs(v-observedProbability)<=eps?[i+1]:[]);
 if(matches.length>1)return{kind:'range',start:matches[0],end:matches.at(-1),value:(matches[0]+matches.at(-1))/2,label:`${matches[0]}〜${matches.at(-1)}`};
 if(matches.length===1)return{kind:'point',value:matches[0],label:String(matches[0])};
 for(let i=0;i<5;i++){
  if(p[i+1]-p[i]<=eps||observedProbability<p[i]||observedProbability>p[i+1])continue;
  const value=i+1+(observedProbability-p[i])/(p[i+1]-p[i]);
  return{kind:'point',value,label:value.toFixed(1)};
 }
 return{kind:'missing',label:'—'};
}
const factorPct=value=>((Math.max(1,Math.min(6,value))-1)*20).toFixed(3);
function factorRow(name,odds,probability,denominators,color,estimated=false){
 const eq=equivalentSetting(probability,denominators),available=eq.kind!=='missing';
 const at=available?factorPct(eq.value):'0';
 const start=eq.kind==='range'?factorPct(eq.start):'0';
 const width=eq.kind==='range'?((eq.end-eq.start)*20).toFixed(3):at;
 const side=eq.kind==='below'||eq.value<=1?'left':eq.kind==='above'||eq.value>=6?'right':'';
 return `<div class="observed-factor-row" style="--factor-color:${color}">
   <div class="observed-factor-value"><b>${esc(name)}</b><span>${esc(odds)}${estimated?'<small>推定</small>':''}</span></div>
   <div class="observed-factor-plot" aria-label="${esc(name)} ${esc(odds)} 設定相当 ${esc(available?eq.label:'算出不可')}">
    <span class="observed-factor-rail" aria-hidden="true"></span>
    ${available?`<span class="observed-factor-fill" style="left:${start}%;width:${width}%" aria-hidden="true"></span>
    <span class="observed-factor-marker ${eq.kind==='range'?'range':''}" style="left:${at}%" aria-hidden="true"></span>
    <span class="observed-factor-label ${side}" style="left:${at}%">${esc(eq.label)}</span>`:
    '<span class="observed-factor-unknown">算出不可</span>'}
   </div></div>`;
}
function factorPanel(result){
 const x=result.input,settings=result.engine?.table?.settings;
 const rows=Array.isArray(settings)&&settings.length===6?settings:null;
 const specs=key=>rows?rows.map(item=>Number(item?.[key])):[];
 const bb=specs('b'),rb=specs('r'),g=specs('g');
 const combined=rows?rows.map((_,i)=>bb[i]>0&&rb[i]>0?1/(1/bb[i]+1/rb[i]):NaN):[];
 const estimated=Number.isFinite(result.estimatedGrape)&&result.estimatedGrape>0;
 const factors=[
  factorRow('BB',rate(x.games,x.bb),x.bb/x.games,bb,'#ef4444'),
  factorRow('RB',rate(x.games,x.rb),x.rb/x.games,rb,'#3b82f6'),
  factorRow('合算',rate(x.games,x.bb+x.rb),(x.bb+x.rb)/x.games,combined,'#8b5cf6'),
  factorRow('ぶどう',estimated?grape(result.estimatedGrape):'未推定',estimated?1/result.estimatedGrape:NaN,g,'#22c55e',true)
 ].join('');
 const header=['設定','BB','RB','合算','ぶどう'];
 const body=rows?rows.map((row,i)=>`<tr><th scope="row">${i+1}</th>${[bb[i],rb[i],combined[i],g[i]].map(v=>`<td>${grape(v)}</td>`).join('')}</tr>`).join(''):'<tr><td colspan="5">機種スペックを取得できませんでした。</td></tr>';
 return `<section class="panel observed-factor-card"><h2>判別要素別の設定相当値</h2>
  <dl class="observed-compact-summary">${pair('通常G',`${number(x.games,0)}G`)}${pair('BB',number(x.bb,0))}${pair('RB',number(x.rb,0))}${pair('差枚',x.diff==null?'未入力':`${x.diff>=0?'+':''}${number(x.diff,0)}枚`)}</dl>
  <div class="observed-factor-axis" aria-hidden="true"><span></span><div>${Array.from({length:6},(_,i)=>`<span>${i+1}</span>`).join('')}</div></div>
  <div class="observed-factor-rows">${factors}</div>
  <p class="observed-help">設定相当値は参考値です。ぶどうは差枚からの推定値です。</p>
  <h3 class="observed-spec-title">機種スペック表</h3>
  <div class="observed-spec-scroll" role="region" aria-label="機種スペック表" tabindex="0"><table class="observed-spec-table"><thead><tr>${header.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>
  <details class="observed-factor-details observed-details"><summary>詳細分析を見る</summary><dl class="observed-input-summary">${pair('推定ブドウ確率',estimated?grape(result.estimatedGrape):'未使用')}${pair('推定ブドウ個数',number(result.estimatedGrapeCount))}${pair('既存逆算範囲（個数）',Number.isFinite(result.grapeCountLo)&&Number.isFinite(result.grapeCountHi)?`${number(result.grapeCountLo)}〜${number(result.grapeCountHi)}`:'未使用')}</dl></details>
 </section>`;
}
function result(result,{debug=false}={}){
 const x=result.input;
 return `<section class="observed-result" data-observed-result>
 <section class="panel"><h2>${esc(result.machineName)}${x.tableNo?` · 台${esc(x.tableNo)}`:''}</h2>${summary(result)}<p class="observed-help">分布集中度は、設定確率がどれだけ一部の設定へ集中しているかを表す指標で、判別の的中率ではありません。</p>${result.warnings.map(w=>`<p class="observed-error" role="alert">${result.reverseWarn?'逆算警告：':''}${esc(w)}</p>`).join('')}</section>
 <section class="panel"><h2>設定1〜6の確率</h2><div class="observed-distribution">${result.q.map((p,i)=>`<div class="observed-probability"><span>設定${i+1}</span><div class="observed-bar-track" aria-hidden="true"><div class="observed-bar" style="width:${p*100}%"></div></div><strong>${percent(p)}</strong></div>`).join('')}</div><p class="observed-help">すべての棒は0〜100%の共通スケールです。</p></section>
 ${factorPanel(result)}
 ${debug===true?developerInfo(result):''}
 </section>`;
}
global.JUGESTJudgementView=Object.freeze({fields,parallelEditor,parallelResults,summary,result,equivalentSetting,factorPanel});
})(typeof globalThis!=='undefined'?globalThis:this);
