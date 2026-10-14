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
const reverseWarningSuffix='：差枚の逆算に警告があります。通常G・BB・RB・差枚の組み合わせを確認してください。';
function warningTexts(report,rowLabel){
 let index=0;
 return (report.warnings||[]).map(text=>{
  if(!text.startsWith('台')||!text.endsWith(reverseWarningSuffix))return text;
  const row=report.reverseWarningRows?.[index++];
  // Old captured reports have no unambiguous identity metadata. Never guess
  // from their text: an internal id may equal a different real table number.
  if(!row)return '差枚の逆算に警告があります。通常G・BB・RB・差枚の組み合わせを各台の詳細で確認してください。';
  return `${row.tableNo?`台${rowLabel(row)}`:rowLabel(row)}${reverseWarningSuffix}`;
 });
}
const colors=['#c6d0fa','#a8b9fa','#8ba0f6','#6f89f2','#5271eb','#3657dd'];
function evidence(logRatio){
 if(logRatio===Infinity)return '比較側の支持なし';
 if(logRatio===-Infinity)return 'この仮説の支持なし';
 if(!Number.isFinite(logRatio))return '算出不可';
 const exponent=logRatio/Math.LN10;
 return Math.abs(exponent)>=3?`約10^${number(exponent,2)}倍`:`${number(Math.exp(logRatio),3)}倍`;
}
function evidenceMeaning(logRatio){return logRatio>0?'全台系の方が自然':logRatio<0?'全台系ではない方が自然':'どちらも同じくらい';}
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
 return `<p class="observed-help">「${esc(h.label)}」だった場合の組み合わせ。全台系になる確率ではありません。</p>
  ${profileList(c.topAllocations.slice(0,3))}${c.topAllocations.length>3?`<details class="observed-group-details"><summary>ほかの組み合わせ</summary>${profileList(c.topAllocations.slice(3,8))}</details>`:''}
  <details class="observed-group-details"><summary>台ごとの設定予想</summary>
   ${c.rows.map(row=>{const assignment=c.mapAssignment.find(x=>x.id===row.id);return `<div class="observed-group-conditional-row"><b>${esc(rowLabel(row))}</b><span>期待設定 ${number(row.expectedSetting)} · 最有力 設定${number(assignment?.setting,0)}</span>${distribution(row.q)}</div>`;}).join('')}
  </details>`;
}
function sensitivity(h){
 return `<details class="observed-group-details"><summary>条件を変えて比べた結果</summary><p class="observed-help">設定の割合を変えて比べた参考結果です。</p>${(h.sensitivity||[]).map(s=>`<div class="observed-group-sensitivity"><b>${esc(s.label)}</b><span>既存モデル ${esc(evidence(s.logEvidenceRatio))}</span><span>ボーナスだけ ${esc(evidence(s.bonusLogEvidenceRatio))}</span></div>`).join('')}</details>`;
}
function refutation(h,rowLabel){
 const r=h.refutation;
 return `<details class="observed-group-details"><summary>ボーナス回数の確認</summary><dl class="observed-input-summary">${pair('3仮説も考慮したp値',tinyP(r.logFamilyP))}${pair('最も下振れした台',rowLabel(r.weakestRow))}${pair('台数補正後のp値',tinyP(r.logP))}${pair('全台系に合わない台のログ差',number(-h.worstRow.logCompatibility,3))}</dl>
 <p class="observed-help">この数字が0.05未満だと、ボーナス回数が少なすぎると判定します。全台系になる確率ではありません。</p>
 ${(r.rows||[]).map(row=>`<div class="observed-group-p-row"><b>${esc(rowLabel(row))}</b><span>下振れp値 ${esc(tinyP(row.logP))}</span></div>`).join('')}
 </details>`;
}
function sameSetting(report){
 const reference=report.aggregateJudgement;
 const familyNote=report.aggregate?.mixedMachines&&reference?.available?'<p class="observed-help">Ⅴ/VIが混在する場合は、全設定のBB・RB表が一致することを確認して参考値を算出します。各台の全台系評価へ追加する証拠にはしません。</p>':'';
 return `<details class="observed-group-details"><summary>全台同じ設定として合算（参考）</summary><p class="observed-help">全台同じ設定だった場合の参考結果です。全台系の判定には使っていません。</p>${familyNote}${reference?.available?`<dl class="observed-input-summary">${pair('期待設定',number(reference.expectedSetting))}${pair('設定4以上（P4+）',percent(reference.p4))}${pair('設定5以上（P5+）',percent(reference.p5))}${pair('設定6（P6）',percent(reference.p6))}</dl>${distribution(reference.q)}`:`<p class="observed-help">${esc(reference?.reason||'参考判別を表示できません。')}</p>`}</details>`;
}
function render(report,{hypothesis='all456',rowNumbers}={}){
 if(!report)return '';
 if(!report.ok)return `<section class="panel observed-group-report" data-observed-group-report aria-label="全台系判別"><h2>全台系の入力を確認</h2><div class="observed-error" role="alert">${(report.errors||['判別できませんでした。']).map(error=>`<p>${esc(error)}</p>`).join('')}</div><p class="observed-help">入力した台をすべて個別判別してから、2〜60台の集合として比較します。</p></section>`;
 const a=report.aggregate,h=report.hypotheses.find(x=>x.id===hypothesis)||report.hypotheses[0];
 const rowLabel=rowLabels(report,rowNumbers),warnings=warningTexts(report,rowLabel);
 const low=(report.warnings||[]).find(w=>w.startsWith('2000G未満の台が'))?.match(/台が(\d+)\//)?.[1];
 const reverse=(report.warnings||[]).filter(w=>w.startsWith('台')&&w.includes('：差枚の逆算に警告があります。')).length;
 const severe=[...(low?[`2000G未満 ${low}/${report.n}台：小稼働では区別が難しくなります。`]:[]),...(a.mixedMachines?['機種が混在しています。合算確率は観測の参考値です。']:[]),...(reverse?[`差枚の逆算に警告 ${reverse}台。各台の入力を確認してください。`]:[])];
 const diff=a.diffN===report.n?`全${report.n}台の差枚合計 ${a.diff>=0?'+':''}${number(a.diff,0)}枚`:`差枚：入力済み${a.diffN}/${report.n}台の合計 ${a.knownDiff>=0?'+':''}${number(a.knownDiff,0)}枚（未入力は補完しません）`;
 return `<section class="panel observed-group-report" data-observed-group-report aria-label="全台系判別">
 <h2>全台系の判定 <small>${report.n}台</small></h2><dl class="observed-group-totals">${pair('合計G',number(a.games,0))}${pair('BB',number(a.bb,0))}${pair('RB',number(a.rb,0))}${pair('BB確率',a.bbDenom?`1/${number(a.bbDenom)}`:'0回')}${pair('RB確率',a.rbDenom?`1/${number(a.rbDenom)}`:'0回')}${pair('合算',a.combinedDenom?`1/${number(a.combinedDenom)}`:'0回')}</dl><p class="observed-group-diff">${esc(diff)}</p>
 <p class="observed-help">1倍未満なら全台系ではない方が有利。倍率は全台系になる確率ではありません。</p>
 <div class="observed-group-hypotheses">${report.hypotheses.map(item=>`<article class="observed-group-hypothesis"><h3>${esc(item.label)} <span class="${item.refutation.logFamilyP<Math.log(.05)?'observed-error':'observed-group-status'}">${item.refutation.logFamilyP<Math.log(.05)?'ボーナス回数も厳しい':''}</span></h3><p class="observed-group-complement">比べる相手：${item.id==='all456'?'設定1〜3の台が混じる場合':item.id==='all56'?'設定1〜4の台が混じる場合':'設定6以外の台が混じる場合'}</p><dl class="observed-group-evidence">${pair('全データで比べる',evidence(item.logEvidenceRatio))}${Math.abs(item.logEvidenceRatio-item.bonusLogEvidenceRatio)>1e-8?pair('ボーナスだけで比べる',evidence(item.bonusLogEvidenceRatio)):''}</dl><p class="observed-group-meaning">${esc(evidenceMeaning(item.logEvidenceRatio))} · 全台系に合わない台 <b>${esc(rowLabel(item.worstRow))}</b></p></article>`).join('')}</div>
 

 ${severe.length?`<div class="observed-group-warnings" role="status">${severe.map(w=>`<p>${esc(w)}</p>`).join('')}</div>`:''}
 <div class="observed-group-allocation-head"><h3>設定の組み合わせ（仮定）</h3><label>どの場合を見る？<select data-observed-allocation aria-label="どの場合を見る？">${report.hypotheses.map(item=>`<option value="${esc(item.id)}" ${h.id===item.id?'selected':''}>${esc(item.label)}</option>`).join('')}</select></label></div>
 ${conditional(h,rowLabel)}<details class="observed-group-details"><summary>詳しい数字</summary>${sensitivity(h)}${refutation(h,rowLabel)}${sameSetting(report)}</details>
 <details class="observed-group-details"><summary>入力についての注意</summary>${warnings.map(w=>`<p class="observed-help">${esc(w)}</p>`).join('')}</details>
 </section>`;
}
global.JUGESTGroupJudgeView=Object.freeze({render});
})(typeof globalThis!=='undefined'?globalThis:this);
