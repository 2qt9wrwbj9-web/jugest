export const MASK='••••••••••••••••';
const RECEIVER_STORAGE_KEY='jugglerRelayReceiver:v1';

export function normalizeConnectionInfo(value={}){
  return {
    channelId:String(value?.channelId||'').trim(),
    receiverToken:String(value?.receiverToken||'').trim()
  };
}

export function tokenFieldValue(info,visible=false){
  const normalized=normalizeConnectionInfo(info);
  return visible&&normalized.receiverToken?normalized.receiverToken:MASK;
}

let app=null;
let root=null;
let observer=null;
let tokenVisible=false;
let assistantKeyValue='';
let assistantKeyActive=false;
let assistantKeyBusy=false;
let assistantKeyStatusKnown=false;
let assistantKeyStatusPromise=null;
let assistantKeyStatusError='';
let statusTimer=null;

function bridge(){return globalThis.JUGEST_CORE_BRIDGE||null}
function storedInfo(includeSecret=false){
  try{
    const value=JSON.parse(globalThis.localStorage?.getItem?.(RECEIVER_STORAGE_KEY)||'null');
    if(!value?.linked)return normalizeConnectionInfo();
    return normalizeConnectionInfo({channelId:value.channelId,receiverToken:includeSecret?value.receiverToken:''});
  }catch{return normalizeConnectionInfo()}
}
function publicInfo(){
  const info=normalizeConnectionInfo(bridge()?.getCollectorConnectionInfo?.(false)||{});
  return info.channelId?info:storedInfo(false);
}
function secretInfo(){
  const info=normalizeConnectionInfo(bridge()?.getCollectorConnectionInfo?.(true)||{});
  return info.channelId&&info.receiverToken?info:storedInfo(true);
}

function setStatus(card,message){
  const status=card?.querySelector?.('[data-chatgpt-credential-status]');
  if(!status)return;
  status.textContent=String(message||'');
  globalThis.clearTimeout?.(statusTimer);
  if(message)statusTimer=globalThis.setTimeout?.(()=>{if(status.isConnected)status.textContent=''},1800);
}

async function copyText(card,value,label){
  value=String(value||'');
  if(!value){setStatus(card,`${label}が見つからないよ`);return}
  try{
    if(typeof globalThis.navigator?.clipboard?.writeText!=='function')throw new Error('clipboard unavailable');
    await globalThis.navigator.clipboard.writeText(value);
    setStatus(card,`${label}をコピーしたよ`);
  }catch(_error){
    globalThis.prompt?.(`${label}をコピーしてね`,value);
  }
}

async function assistantKeyRequest(method='GET'){
  const info=secretInfo();if(!info.channelId||!info.receiverToken)throw new Error('Receiver tokenが見つからないよ');
  const response=await globalThis.fetch('/api/vps/assistant-key',{
    method,
    headers:{accept:'application/json','x-jugest-channel-id':info.channelId,authorization:`Bearer ${info.receiverToken}`},
    cache:'no-store',credentials:'same-origin'
  });
  let payload=null;try{payload=await response.json()}catch{}
  if(!response.ok||payload?.ok!==true)throw new Error(`PRE参照鍵APIエラー (${payload?.code||response.status})`);
  return payload;
}
function renderAssistantKey(card){
  const field=card?.querySelector?.('[data-chatgpt-assistant-key]');
  const issue=card?.querySelector?.('[data-chatgpt-issue-assistant-key]');
  const copy=card?.querySelector?.('[data-chatgpt-copy-assistant-key]');
  const revoke=card?.querySelector?.('[data-chatgpt-revoke-assistant-key]');
  if(field)field.textContent=assistantKeyValue||(assistantKeyStatusKnown?(assistantKeyStatusError?'状態確認に失敗':(assistantKeyActive?'発行済み（平文は再表示しません）':'未発行')):'状態確認中…');
  if(issue){issue.textContent=assistantKeyActive?'PRE参照鍵を再発行':'PRE参照鍵を発行';issue.disabled=assistantKeyBusy}
  if(copy)copy.disabled=assistantKeyBusy||!assistantKeyValue;
  if(revoke)revoke.disabled=assistantKeyBusy||!assistantKeyActive;
}
async function refreshAssistantKeyStatus(card){
  if(assistantKeyStatusKnown){renderAssistantKey(card);return}
  if(!assistantKeyStatusPromise){
    assistantKeyStatusPromise=(async()=>{
      try{const payload=await assistantKeyRequest('GET');assistantKeyActive=!!payload.active;assistantKeyStatusError=''}
      catch(error){assistantKeyStatusError=String(error?.message||error)}
      finally{assistantKeyStatusKnown=true}
    })();
  }
  await assistantKeyStatusPromise;
  renderAssistantKey(card);
  if(assistantKeyStatusError)setStatus(card,assistantKeyStatusError);
}
async function rotateAssistantKey(card){
  if(assistantKeyBusy)return;assistantKeyBusy=true;renderAssistantKey(card);
  try{
    const payload=await assistantKeyRequest('POST');assistantKeyValue=String(payload.key||'');assistantKeyActive=!!payload.active;assistantKeyStatusKnown=true;assistantKeyStatusError='';renderAssistantKey(card);
    setStatus(card,'PRE参照鍵を発行したよ。今表示されている鍵をコピーして使ってね');
  }catch(error){setStatus(card,String(error?.message||error))}
  finally{assistantKeyBusy=false;renderAssistantKey(card)}
}
async function revokeAssistantKey(card){
  if(assistantKeyBusy||!assistantKeyActive)return;
  if(globalThis.confirm&&!globalThis.confirm('PRE参照鍵を失効する？ この鍵を使った参照はすぐ止まるよ。'))return;
  assistantKeyBusy=true;renderAssistantKey(card);
  try{await assistantKeyRequest('DELETE');assistantKeyValue='';assistantKeyActive=false;assistantKeyStatusKnown=true;assistantKeyStatusError='';setStatus(card,'PRE参照鍵を失効したよ')}
  catch(error){setStatus(card,String(error?.message||error))}
  finally{assistantKeyBusy=false;renderAssistantKey(card)}
}

