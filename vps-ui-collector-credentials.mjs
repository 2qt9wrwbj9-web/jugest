export const MASK='••••••••••••••••';

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
function publicInfo(){return normalizeConnectionInfo(bridge()?.getCollectorConnectionInfo?.(false)||{})}
function secretInfo(){return normalizeConnectionInfo(bridge()?.getCollectorConnectionInfo?.(true)||{})}

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
  const wrap=document.createElement('label');wrap.className='sync-code-box';
  const small=document.createElement('small');small.textContent=label;
  const input=document.createElement('textarea');input.readOnly=true;input.rows=2;input.value=String(value||'');input.setAttribute('aria-label',ariaLabel);
  wrap.append(small,input);return {wrap,input};
}

function installStyle(){
  if(!root||root.querySelector('[data-chatgpt-credentials-style]'))return;
  const style=document.createElement('style');style.dataset.chatgptCredentialsStyle='';style.textContent=`
    .chatgpt-credentials-card{margin:18px 0;padding:16px;border:1px solid rgba(63,92,170,.18);border-radius:18px;background:rgba(245,248,255,.86)}
    .chatgpt-credentials-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
    .chatgpt-credentials-head b{font-size:16px}.chatgpt-credentials-head small{display:block;margin-top:4px;color:#667085;line-height:1.45}
    .chatgpt-credentials-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
    .chatgpt-credentials-actions .wide{grid-column:1/-1}
    .chatgpt-credentials-status{display:block;min-height:1.4em;margin-top:8px;color:#315ec9;font-weight:700;font-size:13px}
  `;root.append(style);
}

function ensureCard(){
  const screen=root?.querySelector('.workspace.data-screen');if(!screen)return;
  const heading=screen.querySelector('h1');if(!heading||heading.textContent?.trim()!=='自動取得')return;
  const setup=screen.querySelector('.sync-setup');if(!setup||setup.querySelector('[data-chatgpt-credentials]'))return;
  const info=publicInfo();if(!info.channelId)return;

  tokenVisible=false;
  installStyle();
  const card=document.createElement('section');card.className='chatgpt-credentials-card';card.dataset.chatgptCredentials='';
  const head=document.createElement('div');head.className='chatgpt-credentials-head';
  const title=document.createElement('div');
  const strong=document.createElement('b');strong.textContent='ChatGPT接続情報';
  const note=document.createElement('small');note.textContent='JUGEST PluginのOAuth接続で使う情報。Receiver tokenは必要な時だけ表示するよ。';
  title.append(strong,note);head.append(title);card.append(head);

  const channel=makeReadonlyField('Channel ID',info.channelId,'ChatGPT接続用 Channel ID');channel.input.dataset.chatgptChannelId='';card.append(channel.wrap);
  const token=makeReadonlyField('Receiver token',MASK,'ChatGPT接続用 Receiver token');token.input.dataset.chatgptReceiverToken='';card.append(token.wrap);

  const actions=document.createElement('div');actions.className='chatgpt-credentials-actions';
  const copyChannel=document.createElement('button');copyChannel.type='button';copyChannel.className='secondary-btn';copyChannel.dataset.chatgptCopyChannel='';copyChannel.textContent='Channel IDをコピー';
  const reveal=document.createElement('button');reveal.type='button';reveal.className='secondary-btn';reveal.dataset.chatgptToggleToken='';reveal.textContent='Receiver tokenを表示';
  const copyToken=document.createElement('button');copyToken.type='button';copyToken.className='secondary-btn wide';copyToken.dataset.chatgptCopyToken='';copyToken.textContent='Receiver tokenをコピー';
  actions.append(copyChannel,reveal,copyToken);card.append(actions);
  const status=document.createElement('small');status.className='chatgpt-credentials-status';status.dataset.chatgptCredentialStatus='';status.setAttribute('role','status');card.append(status);

  const unlink=setup.querySelector('[data-collector-unlink]');if(unlink)setup.insertBefore(card,unlink);else setup.append(card);
}

function setTokenVisibility(card,visible){
  tokenVisible=!!visible;
  const field=card?.querySelector?.('[data-chatgpt-receiver-token]');
  const button=card?.querySelector?.('[data-chatgpt-toggle-token]');
  if(!field||!button)return;
  if(tokenVisible){
    const info=secretInfo();field.value=tokenFieldValue(info,true);button.textContent='Receiver tokenを隠す';
  }else{
    field.value=MASK;button.textContent='Receiver tokenを表示';
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

export const __test={publicInfo,secretInfo,setTokenVisibility};
