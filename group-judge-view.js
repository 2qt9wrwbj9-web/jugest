(function(global){
'use strict';
// Pure display: consumes the captured report, never calls a judgement engine.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(value,digits=2)=>Number.isFinite(value)?value.toLocaleString('ja-JP',{maximumFractionDigits:digits}):'—';
const percent=value=>Number.isFinite(value)?`${(value*100).toFixed(1)}%`:'—';
const pair=(label,value)=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
function rowLabels(report,rowNumbers={}){
 const targets=new Map((report.hypotheses[0]?.refutation?.rows||[]).map((row,i)=>[String(row.id),i+1]));
 return row=>{
  const id=String(row?.id),ordinal=Object.prototype.hasOwnProperty.call(rowNumbers||{},id)?rowNumbers[id]:undefined;
  const fallback=Number.isSafeInteger(ordinal)&&ordinal>0?`台番なし（${ordinal}行目）`:targets.has(id)?`台番なし（対象${targets.get(id)}台目）`:'台番なし';
  const value=String(row?.tableNo||fallback);return value.length>40?value.slice(0,39)+'…':value;
 };
}
const colors=['#c6d0fa','#a8b9fa','#8ba0f6','#6f89f2','#5271eb','#3657dd'];
function evidence(logRatio){
 if(logRatio===Infinity)return '比較側の支持なし';
 if(logRatio===-Infinity)return 'この仮説の支持なし';
 if(!Number.isFinite(logRatio))return '算出不可';
 const exponent=logRatio/Math.LN10;
 return Math.abs(exponent)>=3?`約10^${number(exponent,2)}倍`:`${number(Math.exp(logRatio),3)}倍`;
}
function evidenceMeaning(logRatio){return logRatio>0?'この仮説の方がデータに合う':logRatio<0?'比較側の方がデータに合う':'両側の適合は同じ';}
function tinyP(logP){
 if(logP===-Infinity)return '計算上の下限未満';
 if(!Number.isFinite(logP)||logP>0)return '算出不可';
 if(logP===0)return '1';
 return logP<Math.log(.001)?`約10^${number(logP/Math.LN10,2)}`:number(Math.exp(logP),4);
}
function distribution(q){
 const data=Array.from({length:6},(_,i)=>q?.[i]);
 const label=data.map((p,i)=>`設定${i+1} ${percent(p)}`).join('、');
 return `<div class="observed-group-band" role="img" aria-label="${esc(label)}">${data.map((p,i)=>`<span style="width:${Number.isFinite(p)?Math.max(0,Math.min(100,p*100)):0}%;background:${colors[i]}"></span>`).join('')}</div><div class="observed-group-q">${data.map((p,i)=>`<span>設定${i+1}<b>${percent(p)}</b></span>`).join('')}</div>`;
}
function allocationLabel(profile){
 const counts=profile.counts||[];
 if(counts.reduce((a,n)=>a+n,0)<=12)return profile.label||counts.map((n,i)=>String(i+1).repeat(n)).join('');
 return counts.flatMap((n,i)=>n>0?[`設定${i+1} ${number(n,0)}台`]:[]).join(' · ');
}
function conditional(h,rowLabel){
 const c=h.conditional;
 if(!c?.available)return `<p class="observed-error" role="status">${esc(c?.reason||'この仮説での配分を推定できません。')}</p>`;
 const profileList=profiles=>`<ol class="observed-group-allocations">${profiles.map(profile=>`<li data-observed-count-profile><b>${esc(allocationLabel(profile))}</b><span>${percent(profile.probability)}</span></li>`).join('')}</ol>`;
 return `<p class="observed-group-assumption">仮説成立時・等重みの条件付き推定</p><p class="observed-help">この仮説が正しいと仮定した設定配分です。全台系の成立確率ではありません。</p>
  <dl class="observed-group-counts">${h.allowed.map(s=>pair(`設定${s}の期待台数`,`${number(c.expectedCounts[s-1])}台`)).join('')}</dl>
  ${profileList(c.topAllocations.slice(0,3))}${c.topAllocations.length>3?`<details class="observed-group-details"><summary>配分候補をさらに見る（上位8候補）</summary>${profileList(c.topAllocations.slice(3,8))}</details>`:''}
  <details class="observed-group-details"><summary>各台の条件付き確率・最有力の台別割当て</summary><p class="observed-help">台別の最有力割当ては、上の無順序配分で最も確率が高い候補と異なる場合があります。</p>
   ${c.rows.map(row=>{const assignment=c.mapAssignment.find(x=>x.id===row.id);return `<div class="observed-group-conditional-row"><b>${esc(rowLabel(row))}</b><span>期待設定 ${number(row.expectedSetting)} · 最有力 設定${number(assignment?.setting,0)}</span>${distribution(row.q)}</div>`;}).join('')}
  </details>`;
}
function sensitivity(h){
 return `<details class="observed-group-details"><summary>根拠比の重み感度</summary><p class="observed-help">設定の配分重みを変えた比較です。店舗の実績から得た頻度や、全台系を使う頻度ではありません。</p>${(h.sensitivity||[]).map(s=>`<div class="observed-group-sensitivity"><b>${esc(s.label)}</b><span>既存モデル ${esc(evidence(s.logEvidenceRatio))}</span><span>ボーナスだけ ${esc(evidence(s.bonusLogEvidenceRatio))}</span></div>`).join('')}</details>`;
}
function refutation(h,rowLabel){
 const r=h.refutation;
 return `<details class="observed-group-details"><summary>ボーナスの下振れ検査・前提</summary><dl class="observed-input-summary">${pair('3仮説も考慮したp値',tinyP(r.logFamilyP))}${pair('最も下振れした台',rowLabel(r.weakestRow))}${pair('台数補正後のp値',tinyP(r.logP))}${pair('最も整合しない台のログ差',number(-h.worstRow.logCompatibility,3))}</dl>
 <p class="observed-help">BB・RB・合算の下側累積確率を設定ごとに調べ、3項目の補正後、許容設定の中で最も保守的な値を使います。全台数と画面の3仮説も補正し、p値が0.05未満なら「反証あり」です。</p>
 <p class="observed-help">p値は成立確率ではありません。「この検査では反証なし」は全台系の証明ではありません。停止時刻と対象台を事前に決めた試行が前提で、結果を見て選んだ集合や途中終了では解釈に限界があります。根拠比と同じデータを使うため、独立した追加証拠として合成しません。</p>
 ${(r.rows||[]).map(row=>`<div class="observed-group-p-row"><b>${esc(rowLabel(row))}</b><span>下振れp値 ${esc(tinyP(row.logP))}</span></div>`).join('')}
 </details>`;
}
function sameSetting(report){
 const reference=report.aggregateJudgement;
 return `<details class="observed-group-details"><summary>全台が同じ設定だった場合の合算参考</summary><p class="observed-help">合計G・BB・RBだけの参考判別です。同じ設定と仮定しています。全456などの評価や、各台に加える追加証拠には使いません。差枚は合算逆算しません。</p>${reference?.available?`<dl class="observed-input-summary">${pair('期待設定',number(reference.expectedSetting))}${pair('設定4以上（P4+）',percent(reference.p4))}${pair('設定5以上（P5+）',percent(reference.p5))}${pair('設定6（P6）',percent(reference.p6))}</dl>${distribution(reference.q)}`:`<p class="observed-help">${esc(reference?.reason||'参考判別を表示できません。')}</p>`}</details>`;
}
function render(report,{hypothesis='all456',rowNumbers}={}){
 if(!report)return '';
 if(!report.ok)return `<section class="panel observed-group-report" data-observed-group-report aria-label="全台系判別"><h2>全台系の入力を確認</h2><div class="observed-error" role="alert">${(report.errors||['判別できませんでした。']).map(error=>`<p>${esc(error)}</p>`).join('')}</div><p class="observed-help">入力した台をすべて個別判別してから、2〜60台の集合として比較します。</p></section>`;
 const a=report.aggregate,h=report.hypotheses.find(x=>x.id===hypothesis)||report.hypotheses[0];
 const rowLabel=rowLabels(report,rowNumbers);
 const low=(report.warnings||[]).find(w=>w.startsWith('2000G未満の台が'))?.match(/台が(\d+)\//)?.[1];
 const reverse=(report.warnings||[]).filter(w=>w.startsWith('台')&&w.includes('：差枚の逆算に警告があります。')).length;
 const severe=[...(low?[`2000G未満 ${low}/${report.n}台：小稼働では区別が難しくなります。`]:[]),...(a.mixedMachines?['機種が混在しています。合算確率は観測の参考値です。']:[]),...(reverse?[`差枚の逆算に警告 ${reverse}台。各台の入力を確認してください。`]:[])];
 const diff=a.diffN===report.n?`全${report.n}台の差枚合計 ${a.diff>=0?'+':''}${number(a.diff,0)}枚`:`差枚：入力済み${a.diffN}/${report.n}台の合計 ${a.knownDiff>=0?'+':''}${number(a.knownDiff,0)}枚（未入力は補完しません）`;
 return `<section class="panel observed-group-report" data-observed-group-report aria-label="全台系判別">
 <h2>全台系を集合で比較 <small>${report.n}台</small></h2><dl class="observed-group-totals">${pair('合計G',number(a.games,0))}${pair('BB',number(a.bb,0))}${pair('RB',number(a.rb,0))}${pair('BB確率',a.bbDenom?`1/${number(a.bbDenom)}`:'0回')}${pair('RB確率',a.rbDenom?`1/${number(a.rbDenom)}`:'0回')}${pair('合算',a.combinedDenom?`1/${number(a.combinedDenom)}`:'0回')}</dl><p class="observed-group-diff">${esc(diff)}</p>
 <p class="observed-help">1倍超なら仮説側、1倍未満なら比較側に合います。等重みでの根拠比は、全台系の成立確率ではありません。</p>
 <div class="observed-group-hypotheses">${report.hypotheses.map(item=>`<article class="observed-group-hypothesis"><h3>${esc(item.label)} <span class="${item.refutation.logFamilyP<Math.log(.05)?'observed-error':'observed-group-status'}">${item.refutation.logFamilyP<Math.log(.05)?'ボーナスの下振れから反証あり':'この検査では反証なし'}</span></h3><p class="observed-group-complement">比較側：${esc(item.complementLabel)}</p><dl class="observed-group-evidence">${pair('既存モデルの根拠比',evidence(item.logEvidenceRatio))}${pair('ボーナスだけの根拠比',evidence(item.bonusLogEvidenceRatio))}</dl><p class="observed-group-meaning">${esc(evidenceMeaning(item.logEvidenceRatio))} · 最も整合しない台 <b>${esc(rowLabel(item.worstRow))}</b></p></article>`).join('')}</div>
 <p class="observed-help">差枚を含むモデルは近似です。「反証なし」は全台系の証明ではありません。</p>
 <details class="observed-group-details"><summary>根拠比の見方・比較の前提</summary><p class="observed-help">根拠比は、各仮説と、その比較側である「少なくとも1台が許容設定の外」のデータへの適合を比べる倍率です。設定1〜6を等重みとし、各仮説の許容集合で重みを正規化します。店舗が全台系を使う事前頻度は採用していません。</p><p class="observed-help">既存モデルとボーナスだけの比は同じ観測の別計算です。独立証拠として掛け合わせません。全6 ⊂ 全56 ⊂ 全456なので、3仮説は足して100%になる分類ではありません。</p></details>
 ${severe.length?`<div class="observed-group-warnings" role="status">${severe.map(w=>`<p>${esc(w)}</p>`).join('')}</div>`:''}
 <div class="observed-group-allocation-head"><h3>仮説を置いた設定配分</h3><label>配分を見る仮説<select data-observed-allocation aria-label="配分を見る仮説">${report.hypotheses.map(item=>`<option value="${esc(item.id)}" ${h.id===item.id?'selected':''}>${esc(item.label)}</option>`).join('')}</select></label></div>
 ${conditional(h,rowLabel)}${sensitivity(h)}${refutation(h,rowLabel)}${sameSetting(report)}
 <details class="observed-group-details"><summary>注意点を確認</summary>${(report.warnings||[]).map(w=>`<p class="observed-help">${esc(w)}</p>`).join('')}</details>
 </section>`;
}
global.JUGESTGroupJudgeView=Object.freeze({render});
})(typeof globalThis!=='undefined'?globalThis:this);
