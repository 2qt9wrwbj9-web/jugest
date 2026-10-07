import {readRelayReceiver} from './vps-browser-analytics.mjs';

const DEFAULT_BASE='/api/pachinko';
export const PACHINKO_STORE_ID='pia:35-p';
export const MODEL_ORDER=['OUMI5_SPECIAL_ALTA','TOKYO_GHOUL_399','TOKYO_GHOUL_999'];
export const MODEL_LABELS=Object.freeze({OUMI5_SPECIAL_ALTA:'大海5SP',TOKYO_GHOUL_399:'東京喰種399',TOKYO_GHOUL_999:'東京喰種999'});
export const STATUS_LABELS=Object.freeze({verified:'実データ検証済み',provisional:'追加検証中',unverified:'未検証',unusable:'利用不可',mixed:'混在'});

function makeError(message,code,status=0){const e=new Error(message);e.code=code;if(status)e.status=status;return e}
export function escapePachinkoHtml(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
export function statusLabel(value){return STATUS_LABELS[value]||'未検証'}
export function modelLabel(key){return MODEL_LABELS[key]||String(key||'')}
export function formatPachinkoK(value,status='verified'){const n=Number(value);return status==='verified'&&Number.isFinite(n)&&n>0?n.toFixed(1):'—'}
export function formatPachinkoCount(value){if(value===null||value===undefined||value===''||typeof value==='boolean')return '—';const n=Number(value);return Number.isFinite(n)?Math.trunc(n).toLocaleString('ja-JP'):'—'}
export function formatPachinkoDiff(value){if(value===null||value===undefined||value===''||typeof value==='boolean')return '—';const n=Number(value);return Number.isFinite(n)?`${n>=0?'+':''}${Math.trunc(n).toLocaleString('ja-JP')}玉`:'—'}
export function selectedSummary(matrix,date){return (matrix?.summaries||[]).find(row=>row.business_date===date)?.models||[]}
export function recordKey(identity,date){return `${String(identity||'')}\u0000${String(date||'')}`}
export function buildRecordMap(matrix){return new Map((matrix?.records||[]).map(row=>[recordKey(row.identity,row.business_date),row]))}
export function modelSnapshotMap(matrix){return new Map((matrix?.modelSnapshots||[]).map(row=>[row.machine_model_key,row.snapshot]))}

export function createPachinkoClient({fetchFn=globalThis.fetch?.bind(globalThis),storage=globalThis.localStorage,baseUrl=DEFAULT_BASE}={}){
  if(typeof fetchFn!=='function')throw new TypeError('fetchFn is required');
  const base=String(baseUrl||DEFAULT_BASE).replace(/\/+$/,'');
  async function request(path){
    const receiver=readRelayReceiver(storage);const options={method:'GET',headers:{accept:'application/json'},credentials:'same-origin',cache:'no-store'};let response;
    try{
      response=await fetchFn(`${base}${path}`,options);
      if(receiver&&[401,403].includes(response.status)){
        await response.body?.cancel?.();
        response=await fetchFn(`${base}${path}`,{...options,headers:{accept:'application/json','x-jugest-channel-id':receiver.channelId,authorization:`Bearer ${receiver.receiverToken}`}});
      }
    }catch(error){throw makeError(`PIA大船-Pへ接続できませんでした: ${String(error?.message||error)}`,'pachinko_network_error')}
    let payload=null;try{payload=await response.json()}catch{}
    if(!response.ok||payload?.ok===false){const code=String(payload?.code||`http_${response.status}`);throw makeError(code==='pachinko_preparation_required'?'PIA大船-Pはまだ準備中です。':code==='unauthorized'||code==='forbidden'?'PIA大船-Pの閲覧権限を確認してください。':`PIA大船-P APIエラー (${code})`,code,response.status)}
    if(!payload||payload.ok!==true)throw makeError('PIA大船-Pから正しい応答を取得できませんでした。','pachinko_invalid_response',response.status);
    return payload;
  }
  return Object.freeze({
    async listStores(){const p=await request('/stores');return Array.isArray(p.stores)?p.stores:[]},
    async getMatrix({storeId=PACHINKO_STORE_ID,modelKey='',limit=30}={}){const params=new URLSearchParams({limit:String(Math.min(30,Math.max(1,Math.trunc(Number(limit)||30))))});if(modelKey)params.set('model',modelKey);return request(`/stores/${encodeURIComponent(storeId)}/matrix?${params}`)},
    async getRecord(recordId,{storeId=PACHINKO_STORE_ID}={}){const id=Number(recordId);if(!Number.isSafeInteger(id)||id<=0)throw makeError('recordIdが不正です。','invalid_pachinko_record_id');const p=await request(`/stores/${encodeURIComponent(storeId)}/records/${id}`);return p.record}
  });
}

export const __test={DEFAULT_BASE,makeError};