function makeReadonlyField(label,value,ariaLabel){
  const wrap=document.createElement('div');
  const small=document.createElement('small');small.textContent=label;
  const field=document.createElement('div');field.className='vps-settings-code';field.textContent=String(value||'');field.setAttribute('aria-label',ariaLabel);
  wrap.append(small,field);return {wrap,field};
}

function installStyle(){
  if(!root||root.querySelector('[data-chatgpt-credentials-style]'))return;
  const style=document.createElement('style');style.dataset.chatgptCredentialsStyle='';style.textContent=`
    .chatgpt-credentials-card .chatgpt-credentials-head{margin-bottom:14px}
    .chatgpt-credentials-card .chatgpt-credentials-head h2{margin-bottom:6px}
    .chatgpt-credentials-actions{grid-template-columns:1fr 1fr}
    .chatgpt-credentials-actions .wide{grid-column:1/-1}
    .chatgpt-assistant-note{margin:18px 0 8px;font-size:13px;line-height:1.55}
    .chatgpt-assistant-actions{grid-template-columns:1fr 1fr}
    .chatgpt-assistant-actions .wide{grid-column:1/-1}
    .chatgpt-credentials-status{display:block;min-height:1.4em;margin-top:8px;color:#315ec9;font-weight:700;font-size:13px}
    @media(max-width:420px){.chatgpt-credentials-actions{grid-template-columns:1fr}}
  `;root.append(style);
}

