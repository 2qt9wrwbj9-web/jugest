let app=null;
let root=null;
let observer=null;
let busy=false;

function bridge(){return globalThis.JUGEST_CORE_BRIDGE||null}
function escName(value){return String(value??'').trim()}
function todayLocal(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function storeRows(){const rows=bridge()?.getCollectorStores?.();return Array.isArray(rows)?rows:[]}
function resetButtons(){return root?[...root.querySelectorAll('[data-vps-store-reset]')]:[]}
function setBusy(value){busy=!!value;for(const button of resetButtons())button.disabled=busy}

function currentStoreName(row){
  return escName(row.querySelector('[data-store-edit]')?.dataset?.storeEdit||row.querySelector('[data-store-delete]')?.dataset?.storeDelete||row.querySelector('[data-store-master-delete]')?.dataset?.storeMasterName||'');
}

function ensureStoreResetButtons(){
  const screen=root?.querySelector('.workspace.data-screen');if(!screen)return;
  const heading=screen.querySelector('h1');if(!heading||heading.textContent?.trim()!=='店舗管理')return;
  for(const row of screen.querySelectorAll('.collector-row.manage-row')){
    const actions=row.querySelector('.manage-actions'),name=currentStoreName(row);if(!actions||!name||actions.querySelector('[data-vps-store-reset]'))continue;
    const button=document.createElement('button');button.type='button';button.className='danger-text';button.dataset.vpsStoreReset=name;button.textContent='今日から初期化';button.title='取得データ・予測・解析履歴とCollectorの過去取得状態を消して、今日から収集をやり直す';button.disabled=busy;actions.append(button);
  }
}

function schedule(){(globalThis.requestAnimationFrame||globalThis.setTimeout)(ensureStoreResetButtons,0)}

async function resetStoreFromToday(name){
  if(busy)return;
  const b=bridge();if(!b||typeof b.resetStoreAcquiredData!=='function')return globalThis.alert?.('初期化機能を読み込めなかったよ。ページを再読み込みしてね。');
  name=escName(name);if(!name)return;
  const row=storeRows().find(x=>escName(x?.name)===name)||null;
  const deletedSummary=[row?.externalDayCount?`取得データ ${row.externalDayCount}日`:null,row?.forecastCount?`予測 ${row.forecastCount}件`:null,row?.analysisCount?`解析履歴 ${row.analysisCount}件`:null].filter(Boolean).join(' / ')||'取得データ・予測・解析履歴';
  const first=`「${name}」を今日からやり直す？\n\n削除するもの：${deletedSummary}、Collectorの過去取得状態\n残すもの：稼働記録・店舗マスター・店舗設定\n\nCollectorの取得開始日は今日に変更するよ。`;
  if(!globalThis.confirm?.(first))return;
  if(!globalThis.confirm?.('この操作は取り消せないよ。本当に初期化する？'))return;
  setBusy(true);
  let collectorDeleted=false;
  const today=todayLocal();
  try{
    if(row?.registered&&row?.url){
      await b.deleteCollectorStore?.(name);collectorDeleted=true;
      await b.saveCollectorStore?.(name,{url:row.url,startDate:today,priority:Number(row.priority)||2});
      await b.setCollectorEnabled?.(name,!!row.enabled);
      collectorDeleted=false;
    }
    const result=await b.resetStoreAcquiredData(name);
    globalThis.alert?.(`「${name}」を今日からの状態に初期化したよ。\n取得データ ${Number(result?.deletedDays)||0}日 / 予測 ${Number(result?.deletedForecasts)||0}件 / 解析履歴 ${Number(result?.deletedAnalysis)||0}件を削除しました。`);
    globalThis.location?.reload?.();
  }catch(error){
    if(collectorDeleted&&row?.url){
      try{await b.saveCollectorStore?.(name,{url:row.url,startDate:row.startDate||today,priority:Number(row.priority)||2});await b.setCollectorEnabled?.(name,!!row.enabled)}catch(_e){}
    }
    globalThis.alert?.(`初期化に失敗しました：${String(error?.message||error)}\n\nデータ削除は再実行しても安全です。Collector設定が消えていた場合は「取得店舗を追加・管理」からURLを再登録してね。`);
  }finally{setBusy(false);schedule()}
}

function onClick(event){
  const button=event.target?.closest?.('[data-vps-store-reset]');if(!button)return;
  event.preventDefault();event.stopPropagation();resetStoreFromToday(button.dataset.vpsStoreReset||'');
}

function attach(candidate){
  if(app===candidate&&root===candidate?.shadowRoot)return true;
  observer?.disconnect();
  app=candidate;root=candidate?.shadowRoot||null;if(!root)return false;
  root.addEventListener('click',onClick,true);
  observer=new MutationObserver(schedule);observer.observe(root,{childList:true,subtree:true});schedule();return true;
}

function boot(){const candidate=document.querySelector('jugest-app');if(attach(candidate))return;globalThis.setTimeout(boot,50)}
boot();

export const __test={todayLocal,currentStoreName};
