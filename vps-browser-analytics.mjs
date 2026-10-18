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
  baseUrl=DEFAULT_BASE_URL,
  piaOnly=false
}={}){
  if(typeof fetchFn!=='function')throw new TypeError('fetchFn is required');
  const base=String(baseUrl||DEFAULT_BASE_URL).replace(/\/+$/,'');

  async function request(path,{method='GET',body=null,signal,preferReceiver=false}={}){
    signal?.throwIfAborted();
    const receiver=readRelayReceiver(storage);
    const cookieRead=piaOnly&&method==='GET'&&(path==='/allocation/stores'||/^\/stores(?:$|\/[^/]+\/days(?:\?[^#]*|\/\d{4}-\d{2}-\d{2}(?:\/allocation(?:\?[^#]*)?)?)?$)/.test(path));
    const useCookie=cookieRead&&(!preferReceiver||!receiver);
    if(!receiver&&!cookieRead)throw makeError('VPS解析を利用するにはiPhone Collector連携が必要です。','vps_credentials_unavailable');
    let response;
    try{
      const options={
        method,
        headers:{
          accept:'application/json',
          ...(body!=null?{'content-type':'application/json'}:{}),
          ...(receiver&&!useCookie?{'x-jugest-channel-id':receiver.channelId,authorization:`Bearer ${receiver.receiverToken}`}:{})
        },
        ...(body!=null?{body}:{}),
        cache:'no-store',
        credentials:'same-origin'
      };
      if(signal)options.signal=signal;
      response=await fetchFn(`${base}${path}`,options);
      // A valid unrelated Receiver must not mask a PIA sharing grant.
      // Only these three reads prefer the cookie, then fall back to the
      // independently authenticated owner when no usable access cookie exists.
      if(cookieRead&&receiver&&[401,403].includes(response.status)){
        await response.body?.cancel?.();
        response=await fetchFn(`${base}${path}`,{...options,headers:{accept:'application/json',...(!useCookie?{}:{'x-jugest-channel-id':receiver.channelId,authorization:`Bearer ${receiver.receiverToken}`})}});
      }
    }catch(error){
      if(error?.name==='AbortError'||signal?.aborted)throw error;
      throw makeError(`VPS解析APIへ接続できませんでした: ${String(error?.message||error)}`,'vps_network_error');
    }
    let payload=null;
    try{payload=await response.json()}catch{/* handled below */}
    signal?.throwIfAborted();
    if(!response.ok||payload?.ok===false){
      const code=String(payload?.code||`http_${response.status}`);
      throw makeError(`VPS解析APIエラー (${code})`,code,response.status);
    }
    if(!payload||payload.ok!==true)throw makeError('VPS解析APIから正しい応答を取得できませんでした。','vps_invalid_response',response.status);
    return payload;
  }

  async function resolveStore(shop,{signal,strict=false,allocation=false}={}){
    const name=String(shop||'').trim();
    if(!name)throw makeError('店舗が選択されていません。','vps_store_required');
    let payload=await request(allocation?'/allocation/stores':'/stores',{signal,preferReceiver:allocation});
    let stores=Array.isArray(payload.stores)?payload.stores:[],cookieOnly=false;
    if(allocation&&piaOnly&&readRelayReceiver(storage)&&!stores.some(store=>String(store?.name||'')===name)){
      payload=await request('/allocation/stores',{signal});stores=Array.isArray(payload.stores)?payload.stores:[];cookieOnly=true;
    }
    const exact=stores.find(store=>String(store?.name||'')===name);
    if(strict&&stores.filter(store=>String(store?.name||'')===name).length>1)throw makeError('同じ名前の店舗が複数あります。店舗IDで指定してください。','vps_store_ambiguous');
    if(!exact)throw makeError(`VPSに「${name}」の店舗データがありません。`,'vps_store_not_found');
    return cookieOnly?{...exact,allocationCookieOnly:true}:exact;
  }

  function allocationDate(date){
    const day=String(date||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw makeError('営業日を確認してください。','bad_date');
    return day;
  }
  async function allocationById(storeId,date,{machine,band='456',kind='atLeast',count,detail=false,signal,preferReceiver=true}={}){
    const day=allocationDate(date),id=String(storeId||'').trim();
    if(!id)throw makeError('店舗が選択されていません。','vps_store_required');
    const params=new URLSearchParams();
    if(machine){params.set('machine',machine);params.set('band',band);params.set('kind',kind);if(count!==null&&count!==undefined)params.set('count',String(count));if(detail)params.set('detail','1')}
    return request(`/stores/${encodeURIComponent(id)}/days/${day}/allocation${params.size?'?'+params.toString():''}`,{signal,preferReceiver});
  }

  return Object.freeze({
    async getAllocation(shop,date,options={}){
      allocationDate(date);
      const store=await resolveStore(shop,{signal:options.signal,strict:true,allocation:true});
      return allocationById(store.id,date,{...options,preferReceiver:!store.allocationCookieOnly});
    },
    getAllocationById:allocationById,
    async listStores(){
      const payload=await request('/stores');
      return Array.isArray(payload.stores)?payload.stores:[];
    },
    async judgeMachines(machines){
      if(!Array.isArray(machines))throw makeError('machines must be an array','bad_machines');
      return request('/judge/machines',{method:'POST',body:JSON.stringify({machines})});
    },
    async getStoreDaysById(storeId,{limit=120}={}){
      const id=String(storeId||'').trim();
      if(!id)throw makeError('storeId is required','vps_store_required');
      const bounded=Math.min(366,Math.max(1,Math.trunc(Number(limit)||120)));
      return request(`/stores/${encodeURIComponent(id)}/days?limit=${bounded}`);
    },
    async getStoreDayById(storeId,date){
      const id=String(storeId||'').trim(),day=String(date||'').trim();
      if(!id)throw makeError('storeId is required','vps_store_required');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw makeError('date must be YYYY-MM-DD','bad_date');
      return request(`/stores/${encodeURIComponent(id)}/days/${encodeURIComponent(day)}`);
    },
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
    },
    async getStoreRead(shop){
      const store=await resolveStore(shop);
      const payload=await request(`/stores/${encodeURIComponent(store.id)}/research/store-read`);
      return {
        store:payload.store||store,
        storeRead:payload.storeRead??null,
        businessDate:payload.businessDate??null,
        payloadHash:payload.payloadHash??null,
        updatedAt:payload.updatedAt??null
      };
    },
    async getLegacyPlan(shop,date,{lottery=0,queue=0}={}){
      const store=await resolveStore(shop),target=String(date||'').trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(target))throw makeError('date must be YYYY-MM-DD','bad_date');
      const params=new URLSearchParams({date:target,lottery:String(Math.max(0,Math.trunc(Number(lottery)||0))),queue:String(Math.max(0,Math.trunc(Number(queue)||0)))});
      const payload=await request(`/stores/${encodeURIComponent(store.id)}/legacy-plan?${params.toString()}`);
      return {store:payload.store||store,plan:payload.plan??null};
    },
    async getResearchComparison(shop,{limit=90}={}){
      const store=await resolveStore(shop);
      const bounded=Math.min(366,Math.max(1,Math.trunc(Number(limit)||90)));
      const payload=await request(`/stores/${encodeURIComponent(store.id)}/research/comparison?limit=${bounded}`);
      return {
        store:payload.store||store,
        limit:Number(payload.limit)||bounded,
        comparison:payload.comparison??null
      };
    }
  });
}

export const __test={RELAY_STORAGE_KEY,DEFAULT_BASE_URL};
