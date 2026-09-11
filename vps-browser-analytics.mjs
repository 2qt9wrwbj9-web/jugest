const RELAY_STORAGE_KEY='jugglerRelayReceiver:v1';
const DEFAULT_BASE_URL='/api/vps';

function makeError(message,code,status=0){
  const error=new Error(message);
  error.code=code;
  if(status)error.status=status;
  return error;
}

export function readRelayReceiver(storage=globalThis.localStorage){
  try{
    const raw=storage?.getItem?.(RELAY_STORAGE_KEY);
    if(!raw)return null;
    const value=JSON.parse(raw);
    const channelId=String(value?.channelId||'').trim();
    const receiverToken=String(value?.receiverToken||'').trim();
    if(!value?.linked||!channelId||!receiverToken)return null;
    return {channelId,receiverToken};
  }catch{
    return null;
  }
}

export function createVpsAnalyticsClient({
  fetchFn=globalThis.fetch?.bind(globalThis),
  storage=globalThis.localStorage,
  baseUrl=DEFAULT_BASE_URL
}={}){
  if(typeof fetchFn!=='function')throw new TypeError('fetchFn is required');
  const base=String(baseUrl||DEFAULT_BASE_URL).replace(/\/+$/,'');

  async function request(path){
    const receiver=readRelayReceiver(storage);
    if(!receiver)throw makeError('VPS解析を利用するにはiPhone Collector連携が必要です。','vps_credentials_unavailable');
    let response;
    try{
      response=await fetchFn(`${base}${path}`,{
        method:'GET',
        headers:{
          accept:'application/json',
          'x-jugest-channel-id':receiver.channelId,
          authorization:`Bearer ${receiver.receiverToken}`
        },
        cache:'no-store',
        credentials:'same-origin'
      });
    }catch(error){
      throw makeError(`VPS解析APIへ接続できませんでした: ${String(error?.message||error)}`,'vps_network_error');
    }
    let payload=null;
    try{payload=await response.json()}catch{/* handled below */}
    if(!response.ok||payload?.ok===false){
      const code=String(payload?.code||`http_${response.status}`);
      throw makeError(`VPS解析APIエラー (${code})`,code,response.status);
    }
    if(!payload||payload.ok!==true)throw makeError('VPS解析APIから正しい応答を取得できませんでした。','vps_invalid_response',response.status);
    return payload;
  }

  async function resolveStore(shop){
    const name=String(shop||'').trim();
    if(!name)throw makeError('店舗が選択されていません。','vps_store_required');
    const payload=await request('/stores');
    const stores=Array.isArray(payload.stores)?payload.stores:[];
    const exact=stores.find(store=>String(store?.name||'')===name);
    if(!exact)throw makeError(`VPSに「${name}」の店舗データがありません。`,'vps_store_not_found');
    return exact;
  }

  return Object.freeze({
    async getDefaultAnalysis(shop){
      const store=await resolveStore(shop);
      const payload=await request(`/stores/${encodeURIComponent(store.id)}/analysis/default`);
      return {
        store:payload.store||store,
        analysis:payload.analysis??null,
        businessDate:payload.businessDate??null,
        payloadHash:payload.payloadHash??null,
        updatedAt:payload.updatedAt??null
      };
    },
    async getStatus(shop){
      const store=await resolveStore(shop);
      return request(`/stores/${encodeURIComponent(store.id)}/status`);
    }
  });
}

export const __test={RELAY_STORAGE_KEY,DEFAULT_BASE_URL};
