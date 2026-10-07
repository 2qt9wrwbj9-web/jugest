import {renderAccessContent} from './access-components.mjs';
import {accessRequest,mountAccessUI} from './access-ui.mjs';

// UI role comes only from the authenticated server response, never localStorage.
let app=null,root=null,host=null,dispose=null,observer=null,state=null,unavailable=false;
let pending=null,generation=0,scheduled=false,checked=false;
function emit(active){globalThis.dispatchEvent(new CustomEvent('jugest:pia-access-changed',{detail:{active}}))}
function render(){
  if(!host?.isConnected)return;
  const role=!checked?'pending':unavailable?'unavailable':state?.kind==='admin'?'admin':state?.kind==='pia-viewer'?'pia':'access';
  if(host.dataset.role===role)return;
  dispose?.();dispose=null;host.dataset.role=role;
  const scope=host.shadowRoot;
  // The markup is a fixed shared template. All API labels/data use textContent.
  scope.innerHTML='<link rel="stylesheet" href="/access-ui.css"><style>:host{display:block;margin:20px 0;font:inherit;color:inherit}h1{font-size:21px}.card{margin:14px 0}button{max-width:100%}</style>'+
    (role==='pending'?'<h2>PIAデータ閲覧</h2><p>閲覧権限を確認しているよ。</p>':unavailable?'<h2>PIAデータ閲覧</h2><p>PIA共有アクセスはまだ有効化されていないよ。</p>':renderAccessContent(role))+
    (role==='access'?'<p><button id="settings-admin-login" type="button">管理者としてパスキーでログイン</button></p>':'')+
    '<p id="message" role="status" aria-live="polite"></p>';
  if(role==='pending'||unavailable)return;
  const update=()=>refreshStatus({force:true});
  dispose=mountAccessUI(scope,role,{poll:false,onRedeem:update,onLogin:update,onLogout:update,onAccessLost:update,onAdmin:update});
}
async function refreshStatus({force=false}={}){
  if(pending&&!force)return pending;
  const current=++generation;
  const work=accessRequest('/api/access/viewer/status').then(next=>{
    if(current!==generation)return;
    const changed=state?.kind!==next.kind;state=next;unavailable=false;checked=true;render();if(changed)emit(true);
    const status=host?.shadowRoot?.querySelector('#viewer-status');
    if(status)status.textContent='閲覧権限：有効　期限：'+(next.expiresAt===null?'無期限（管理者が停止するまで）':new Date(next.expiresAt).toLocaleString('ja-JP'));
  }).catch(error=>{
    if(current!==generation)return;
    if(!['authentication_required','access_not_configured','access_migration_required'].includes(error.code)){
      const message=host?.shadowRoot?.querySelector('#message');if(message)message.textContent=error.message;return;
    }
    const hadAccess=!!state?.kind;state=null;unavailable=error.code!=='authentication_required';checked=true;render();if(hadAccess)emit(false);
  }).finally(()=>{if(pending===work)pending=null});
  pending=work;return work;
}
function ensureSection(){
  const overlay=root?.querySelector('.vps-settings-overlay'),heading=overlay?.querySelector('h1');
  const settings=heading?.textContent?.trim()==='設定'?overlay.querySelector('.vps-settings-wrap'):null;
  if(host&&!host.isConnected){
    // Collector/bridge updates replace the app's DOM while settings stays open.
    // Move the existing section so forms and in-flight one-time results survive.
    if(settings)settings.append(host);
    else{dispose?.();dispose=null;host=null}
  }
  if(!settings)return;
  if(!host){
    checked=false;host=document.createElement('section');host.dataset.piaSettings='';host.attachShadow({mode:'open'});settings.append(host);render();void refreshStatus({force:true});
  }
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;ensureSection()})}
function boot(){
  const candidate=document.querySelector('jugest-app');
  if(!candidate?.shadowRoot){setTimeout(boot,50);return}
  app=candidate;root=app.shadowRoot;observer=new MutationObserver(schedule);observer.observe(root,{childList:true,subtree:true});schedule();void refreshStatus();
  setInterval(()=>{if(!document.hidden&&(state?.kind||host?.isConnected))void refreshStatus()},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshStatus({force:true})});
  window.addEventListener('pageshow',()=>void refreshStatus({force:true}));
}
if(typeof document!=='undefined')boot();