function ensureCard(){
  const overlay=root?.querySelector('.vps-settings-overlay');if(!overlay)return;
  const heading=overlay.querySelector('h1');if(!heading||heading.textContent?.trim()!=='Collector連携設定')return;
  if(overlay.querySelector('[data-chatgpt-credentials]'))return;
  const firstCard=overlay.querySelector('.vps-settings-card');if(!firstCard)return;
  const info=publicInfo();if(!info.channelId)return;

  tokenVisible=false;
  installStyle();
  const card=document.createElement('section');card.className='vps-settings-card chatgpt-credentials-card';card.dataset.chatgptCredentials='';
  const head=document.createElement('div');head.className='chatgpt-credentials-head';
  const title=document.createElement('h2');title.textContent='ChatGPT接続情報';
  const note=document.createElement('p');note.textContent='JUGEST PluginのOAuth接続で使う情報。Receiver tokenは必要な時だけ表示するよ。';
  head.append(title,note);card.append(head);

  const channel=makeReadonlyField('Channel ID',info.channelId,'ChatGPT接続用 Channel ID');channel.field.dataset.chatgptChannelId='';card.append(channel.wrap);
  const token=makeReadonlyField('Receiver token',MASK,'ChatGPT接続用 Receiver token');token.field.dataset.chatgptReceiverToken='';card.append(token.wrap);

  const actions=document.createElement('div');actions.className='vps-settings-actions chatgpt-credentials-actions';
  const copyChannel=document.createElement('button');copyChannel.type='button';copyChannel.dataset.chatgptCopyChannel='';copyChannel.textContent='Channel IDをコピー';
  const reveal=document.createElement('button');reveal.type='button';reveal.dataset.chatgptToggleToken='';reveal.textContent='Receiver tokenを表示';
  const copyToken=document.createElement('button');copyToken.type='button';copyToken.className='wide';copyToken.dataset.chatgptCopyToken='';copyToken.textContent='Receiver tokenをコピー';
  actions.append(copyChannel,reveal,copyToken);card.append(actions);

  const assistantNote=document.createElement('p');assistantNote.className='chatgpt-assistant-note';assistantNote.textContent='PRE・保存店舗データだけを読むChatGPT用の読み取り専用鍵。発行した平文はこの画面セッションでだけ表示するよ。';card.append(assistantNote);
  const assistant=makeReadonlyField('ChatGPT PRE参照鍵','状態確認中…','ChatGPT PRE参照専用 read-only key');assistant.field.dataset.chatgptAssistantKey='';card.append(assistant.wrap);
  const assistantActions=document.createElement('div');assistantActions.className='vps-settings-actions chatgpt-assistant-actions';
  const issueAssistant=document.createElement('button');issueAssistant.type='button';issueAssistant.dataset.chatgptIssueAssistantKey='';issueAssistant.textContent='PRE参照鍵を発行';
  const copyAssistant=document.createElement('button');copyAssistant.type='button';copyAssistant.dataset.chatgptCopyAssistantKey='';copyAssistant.textContent='PRE参照鍵をコピー';copyAssistant.disabled=true;
  const revokeAssistant=document.createElement('button');revokeAssistant.type='button';revokeAssistant.className='wide';revokeAssistant.dataset.chatgptRevokeAssistantKey='';revokeAssistant.textContent='PRE参照鍵を失効';revokeAssistant.disabled=true;
  assistantActions.append(issueAssistant,copyAssistant,revokeAssistant);card.append(assistantActions);
  const status=document.createElement('small');status.className='chatgpt-credentials-status';status.dataset.chatgptCredentialStatus='';status.setAttribute('role','status');card.append(status);

  firstCard.insertAdjacentElement?.('afterend',card) || firstCard.parentNode?.insertBefore(card,firstCard.nextSibling);
  refreshAssistantKeyStatus(card);
}

function setTokenVisibility(card,visible){
  tokenVisible=!!visible;
  const field=card?.querySelector?.('[data-chatgpt-receiver-token]');
  const button=card?.querySelector?.('[data-chatgpt-toggle-token]');
  if(!field||!button)return;
  if(tokenVisible){
    const info=secretInfo();field.textContent=tokenFieldValue(info,true);button.textContent='Receiver tokenを隠す';
  }else{
    field.textContent=MASK;button.textContent='Receiver tokenを表示';
  }
}

function onClick(event){
  const channelButton=event.target?.closest?.('[data-chatgpt-copy-channel]');
  const tokenButton=event.target?.closest?.('[data-chatgpt-copy-token]');
  const toggleButton=event.target?.closest?.('[data-chatgpt-toggle-token]');
  const issueAssistant=event.target?.closest?.('[data-chatgpt-issue-assistant-key]');
  const copyAssistant=event.target?.closest?.('[data-chatgpt-copy-assistant-key]');
  const revokeAssistant=event.target?.closest?.('[data-chatgpt-revoke-assistant-key]');
  if(!channelButton&&!tokenButton&&!toggleButton&&!issueAssistant&&!copyAssistant&&!revokeAssistant)return;
  event.preventDefault();event.stopPropagation();
  const card=event.target.closest('[data-chatgpt-credentials]');if(!card)return;
  if(channelButton){copyText(card,publicInfo().channelId,'Channel ID');return}
  if(tokenButton){copyText(card,secretInfo().receiverToken,'Receiver token');return}
  if(toggleButton){setTokenVisibility(card,!tokenVisible);return}
  if(issueAssistant){rotateAssistantKey(card);return}
  if(copyAssistant){copyText(card,assistantKeyValue,'PRE参照鍵');return}
  if(revokeAssistant)revokeAssistantKey(card);
}

function schedule(){(globalThis.requestAnimationFrame||globalThis.setTimeout)(ensureCard,0)}

function attach(candidate){
  if(app===candidate&&root===candidate?.shadowRoot)return true;
  observer?.disconnect();
  if(root)root.removeEventListener('click',onClick,true);
  app=candidate;root=candidate?.shadowRoot||null;if(!root)return false;
  root.addEventListener('click',onClick,true);
  observer=new MutationObserver(schedule);observer.observe(root,{childList:true,subtree:true});schedule();return true;
}

function boot(){const candidate=document.querySelector('jugest-app');if(attach(candidate))return;globalThis.setTimeout(boot,50)}
if(typeof document!=='undefined')boot();

export const __test={publicInfo,secretInfo,setTokenVisibility,storedInfo,refreshAssistantKeyStatus};
