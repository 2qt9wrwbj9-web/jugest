const messages={authentication_required:'閲覧・管理の期限が切れたよ。もう一度ログインしてね。',admin_required:'管理者のパスキーによる本人確認が必要だよ。',reauthentication_required:'パスキーで本人確認をし直してね。',invalid_invite:'この招待コードは使えないよ。入力間違い・期限・使用済みを確認してね。',invalid_enrollment:'登録コードを確認してね。期限切れや使用済みの場合は新しく発行してもらってね。',invalid_authentication:'本人確認ができなかったよ。もう一度試してね。',too_many_attempts:'試行が多いので、5分ほど待ってから試してね。',access_migration_required:'管理者認証の準備がまだ完了していないよ。',access_not_configured:'共有アクセスはまだ有効化されていないよ。',invalid_label:'名前は80文字以内で入力してね。',invalid_duration:'期限と閲覧時間を、指定された範囲の整数で入力してね。'};
export async function accessRequest(route,body){
  const response=await fetch(route,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'content-type':'application/json','x-jugest-access':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  let result;try{result=await response.json()}catch{throw new Error('応答を確認できなかったよ。発行の結果が不明な場合は、一覧で確認してから再発行してね。')}
  if(!response.ok){const error=new Error(messages[result.code]||'処理に失敗したよ。時間を置いて試してね。');error.code=result.code;throw error}
  return result;
}

export function mountAccessUI(root,page,callbacks={}){
  const $=id=>root.querySelector('#'+id),controller=new AbortController(),signal=controller.signal,cleanups=[];
  let disposed=false;
  function message(text,error=false){if(disposed||!$('message'))return;$('message').textContent=text;$('message').className=error?'error':''}
  async function api(...args){if(disposed)throw new Error('画面を閉じたよ。');const result=await accessRequest(...args);if(disposed)throw new Error('画面を閉じたよ。');return result}
  const expiry=value=>value===null?'無期限（管理者が停止するまで）':time(value);


function decode(value){const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,x=>x.charCodeAt(0))}
function encode(value){return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function credentialJSON(credential){
  const response=credential.response,common={id:credential.id,rawId:encode(credential.rawId),type:credential.type,clientExtensionResults:credential.getClientExtensionResults(),authenticatorAttachment:credential.authenticatorAttachment??undefined};
  if(response.attestationObject)return {...common,response:{clientDataJSON:encode(response.clientDataJSON),attestationObject:encode(response.attestationObject),transports:response.getTransports?.()??[]}};
  return {...common,response:{clientDataJSON:encode(response.clientDataJSON),authenticatorData:encode(response.authenticatorData),signature:encode(response.signature),userHandle:response.userHandle?encode(response.userHandle):null}};
}
async function webauthn(kind,body={}){
  if(!window.PublicKeyCredential||!navigator.credentials)throw new Error('このブラウザはパスキーに対応していないよ。Safariなどの対応ブラウザで開いてね。');
  const start=await api('/api/access/'+kind+'/options',body),options=start.options;
  options.challenge=decode(options.challenge);
  for(const field of ['allowCredentials','excludeCredentials'])if(options[field])options[field]=options[field].map(c=>({...c,id:decode(c.id)}));
  if(options.user)options.user.id=decode(options.user.id);
  const credential=await navigator.credentials[kind==='register'?'create':'get']({publicKey:options,signal});
  if(!credential)throw new Error('パスキーの確認がキャンセルされたよ。');
  return await api('/api/access/'+kind+'/verify',{flowId:start.flowId,response:credentialJSON(credential)});
}
function bind(id,action,{form=false}={}){
  $(id)?.addEventListener(form?'submit':'click',async event=>{
    event.preventDefault();const target=form?event.currentTarget.querySelector('button'):event.currentTarget;
    if(target.disabled)return;target.disabled=true;message('処理中…');
    try{await action();message('完了したよ。')}catch(error){message(error.name==='NotAllowedError'?'本人確認がキャンセルされたか、パスキーを確認できなかったよ。もう一度試してね。':error.message,true)}finally{target.disabled=false}
  },{signal});
}
async function adminAction(route,body){
  try{return await api(route,body)}catch(error){if(error.code!=='reauthentication_required')throw error;await webauthn('reauth');return await api(route,body)}
}
const time=value=>value==null?'—':new Date(value).toLocaleString('ja-JP');
const node=(tag,text)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=String(text);return result};
function entry(title,details,action){const row=node('div');row.className='entry';const heading=node('div',title);heading.className='entry-title';row.append(heading);for(const detail of details)row.append(node('p',detail));if(action)row.append(action);return row}
function actionButton(text,action){const button=node('button',text);button.className='danger';button.addEventListener('click',async()=>{if(!confirm(text+'を実行する？'))return;button.disabled=true;try{await action();await refreshAdmin();message('停止したよ。')}catch(error){message(error.message,true)}finally{button.disabled=false}},{signal});return button}
function reveal(title,secret,expiresAt){$('secret-title').textContent=title;$('issued-secret').value=secret;$('secret-expiry').textContent='入力期限：'+time(expiresAt);$('secret-card').hidden=false}
function hideSecret(){if($('issued-secret'))$('issued-secret').value='';if($('secret-card'))$('secret-card').hidden=true}
async function refreshAdmin(){
  const state=await api('/api/access/admin/state');$('admin-status').textContent=state.admin.name+'で確認済み。管理者ログイン期限：'+time(state.admin.expiresAt);
  const status={unused:'未使用',used:'使用済み',expired:'期限切れ',revoked:'無効化',active:'閲覧中'};
  $('invites').replaceChildren(...state.invites.map(i=>entry(i.label||'名前なし',[status[i.status]+'・発行：'+time(i.created_at),'入力期限：'+time(i.redeem_expires_at)+'・使用：'+time(i.used_at),'閲覧期間：'+(i.viewer_session_duration===null?'無期限（管理者が停止するまで）':i.viewer_session_duration/3600000+'時間')],i.status==='revoked'?null:actionButton('招待と閲覧を無効化',()=>adminAction('/api/access/admin/invites/'+i.id+'/revoke',{})))));
  $('sessions').replaceChildren(...state.sessions.map(s=>entry(s.label||'名前なし',[status[s.status]+'・開始：'+time(s.created_at),'閲覧期限：'+expiry(s.expires_at),'最終アクセス：'+time(s.last_used_at)],s.status==='active'?actionButton('閲覧を強制終了',()=>adminAction('/api/access/admin/sessions/'+s.id+'/revoke',{})):null)));
  $('credentials').replaceChildren(...state.credentials.map(c=>entry(c.name,[c.revoked_at==null?'有効':'無効化','登録：'+time(c.created_at),'最終利用：'+time(c.last_used_at)],c.revoked_at==null?actionButton('パスキーを無効化',()=>adminAction('/api/access/admin/credentials/'+c.id+'/revoke',{})):null)));
  for(const id of ['invites','sessions','credentials'])if(!$(id).children.length)$(id).append(node('p','まだないよ。'));
}
if(page==='login')bind('login',async()=>{await webauthn('login');location.replace('/admin')});
if(page==='register'){
  const fragment=location.hash.slice(1);if(fragment){history.replaceState(null,'',location.pathname);$('enrollment-token').value=fragment}
  bind('registration',async()=>{await webauthn('register',{token:$('enrollment-token').value.trim(),name:$('credential-name').value.trim()});$('enrollment-token').value='';location.replace('/admin')},{form:true});
}
if(page==='access'){
  bind('redemption',async()=>{await api('/api/access/viewer/redeem',{code:$('invite-code').value.trim()});$('invite-code').value='';callbacks.onRedeem?await callbacks.onRedeem():location.replace('/pia')},{form:true});
  // Return visits use the existing session; never require a consumed code again.
  if(!callbacks.onRedeem)api('/api/access/viewer/status').then(()=>location.replace('/pia')).catch(()=>{});
  bind('settings-admin-login',async()=>{await webauthn('login');await callbacks.onLogin?.()});
}
if(page==='admin'){
  bind('refresh-admin',refreshAdmin);
  bind('issue-invite',async()=>{const result=await adminAction('/api/access/admin/invites',{label:$('invite-label').value,redeemMinutes:Number($('redeem-minutes').value),viewerHours:$('viewer-hours').value==='unlimited'?null:Number($('viewer-hours').value)});reveal('PIA閲覧キー',result.code,result.redeemExpiresAt);await refreshAdmin()},{form:true});
  bind('add-credential',async()=>{const result=await adminAction('/api/access/admin/enrollment',{});reveal('管理者端末の登録リンク',location.origin+'/admin/register#'+result.token,result.expiresAt)});
  bind('copy-secret',async()=>{await navigator.clipboard.writeText($('issued-secret').value)});bind('hide-secret',async()=>hideSecret());
  bind('admin-logout',async()=>{await api('/api/access/admin/logout',{});hideSecret();callbacks.onLogout?await callbacks.onLogout():location.replace('/admin/login')});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)hideSecret()},{signal});
  window.addEventListener('pagehide',hideSecret,{signal});
  refreshAdmin().catch(error=>message(error.message,true));
}
if(page==='pia'){
  let version=0,datesVersion=0;
  function viewerState(state){$('viewer-status').textContent='閲覧権限：有効　期限：'+expiry(state.expiresAt);$('viewer-logout').textContent=state.kind==='admin'?'管理画面へ戻る':'閲覧を終了'}
  async function showDay(){
    const current=++version,store=$('store-select').value,date=$('date-select').value;$('machine-data').replaceChildren();$('day-summary').textContent='';if(!store||!date)return;
    const payload=await api('/api/vps/stores/'+encodeURIComponent(store)+'/days/'+encodeURIComponent(date));if(current!==version)return;
    const machines=payload.day.machines??[];$('day-summary').textContent=payload.store.name+'・'+date+'・'+machines.length+'台';
    const cards=machines.map(m=>{const card=node('div');card.className='machine';card.append(node('strong',String(m.tableNo??'')+'番台　'+String(m.sourceMachineName??m.machineName??m.machine??'')));const stats=node('div');stats.className='stats';for(const [name,value] of [['ゲーム数',m.games],['BB回数',m.bb],['RB回数',m.rb],['差枚',m.diff]]){const box=node('div');box.append(node('span',name),node('b',value==null?'—':Number(value).toLocaleString('ja-JP')));stats.append(box)}card.append(stats);return card});$('machine-data').replaceChildren(...cards);
  }
  async function showDates(){const current=++datesVersion,store=$('store-select').value;version++;$('date-select').replaceChildren();$('machine-data').replaceChildren();if(!store)return;const payload=await api('/api/vps/stores/'+encodeURIComponent(store)+'/days?limit=366');if(current!==datesVersion)return;$('date-select').replaceChildren(...[...(payload.days??[])].reverse().map(d=>{const option=node('option',d.date);option.value=d.date;return option}));await showDay()}
  async function refreshPia(){try{viewerState(await api('/api/access/viewer/status'));const payload=await api('/api/vps/stores');$('store-select').replaceChildren(...(payload.stores??[]).map(s=>{const option=node('option',s.name);option.value=s.id;return option}));if(!payload.stores?.length)$('day-summary').textContent='閲覧できるPIAデータはまだないよ。';await showDates()}catch(error){fail(error);throw error}}
  const fail=error=>{if(disposed)return;version++;datesVersion++;$('machine-data').replaceChildren();$('day-summary').textContent='';message(error.message,true);if(['authentication_required','admin_required','receiver_unauthorized','unauthorized'].includes(error.code))void callbacks.onAccessLost?.()};
  $('store-select').addEventListener('change',()=>showDates().catch(fail),{signal});$('date-select').addEventListener('change',()=>showDay().catch(fail),{signal});
  bind('refresh-data',refreshPia);bind('viewer-logout',async()=>{const state=await api('/api/access/viewer/status');if(state.kind==='admin'){callbacks.onAdmin?await callbacks.onAdmin():location.replace('/admin');return}await api('/api/access/viewer/logout',{});$('machine-data').replaceChildren();callbacks.onLogout?await callbacks.onLogout():location.replace('/pia/access')});
  const timer=callbacks.poll===false?null:setInterval(()=>api('/api/access/viewer/status').then(viewerState).catch(error=>{clearInterval(timer);fail(error)}),30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPia().catch(fail)},{signal});
  cleanups.push(()=>{clearInterval(timer);version++;datesVersion++});
  refreshPia().catch(fail);
}

  return ()=>{disposed=true;hideSecret();controller.abort();for(const cleanup of cleanups)cleanup()};
}
if(typeof document!=='undefined'&&document.body?.dataset.page)mountAccessUI(document.body,document.body.dataset.page);
