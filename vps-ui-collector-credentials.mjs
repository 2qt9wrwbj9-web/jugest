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
  const status=document.createElement('small');status.className='chatgpt-credentials-status';status.dataset.chatgptCredentialStatus='';status.setAttribute('role','status');card.append(status);

  firstCard.insertAdjacentElement?.('afterend',card) || firstCard.parentNode?.insertBefore(card,firstCard.nextSibling);
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
  if(!channelButton&&!tokenButton&&!toggleButton)return;
  event.preventDefault();event.stopPropagation();
  const card=event.target.closest('[data-chatgpt-credentials]');if(!card)return;
  if(channelButton){copyText(card,publicInfo().channelId,'Channel ID');return}
  if(tokenButton){copyText(card,secretInfo().receiverToken,'Receiver token');return}
  if(toggleButton)setTokenVisibility(card,!tokenVisible);
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

export const __test={publicInfo,secretInfo,setTokenVisibility,storedInfo};
