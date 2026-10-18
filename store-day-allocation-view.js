(function(global){
'use strict';

const BANDS=Object.freeze({'456':'設定4以上','56':'設定5以上','6':'設定6'});
const REASONS=Object.freeze({
  missing_rows:'取得できていない台があります。全台の確認が必要です。',
  roster_unverified:'当日の設置台帳を確認できていません。',
  roster_partial:'当日の設置台帳が一部不足しています。',
  full_roster_unverified:'当日の全台一覧を確認できていません。',
  native_artifact_missing:'取得元の原本がありません。',
  native_artifact_repackaged:'端末からの再送データのため、取得元の原本を確認できていません。',
  native_format_unverified:'取得元の原本形式を確認できていません。',
  native_date_mismatch:'原本の営業日が指定日と一致していません。',
  native_store_mismatch:'原本の店舗を確認できていません。',
  native_source_unverified:'取得元を確認できていません。',
  raw_hash_mismatch:'保存された原本の内容が記録と一致していません。',
  raw_source_hash_missing:'原本を照合する記録が不足しています。',
  raw_artifact_unavailable:'保存された原本を読み取れません。',
  previous_native_artifact_unavailable:'前日の原本を確認できません。',
  pia_previous_snapshot_missing:'営業日を特定するための前日データが不足しています。',
  pia_history_invalid:'取得元の日別履歴を確認できません。',
  pia_day_ambiguous:'日別履歴から営業日を一意に特定できません。',
  pia_roster_membership_ambiguous:'当日の設置台帳に含まれる台を一意に確認できません。',
  pia_previous_snapshot_incomplete:'前日の一覧が不足しているため、当日の台帳を確認できません。',
  pia_removed_table_ambiguous:'入替または撤去された台の当日データを確認できません。',
  historical_roster_unverified:'当日の設置台帳を確認できていません。',
  ambiguous_machine_identity:'機種の識別が一意に定まりません。',
  missing_machine_identity:'原本の機種名が欠けています。',
  missing_table_id:'台番が欠けています。',
  missing_games:'通常Gが欠けています。',
  missing_bb:'BBが欠けています。',
  missing_rb:'RBが欠けています。',
  invalid_games:'通常Gの値に矛盾があります。',
  invalid_bb:'BBの値に矛盾があります。',
  invalid_rb:'RBの値に矛盾があります。',
  bonus_exceeds_games:'BBとRBの合計が通常Gを超えています。',
  inconsistent_zero_games:'0Gの行とボーナス・差枚の値が一致していません。',
  conflicting_duplicate:'同じ台番に異なる観測が記録されています。',
  canonical_row_missing:'台帳の台に対応する保存済みデータがありません。',
  native_observation_unverified:'原本から実測値を確認できません。',
  machine_identity_mismatch:'原本と保存データの機種が一致していません。',
  canonical_native_mismatch:'原本と保存データの観測値が一致していません。',
  invalid_canonical_row:'保存データに矛盾または欠損があります。',
  canonical_quality_not_valid:'保存データの品質確認が完了していません。',
  roster_mismatch:'当日の設置台帳と取得行が一致していません。',
  native_roster_truncated:'原本の一覧が取得上限に達し、全台を確認できていません。',
  native_rows_missing:'原本に台ごとの観測がありません。',
  pia_derivation_mismatch:'日別履歴と通常Gの換算結果が一致していません。',
  machine_size_limit:'設置台数が計算対象の上限を超えています。',
  roster_incomplete:'当日の全台を取得できていません。',
  diff_not_safe_integer:'差枚が整数として確認できないため、差枚なしで計算しました。',
  missing_observation:'実測値が不足しています。',
  unknown_games:'通常Gが不明の台があります。',
  estimated_games:'推定Gを含むため、全体の評価を保留しています。',
  duplicate_table:'台番が重複しています。',
  unsupported_machine:'対応する設定表がありません。',
  provenance_unverified:'元データとの一致を確認できていません。',
  machine_mismatch:'当日の機種を確認できていません。',
  invalid_observation:'観測値に矛盾または不足があります。',
  calculation_failed:'この機種の計算を完了できませんでした。',
  too_many_rows:'この台数は計算対象の範囲外です。'
});
function esc(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function number(value,digits=0){return typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('ja-JP',{maximumFractionDigits:digits}):'—'}
function logRatio(value){if(value===Infinity)return '上限超過';if(value===-Infinity)return '0倍';if(typeof value!=='number'||!Number.isFinite(value))return '未算出';if(Math.abs(value)<Math.log(10000))return `${number(Math.exp(value),2)}倍`;return `10の${number(value/Math.LN10,1)}乗倍`}
function bandOf(group,id){return group?.result?.bands?.find(b=>b.id===id)||null}
function eventOf(band,id){return Array.isArray(band?.events)?band.events.find(event=>event.id===id):band?.events?.[id]}
function reasonText(reason){if(typeof reason==='object'&&reason)return String(reason.message||REASONS[reason.code]||'入力データの確認が必要です。');return REASONS[reason]||(/[^\x00-\x7f]/.test(String(reason))?String(reason):'入力データの確認が必要です。')}
function reasons(group){return (group.reasons||[]).map(r=>`<li>${esc(reasonText(r))}</li>`).join('')}
function rowWarnings(row){const warnings=[...new Set([...(row.warnings||[]),...(row.diffIssue?[row.diffIssue]:[])])];return warnings.length?`<ul class="allocation-reasons">${warnings.map(warning=>`<li>${esc(reasonText(warning))}</li>`).join('')}</ul>`:''}
function coverage(group){return group.nInstalled==null?`${number(group.nObserved)}台確認 / 設置台数未確認`:`${number(group.nObserved)} / ${number(group.nInstalled)}台`}
function interval(value){return value&&Number.isFinite(value.lo)&&Number.isFinite(value.hi)?`${number(value.lo)}〜${number(value.hi)}台`:'未算出'}
function principalSensitivity(result,band,id){return (result?.sensitivity||[]).map(model=>{const event=eventOf(model.bands?.find(value=>value.id===band),id);return {...event,id:model.id}})}
function sensitivityStats(comparisons){const values=(comparisons||[]).filter(value=>typeof value.logBF==='number'&&!Number.isNaN(value.logBF));if(!values.length)return null;const logs=values.map(value=>value.logBF);return {values,lo:Math.min(...logs),hi:Math.max(...logs),changes:logs.some(value=>value>1e-10)&&logs.some(value=>value< -1e-10)}}
function eventLabel(event,comparisons=[]){if(sensitivityStats(comparisons)?.changes)return '仮定によって変わる';if(event&&typeof event.logBF==='number'&&Math.abs(event.logBF)<=1e-10)return '同程度・情報不足';return event&&typeof event.logBF==='number'&&event.logBF>0?'比較上の候補':'少数投入も残る'}
function sensitivityName(id){return ({'shared4-flat':'主モデル：共通傾向を含む配分','independent-flat':'各台の設定を独立に混合','mixed70-flat':'独立混合を多めにする','shared4-binomial-0.1':'少数投入を多めに見込む','shared4-beta-binomial-1-4':'少数投入を軸に幅を持たせる','shared4-low1':'低設定側を設定1中心にする','shared4-low3':'低設定側を設定3中心にする','high4-flat':'設定4のまとまりを多めにする','high6-flat':'設定6のまとまりを多めにする'})[id]||'宣言済みの固定仮定'}
function sensitivitySummary(comparisons,{selected=false}={}){
  const stats=sensitivityStats(comparisons);if(!stats)return '';
  return `<div ${selected?'data-allocation-selected-sensitivity':'data-allocation-sensitivity'}><p class="${stats.changes?'allocation-reference':'allocation-muted'}"><b>${stats.changes?'仮定によって変わる':'固定仮定での比較'}</b>：${stats.values.length}通りの固定仮定の根拠比の幅 ${logRatio(stats.lo)}〜${logRatio(stats.hi)}。${stats.changes?'どちら側を支持するかが、仮定によって反転しています。':'仮定ごとの根拠比の幅を併せて確認してください。'}</p>${selected?`<details class="allocation-assumptions"><summary>固定仮定ごとの根拠比を見る</summary><dl class="allocation-facts">${stats.values.map(value=>`<div><dt>${sensitivityName(value.id)}</dt><dd>${logRatio(value.logBF)}</dd></div>`).join('')}</dl><p class="allocation-muted">宣言済みの仮定を比べた診断です。比較する仮説数を追加したり、主計算の結果へ合成したりしません。</p></details>`:''}</div>`;
}
function sensitivityRangeLabel(comparisons){const stats=sensitivityStats(comparisons);return stats?`<small>根拠比の幅 ${logRatio(stats.lo)}〜${logRatio(stats.hi)}</small>`:''}
function evidenceMargin(group){if(!group.eligible)return -Infinity;let best=-Infinity;for(const band of group.result?.bands||[])for(const e of Object.values(band.events||{})){if(typeof e.logEValue==='number'&&typeof e.logThreshold==='number')best=Math.max(best,e.logEValue-e.logThreshold)}return best}
function sortedGroups(report,sort){return [...(report.groups||[])].sort((a,b)=>Number(!!b.eligible)-Number(!!a.eligible)||(sort==='name'?0:evidenceMargin(b)-evidenceMargin(a))||String(a.machineName||'').localeCompare(String(b.machineName||''),'ja'))}
function groupCard(group,band){
  const b=bandOf(group,band),usable=group.eligible&&b,allZero=group.nInstalled>0&&group.zeroGamesN===group.nInstalled;
  return `<article class="allocation-card ${usable?'':'allocation-held'}" data-allocation-card="${esc(group.machine)}"><div class="allocation-card-heading"><h2>${esc(group.machineName||'機種名未確認')}</h2><span>${coverage(group)}</span></div>${allZero?'<p class="allocation-reference">全台0Gのため情報不足です。台数分布は観測による絞り込みを示しません。</p>':''}${usable?`<p class="allocation-estimate"><b>${interval(b.interval)}</b><span>90%区間</span></p><p class="allocation-muted">仮定変更の範囲 ${interval(b.sensitivityRange)} · 期待台数 ${number(b.expected,1)}台</p><dl class="allocation-events">${[['all','全台'],['half','半分以上'],['third','1/3以上']].map(([key,label])=>`<div><dt>${label}</dt><dd>${allZero?'同程度・情報不足':eventLabel(eventOf(b,key),principalSensitivity(group.result,band,key))}</dd><small>${number(eventOf(b,key)?.count)}台以上</small>${sensitivityRangeLabel(principalSensitivity(group.result,band,key))}</div>`).join('')}</dl>`:'<p class="allocation-estimate"><b>全体推定を保留</b></p><p>全台確認待ち</p>'}${group.differenceReference?.available?'<p class="allocation-muted">差枚込み参考あり · 詳細で主計算との違いを確認できます。</p>':''}<p class="allocation-muted">未稼働 ${number(group.zeroGamesN)}台 · 低稼働 ${number(group.lowGamesN)}台 · 差枚あり ${number(group.diffN)}台</p>${group.reasons?.length?`<ul class="allocation-reasons">${reasons(group)}</ul>`:''}<button type="button" class="more-btn" data-allocation-action="machine" data-allocation-machine="${esc(group.machine)}">${usable?'台数候補と各台を見る':'保留の理由を見る'}</button></article>`;
}
function renderReport(report,{band='456',sort='evidence',filter=''}={}){
  if(!report)return '';
  const groups=report.groups||[],unsupported=report.unsupported||[],observed=groups.reduce((n,g)=>n+(Number.isFinite(g.nObserved)?g.nObserved:0),0),held=groups.filter(g=>!g.eligible).length;
  const stamp=report.snapshot?.observedAt||report.snapshot?.updatedAt||report.snapshot?.retrievedAt||'';
  const phase=report.snapshot?.status==='final'||report.snapshot?.phase==='final'?'終日データ':report.snapshot?.status==='interim'||report.snapshot?.phase==='interim'?'途中経過':'終日・途中の区分未確認';
  const visible=sortedGroups(report,sort).filter(g=>!filter||g.machine===filter);
  return `<div data-allocation-report><div class="allocation-context">${report.quality?.status==='partial'?'<span>店舗全体は一部未確認です。対応機種の結果と、未対応台の観測確認を区別しています。</span>':''}<b>${esc(report.store?.name||'店舗')} / ${esc(report.date)}</b><span>${phase}${stamp?` · 更新 ${esc(stamp)}`:''}</span><span>確認 ${number(observed)}台 · 保留 ${number(held)}機種 · 未対応 ${number(unsupported.length)}件</span></div><p class="allocation-reference">未校正の参考分析です。比較上の候補も、実店舗での的中率は未確認です。少数投入も残ることは、投入なしを意味しません。</p><div class="allocation-controls"><label><small>高設定の範囲</small><select data-allocation-band>${Object.entries(BANDS).map(([id,label])=>`<option value="${id}" ${id===band?'selected':''}>${label}</option>`).join('')}</select></label><label><small>並び順</small><select data-allocation-sort><option value="evidence" ${sort==='evidence'?'selected':''}>慎重な比較順</option><option value="name" ${sort==='name'?'selected':''}>機種名順</option></select></label><label><small>機種を絞る</small><select data-allocation-filter><option value="">全機種</option>${groups.map(g=>`<option value="${esc(g.machine)}" ${filter===g.machine?'selected':''}>${esc(g.machineName||'機種名未確認')}</option>`).join('')}</select></label></div><p class="allocation-scope">比較する仮説数 ${number(report.familySize)} · 店舗全体の比較範囲は絞り込み後も同じです。</p><p class="allocation-muted">${BANDS[band]||BANDS['456']}の台数推定。設置台数と取得行数を区別しています。</p><div class="allocation-cards">${visible.map(g=>groupCard(g,band)).join('')||'<p class="empty-card">表示できる機種がありません。</p>'}</div>${unsupported.length?`<section class="allocation-card allocation-held"><h2>未対応の機種・台</h2><p>対応する設定表がないため、投入状況は未評価です。</p><ul class="allocation-reasons">${unsupported.map(row=>`<li>${esc(row.machineName||row.name||'機種名未確認')}${row.tableNo!=null?` · 台番 ${esc(row.tableNo)}`:''}${row.nObserved!=null?` · ${number(row.nObserved)}台`:''}${row.reasons?.length?`<span class="allocation-muted"> · ${row.reasons.map(reason=>esc(reasonText(reason))).join(' / ')}</span>`:''}</li>`).join('')}</ul></section>`:''}</div>`;
}
function histogram(band){
  const values=band.distribution||[],n=Math.max(0,values.length-1),max=Math.max(...values,0.000001),bar=560/Math.max(1,values.length),boundaries=[...new Set([0,Math.ceil(n/3),Math.ceil(n/2),n])];
  return `<div class="allocation-histogram"><svg viewBox="0 0 600 190" role="img" aria-label="${esc(BANDS[band.id]||'高設定')}の台数分布。0から${n}台。90%区間は${esc(interval(band.interval))}"><line x1="24" y1="150" x2="584" y2="150" stroke="currentColor"/>${values.map((v,k)=>`<rect x="${24+k*bar+bar*.08}" y="${150-128*v/max}" width="${Math.max(.2,bar*.84)}" height="${128*v/max}" class="${k>=band.interval?.lo&&k<=band.interval?.hi?'allocation-bar':'allocation-bar-outside'}"><title>${k}台：仮定の下で${number(v*100,2)}%</title></rect>`).join('')}${boundaries.map(k=>`<text x="${24+(k+.5)*bar}" y="176" text-anchor="middle">${k}台</text>`).join('')}</svg><p class="allocation-muted">色の濃い範囲は主モデルの90%区間。半分は${Math.ceil(n/2)}台、1/3は${Math.ceil(n/3)}台です。台の選び方を全組合せで平均しています。</p></div>`;
}
function qDistribution(q,label){return `<div class="allocation-q"><b>${label}</b>${Array.isArray(q)&&q.length===6?`<dl>${q.map((p,i)=>`<div><dt>設定${i+1}</dt><dd>${number(p*100,1)}%</dd></div>`).join('')}</dl>`:'<p>分布を算出できていません。</p>'}</div>`}
function baselineName(id,index){const normalized=String(id||'').replace(/[^a-z]/gi,'').toLowerCase();if(/low/.test(normalized))return '低設定中心';if(/mid|middle/.test(normalized))return '中間中心';if(/high|few/.test(normalized))return '一部高設定';return ['低設定中心','中間中心','一部高設定'][index]||'宣言済み配分'}
function weightsText(weights,start=1){return Array.isArray(weights)?weights.map((weight,i)=>`設定${start+i} ${number(weight*100,2)}%`).join(' / '):'応答に含まれていません'}
function assumptions(result){
  const a=result?.assumptions;if(!a)return '<p>配分仮定の詳細は応答に含まれていません。</p>';
  return `<p>${a.countPrior==='flat'?`主モデルは設定4以上の投入台数0〜${number(result.n)}台を同じ重みで比較します。`:'台数の事前分布は宣言済みの固定モデルです。'}低設定側は設定1〜3、高設定側は設定4〜6です。</p><p>設定1〜3の重み：${weightsText(a.lowWeights)}。</p><p>高設定側は「各台で4・5・6を混合」「4に統一」「5に統一」「6に統一」の4通りを、${(a.mixtureWeights||[]).map(weight=>number(weight*100,2)+'%').join(' / ')}の重みで混合しています。</p><p>感度の比較は${number(a.sensitivityCount)}通りの固定仮定です。台数の事前分布、低設定側の配分、高設定側のまとまり方を変更して区間を比較します。同じデータに合う配分を学習していません。</p>`;
}
function differenceReference(group,band){
  const reference=group.differenceReference;if(!reference)return '';
  const primary=bandOf(group,band),alternative=bandOf({result:reference.result},band);
  if(!reference.available||!alternative)return `<section class="allocation-card" data-allocation-difference><h3>差枚込み参考を保留</h3><p>差枚確認 ${number(reference.diffN)} / ${number(group.nObserved)}台。差枚込み参考を算出できていません。${reference.reason==='no_observed_diff'?'実測の差枚がありません。':''}</p></section>`;
  const methodLabels={'reverse-diff':'差枚逆算','bonus-only':'ボーナスのみ','zero-games':'未稼働の中立行','neutral-zero':'未稼働の中立行','latent-games':'推定Gの参考'};
  const summary=(label,b)=>`<article><h4>${label}</h4><dl class="allocation-facts"><div><dt>90%区間</dt><dd>${interval(b?.interval)}</dd></div><div><dt>仮定変更の範囲</dt><dd>${interval(b?.sensitivityRange)}</dd></div><div><dt>期待台数 / 中央値</dt><dd>${number(b?.expected,1)}台 / ${number(b?.median)}台</dd></div></dl></article>`;
  return `<section class="allocation-card" data-allocation-difference><h3>主計算と差枚込み参考</h3><p>主計算はボーナスの観測です。差枚込みは従来の個別判別を使った近似参考で、実店舗での的中率・誤検出率は未確認です。2つの結果は足し合わせたり、掛け合わせたりしません。</p><p>差枚確認 ${number(reference.diffN)} / ${number(group.nObserved)}台 · 逆算使用 ${number(reference.reverseDiffN)}台 · 注意あり ${number(reference.warningN)}台</p><p class="allocation-muted">実際の計算経路：${Object.entries(reference.methodCounts||{}).map(([method,n])=>`${methodLabels[method]||'従来判別の計算経路'} ${number(n)}台`).join(' / ')||'未確認'}。差枚がない台や逆算を利用できなかった台は、ボーナスのみの計算が残ります。</p>${summary('主計算：ボーナス',primary)}${summary('差枚込み：近似参考',alternative)}<details class="allocation-baseline"><summary>差枚込み参考の仮説比較</summary>${[['all','全台'],['half','半分以上'],['third','1/3以上']].map(([id,label])=>{const event=eventOf(alternative,id);return `<h4>${label}（${number(event?.count)}台以上）</h4><p>反対側との根拠比 ${logRatio(event?.logBF)}</p><dl class="allocation-facts">${(event?.baselines||[]).map((base,i)=>`<div><dt>${baselineName(base.id,i)}</dt><dd>根拠比 ${logRatio(base.logBF)}</dd></div>`).join('')}</dl>`}).join('')}</details><p class="allocation-muted">差枚の近似を使った参考結果です。主計算の評価・並び順に合成していません。</p></section>`;
}
function renderDetail(report,{machine,band='456',kind='atLeast',count=0,detail=null,loading=false,error=''}={}){
  const group=report?.groups?.find(g=>g.machine===machine);if(!group)return '';
  const b=bandOf(group,band),selectedLabel=`${BANDS[band]||BANDS['456']}が${kind==='exact'?`ちょうど${number(count)}台`:`${number(count)}台以上`}`;
  const rowMap=new Map((detail?.rows||[]).map(r=>[String(r.id??r.tableNo),r]));
  const rows=group.rows||[];
  return `<section class="allocation-detail" data-allocation-detail><button class="back-row" type="button" data-allocation-action="back">‹ 機種一覧</button><h2>${esc(group.machineName||'機種名未確認')}</h2><p>${coverage(group)} · ${BANDS[band]||BANDS['456']}</p><p class="allocation-reference">未校正の参考分析です。区間と仮定変更の範囲を確認し、台数を断定しないでください。</p>${!group.eligible||!b?`<div class="allocation-card"><h3>全体推定を保留</h3><ul class="allocation-reasons">${reasons(group)}</ul></div>`:`<div class="allocation-card"><h3>推定の幅 ${interval(b.interval)}</h3><p>仮定変更の範囲 ${interval(b.sensitivityRange)}。期待台数 ${number(b.expected,1)}台・中央値 ${number(b.median)}台は、設定が判明した台数ではありません。</p><h3>台数分布</h3>${histogram(b)}</div><div class="allocation-card"><h3>台数の仮説を比較</h3><div class="allocation-controls"><label><small>高設定の範囲</small><select data-allocation-band>${Object.entries(BANDS).map(([id,label])=>`<option value="${id}" ${id===band?'selected':''}>${label}</option>`).join('')}</select></label><label><small>条件</small><select data-allocation-kind><option value="atLeast" ${kind==='atLeast'?'selected':''}>指定台数以上</option><option value="exact" ${kind==='exact'?'selected':''}>ちょうど指定台数</option></select></label><label><small>投入台数</small><select data-allocation-count>${Array.from({length:(group.result.n??rows.length)+(kind==='exact'?1:0)},(_,i)=>{const k=i+(kind==='exact'?0:1);return `<option value="${k}" ${k===count?'selected':''}>${k}台</option>`}).join('')}</select></label></div><p><b>${selectedLabel}</b></p>${loading?'<p role="status">この仮説の各台配分を計算中…</p>':error?`<p class="error-panel" role="alert">${esc(error)}</p>`:detail?`<dl class="allocation-facts"><div><dt>反対側との根拠比</dt><dd>${logRatio(detail.logBF)}</dd></div><div><dt>少数投入に有利な配置との慎重比較</dt><dd>${kind==='exact'?'固定台数の慎重比較は対象外':logRatio(detail.logEValue)}</dd></div></dl>${sensitivitySummary(detail.sensitivityComparisons,{selected:true})}`:'<p>仮説の詳細を取得できていません。</p>'}<p class="allocation-muted">根拠比は、この仮説と反対側の説明力の比です。成立確率ではありません。全台、半分以上、1/3以上と、ちょうど指定台数は別の条件です。</p></div><div class="allocation-card"><h3>通常配分との比較</h3>${[['all','全台'],['half','半分以上'],['third','1/3以上']].map(([id,label])=>{const e=eventOf(b,id);return `<details class="allocation-baseline"><summary>${label}（${number(e?.count)}台以上）</summary><p>反対側との根拠比 ${logRatio(e?.logBF)} · 慎重比較 ${logRatio(e?.logEValue)}</p><p>${e?.modelPass?'モデル内の比較基準は通過しています。実店舗では未校正です。':'少数投入も残ります。'}</p>${sensitivitySummary(principalSensitivity(group.result,band,id))}<dl class="allocation-facts">${(e?.baselines||[]).map((base,i)=>`<div><dt>${baselineName(base.id,i)}</dt><dd>根拠比 ${logRatio(base.logBF)}</dd><dd class="allocation-muted">設定1〜6の重み：${weightsText(base.weights)}</dd></div>`).join('')}</dl><p class="allocation-muted">基準配分を仮定した比較です。店舗の実際の配分を推定したものではありません。</p></details>`}).join('')}</div>`}${differenceReference(group,band)}<section class="allocation-card"><h3>各台の観測と設定分布</h3><p>通常の各台判別を保持し、選んだ仮説を仮定した配分を別に表示します。条件付き配分は、実際の設定が判明したことを意味しません。</p>${rows.map(row=>{const d=rowMap.get(String(row.id??row.tableNo)),input=row.input||row;return `<article class="allocation-row"><h4>台番 ${esc(row.tableNo??'未確認')}</h4><p class="allocation-observation">実測 ${number(input.games)}G · BB ${number(input.bb)} / RB ${number(input.rb)} · 差枚 ${input.diff==null?'不明':`${number(input.diff)}枚`}</p>${row.reasons?.length?`<ul class="allocation-reasons">${reasons(row)}</ul>`:''}${rowWarnings(row)}${qDistribution(d?.individual?.q||row.individual?.q,'通常の各台判別')}${qDistribution(!loading&&!error?d?.conditionalQ||d?.conditional:null,'仮説を仮定した配分')}<p class="allocation-muted">比較への影響（対数の差） ${number(d?.logBFInfluence,3)}。独立した追加の証拠ではありません。</p></article>`}).join('')||'<p>表示できる観測行がありません。</p>'}</section><details class="allocation-card allocation-assumptions"><summary>前提・データ版を確認</summary>${assumptions(group.result)}<p>主計算はボーナスの観測です。差枚の値を独立の証拠として重ねていません。台数の事前分布と群内の配分仮定に結果が依存します。低稼働・0Gの台の設定は分かりません。</p><p>当日台帳：${report.roster?.status==='verified'?'確認済み':report.roster?.status==='partial'?'一部のみ確認':'未確認'}。比較する仮説数 ${number(report.familySize)}。計算方法の版 ${esc(group.result?.version||report.version||'未確認')}。</p>${detail?`<p>選択仮説の事前確率（指定した仮定の下） ${number(detail.priorProbability*100,2)}%。これは店舗の投入頻度ではありません。</p>`:''}<p>未校正の参考分析です。実店舗での誤検出率・的中率の確認は完了していません。</p></details></section>`;
}
global.JUGESTStoreDayAllocationView=Object.freeze({renderReport,renderDetail});
})(typeof globalThis!=='undefined'?globalThis:window);
