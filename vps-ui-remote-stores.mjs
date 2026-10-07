import {createVpsAnalyticsClient} from './vps-browser-analytics.mjs';

const UPDATE_EVENT='jugest:vps-remote-updated';
const PUBLIC_SOURCE='pia-public-ranking-top';

function publicPiaStore(row){
  return row?.source===PUBLIC_SOURCE&&row?.visibility==='public';
}

function normalizeStore(row){
  return {
    id:String(row?.id||''),name:String(row?.name||'').trim(),
    latestDate:String(row?.latestDate||''),dayCount:Math.max(0,Number(row?.dayCount)||0),
    source:String(row?.source||''),visibility:String(row?.visibility||''),
    registered:true,enabled:true,error:false,remote:true
  };
}

function normalizeMachine(row){
  return {
    tableNo:String(row?.tableNo??''),machine:String(row?.machine||''),
    machineName:String(row?.sourceMachineName||row?.machineName||row?.machine||''),
    games:Number(row?.games)||0,bb:Number(row?.bb)||0,rb:Number(row?.rb)||0,
    diff:row?.diff==null?null:Number(row.diff),expectedSetting:null,q:null
  };
}
function normalizeDay(store,payload,date=''){
  const day=payload?.day||{},machines=Array.isArray(day.machines)?day.machines:[];
  const rows=machines.map(normalizeMachine).sort((a,b)=>a.tableNo.localeCompare(b.tableNo,'ja',{numeric:true}));
  return {shop:store.name,date:String(day.date||date||''),rows};
}

function emit(target){
  try{target?.dispatchEvent?.(new Event(UPDATE_EVENT))}catch{}
}

export function createRemoteStoreCache({client,eventTarget=globalThis}={}){
  if(!client||typeof client.listStores!=='function')throw new TypeError('client is required');
  let stores=[],generation=0;
  const datesById=new Map(),daysByKey=new Map(),pending=new Map();
  const byName=name=>stores.find(store=>store.name===String(name||'').trim())||null;
  const dayKey=(id,date)=>`${id}|${date}`;
  function clear(){generation++;stores=[];datesById.clear();daysByKey.clear();pending.clear();emit(eventTarget)}

  async function ensureDay(store,date,{notify=true}={}){
    const target=String(date||store?.latestDate||'').trim();
    if(!store||!target)return null;
    const key=dayKey(store.id,target);
    if(daysByKey.has(key))return daysByKey.get(key);
    if(pending.has(key))return pending.get(key);
    const current=generation;
    const work=Promise.resolve(client.getStoreDayById(store.id,target)).then(async payload=>{
      const normalized=normalizeDay(store,payload,target);
      if(normalized.rows.length&&typeof client.judgeMachines==='function'){
        try{
          const judged=await client.judgeMachines(normalized.rows.map(row=>({tableNo:row.tableNo,machine:row.machine,games:row.games,bb:row.bb,rb:row.rb,diff:row.diff})));
          for(const result of Array.isArray(judged?.machines)?judged.machines:[]){
            if(!result?.ok)continue;const row=normalized.rows[Number(result.index)];if(!row)continue;
            if(Number.isFinite(Number(result.expectedSetting)))row.expectedSetting=Number(result.expectedSetting);
            if(Array.isArray(result.q))row.q=result.q.map(Number);
          }
        }catch{}
      }
      if(current!==generation)return null;
      daysByKey.set(key,normalized);
      if(notify)emit(eventTarget);
      return normalized;
    }).catch(error=>{if(current===generation&&[401,403].includes(error.status))clear();throw error}).finally(()=>{if(pending.get(key)===work)pending.delete(key)});
    pending.set(key,work);
    return work;
  }

  async function refresh(){
    const current=generation;
    try{
    const listed=await client.listStores();
    if(current!==generation)return [];
    const next=(Array.isArray(listed)?listed:[]).filter(publicPiaStore).map(normalizeStore).filter(x=>x.id&&x.name);
    stores=next.sort((a,b)=>a.name.localeCompare(b.name,'ja'));
    await Promise.all(stores.map(async store=>{
      const payload=await client.getStoreDaysById(store.id,{limit:120});
      if(current!==generation)return;
      const dates=(Array.isArray(payload?.days)?payload.days:[]).map(x=>String(x?.date||'')).filter(Boolean).sort((a,b)=>b.localeCompare(a));
      datesById.set(store.id,dates);
      if(dates[0])await ensureDay(store,dates[0],{notify:false});
    }));
    if(current!==generation)return [];
    emit(eventTarget);
    return stores.map(x=>({...x}));
    }catch(error){if(current===generation&&[401,403].includes(error.status))clear();throw error}
  }
  return Object.freeze({
    refresh,clear,
    getStores:()=>stores.map(x=>({...x})),
    getDates(name,limit=120){
      const store=byName(name);if(!store)return [];
      return [...(datesById.get(store.id)||[])].slice(0,Math.max(1,Number(limit)||120));
    },
    getDay(name,date=''){
      const store=byName(name);if(!store)return null;
      const target=String(date||datesById.get(store.id)?.[0]||store.latestDate||'');
      if(!target)return {shop:store.name,date:'',rows:[]};
      const cached=daysByKey.get(dayKey(store.id,target));
      if(cached)return {shop:cached.shop,date:cached.date,rows:cached.rows.map(x=>({...x}))};
      void ensureDay(store,target).catch(()=>{});
      return {shop:store.name,date:target,rows:[]};
    },
    getOverview(name){
      const store=byName(name);if(!store)return null;
      const dates=datesById.get(store.id)||[],day=daysByKey.get(dayKey(store.id,dates[0]||store.latestDate));
      const rows=day?.rows||[];
      return {name:store.name,latestDate:dates[0]||store.latestDate,storedDays:dates.length,machineRows:rows.length,totalG:rows.reduce((a,x)=>a+(Number(x.games)||0),0),totalBB:rows.reduce((a,x)=>a+(Number(x.bb)||0),0),totalRB:rows.reduce((a,x)=>a+(Number(x.rb)||0),0),collector:{registered:true,enabled:true,errorCode:'',missingDays:0,latestDate:dates[0]||store.latestDate}};
    }
  });
}
if(typeof window!=='undefined'&&typeof document!=='undefined'){
  const cache=createRemoteStoreCache({client:createVpsAnalyticsClient({piaOnly:true}),eventTarget:globalThis});
  globalThis.JUGEST_VPS_REMOTE_STORES=cache;
  const refresh=()=>cache.refresh().catch(()=>{});
  void refresh();
  globalThis.addEventListener?.('pageshow',refresh);
  globalThis.addEventListener?.('jugest:pia-access-changed',event=>{
    if(!event.detail?.active)cache.clear();
    // The independent Receiver owner may still be authorized after cookie logout.
    void refresh();
  });
  document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
}

export const __test={UPDATE_EVENT,PUBLIC_SOURCE,publicPiaStore,normalizeMachine,normalizeDay};
