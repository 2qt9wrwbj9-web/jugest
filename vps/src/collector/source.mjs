function validDate(value){
  const s=String(value??'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new TypeError('date must be YYYY-MM-DD');
  const d=new Date(`${s}T00:00:00Z`);
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw new TypeError('date must be a real YYYY-MM-DD date');
  return s;
}

function validSlug(value){
  const s=String(value??'').trim();
  if(!s||s==='.'||s==='..'||/[\\/?#\s]/.test(s)||s.includes('..'))throw new TypeError('slug must be one safe URL path segment');
  return s;
}

export function buildAnaSloUrl({date,slug}={}){
  return `https://ana-slo.com/${validDate(date)}-${validSlug(slug)}-data/`;
}

export async function fetchAnaSloDay({date,slug,transport=globalThis.fetch,timeoutMs=20000,clock=Date.now}={}){
  if(typeof transport!=='function')throw new TypeError('transport must be a function');
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new TypeError('timeoutMs must be positive');
  if(typeof clock!=='function')throw new TypeError('clock must be a function');
  const url=buildAnaSloUrl({date,slug});
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(new Error('collector fetch timeout')),timeoutMs);
  timer.unref?.();
  const t0=Number(clock());
  try{
    const response=await transport(url,{
      method:'GET',
      redirect:'follow',
      cache:'no-store',
      signal:controller.signal,
      headers:{
        'accept':'text/html,application/xhtml+xml',
        'user-agent':'JUGEST-VPS-Collector/1.0 (+https://jugest.net)'
      }
    });
    if(!response||!Number.isInteger(response.status)||typeof response.text!=='function')throw new TypeError('collector transport returned an invalid response');
    const html=await response.text();
    const t1=Number(clock());
    return {
      ok:response.ok===true,
      status:response.status,
      statusText:String(response.statusText??''),
      finalUrl:String(response.url||url),
      html:String(html??''),
      elapsedMs:Number.isFinite(t0)&&Number.isFinite(t1)?Math.max(0,Math.round(t1-t0)):0
    };
  }finally{
    clearTimeout(timer);
  }
}
