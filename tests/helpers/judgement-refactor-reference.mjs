// Reference from deploy/vps ec1b92e32e7b5ae77ccd890d66cf07f16f8f9c3c.
// Only the old page renderers and empty-row predicate; no judgement math.
export function installLegacyJudgementPage(app,global){
 const reference={
  renderObservedSettingsButton(){return `<button type="button" class="icon-btn" data-vps-settings-gear data-observed-action="settings" aria-label="設定"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h-.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7.6Z"></path></svg></button>`},
  renderObservedSettings(){return `<section class="panel observed-display-settings"><h2>開発者向け</h2><label class="observed-debug-setting"><input type="checkbox" role="switch" data-observed-debug-toggle ${this.observed.debug?'checked':''}><span><b>高度なデバッグ情報を表示</b><small>判別エンジンの検証用情報を表示します。通常はOFFで問題ありません。</small></span></label></section>`},
  isObservedRowEmpty(row){return global.JUGESTJudgement.FIELDS.every(key=>String(row.input[key]??'').trim()==='')},
  renderObservedPage(){
    if(this.state.screen==='settings')return `<section class="workspace"><button type="button" class="back-row" data-observed-action="close-settings">‹ 判別へ戻る</button><h1>設定</h1>${this.renderObservedSettings()}</section>`;
    const view=global.JUGESTJudgementView,machines=this.bridge()?.getObservedJudgeMachines?.()||[];
    if(!view||!machines.length)return '<section class="workspace"><h1>判別</h1><p role="alert">判別コアを準備中です。</p></section>';
    if(!this.observed.single)this.observed.single=this.newObservedRow();
    const o=this.observed,selected=o.mode==='parallel'&&this.state.screen==='detail'?this.observedRow(o.selectedId):null;
    const controls=`<div class="segmented observed-modes" aria-label="判別モード">${[['single','単品判別'],['parallel','並列判別']].map(([mode,label])=>`<button type="button" data-observed-action="${mode}" aria-pressed="${o.mode===mode}" class="${o.mode===mode?'on':''}">${label}</button>`).join('')}</div>`;

    let body;
    if(selected?.result)body=`<div data-observed-detail><button type="button" class="back-row" data-observed-action="close-detail">‹ 並列一覧へ</button>${view.result(selected.result,{debug:o.debug})}</div>`;
    else if(o.mode==='parallel')body=`${view.parallelEditor(o.rows,machines)}<div class="observed-parallel-actions"><button type="button" data-observed-action="add">＋ 行を追加</button><button type="button" class="primary-btn" data-observed-action="judge-all">まとめて判別</button></div><p class="observed-help">空行は飛ばします。差枚は任意、BB・RBが0回なら0を入力。結果を見るだけで実戦は開始しません。</p>${view.parallelResults(o.rows)}`;
    else body=`${o.single.result?`<div data-observed-detail>${view.result(o.single.result,{debug:o.debug})}</div>`:'<p class="observed-help">差枚は任意です。BB・RBが0回の場合は0を入力してください。</p>'}<section class="panel observed-card" data-observed-card><h2>${o.single.result?'入力を変更':'台データを入力'}</h2>${view.fields(o.single,machines)}<button type="button" class="primary-btn" data-observed-action="judge" data-row-id="${o.single.id}">判別する</button></section>`;
    return `<section class="workspace observed-page"><div class="kicker">JUDGEMENT</div><h1>判別</h1><p class="lead">観測した台データから設定を分析・比較。</p>${controls}${body}</section>`;
  }
 };
 Object.assign(app,reference);
}
