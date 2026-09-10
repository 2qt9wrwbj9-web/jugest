import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {buildAnaSloUrl} from '../src/collector/source.mjs';
import {runCollectorOnce} from '../src/collector/engine.mjs';
import {
  addCollectorStore,collectorJstDate,ensureCollectorTargets,getCollectorControl,listCollectorStores,
  peekEligibleCollectorDay,resetCollectorDay,setCollectorStoreEnabled
} from '../src/collector/repository.mjs';

function usage(){return 'Usage: node scripts/collector.mjs <add|list|enable|disable|status|collect-now|reset-day> [options]';}
function parseFlags(args){
  const out={};
  for(let i=0;i<args.length;i+=2){
    const key=args[i],value=args[i+1];
    if(!key?.startsWith('--')||value==null||value.startsWith('--'))throw new TypeError(`invalid option near ${key||'(missing)'}`);
    out[key.slice(2)]=value;
  }
  return out;
}
function required(value,name){const s=String(value??'').trim();if(!s)throw new TypeError(`${name} is required`);return s;}
function validDate(value,name='date'){
  const s=required(value,name);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new TypeError(`${name} must be YYYY-MM-DD`);
  const d=new Date(`${s}T00:00:00Z`);
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw new TypeError(`${name} must be a real YYYY-MM-DD date`);
  return s;
}
function positiveInt(value,name,fallback){
  if(value==null||value==='')return fallback;
  const n=Number(value);if(!Number.isInteger(n)||n<=0)throw new TypeError(`${name} must be a positive integer`);return n;
}
function now(){
  const injected=process.env.JUGEST_COLLECTOR_NOW;
  const d=injected?new Date(injected):new Date();
  if(!Number.isFinite(d.getTime()))throw new TypeError('JUGEST_COLLECTOR_NOW must be an ISO date-time');
  return d;
}
function print(value){process.stdout.write(`${JSON.stringify(value)}\n`);}
function requireDbPath(){return required(process.env.JUGEST_DB_PATH,'JUGEST_DB_PATH');}

async function main(){
  const command=process.argv[2];
  if(!command)throw new TypeError(usage());
  const flags=parseFlags(process.argv.slice(3));
  let prepared={};

  if(command==='add'){
    prepared.storeId=required(flags['store-id'],'store-id');
    prepared.slug=required(flags.slug,'slug');
    prepared.name=required(flags.name,'name');
    prepared.historyStart=validDate(flags['history-start'],'history-start');
    buildAnaSloUrl({date:prepared.historyStart,slug:prepared.slug});
  }else if(command==='enable'||command==='disable'){
    prepared.storeId=required(flags['store-id'],'store-id');
  }else if(command==='reset-day'){
    prepared.storeId=required(flags['store-id'],'store-id');
    prepared.businessDate=validDate(flags.date,'date');
  }else if(!['list','status','collect-now'].includes(command)){
    throw new TypeError(usage());
  }

  const dbPath=requireDbPath();
  const db=openDatabase(dbPath);
  try{
    migrate(db);
    const current=now(),nowIso=current.toISOString();

    if(command==='add'){
      const store=addCollectorStore(db,{...prepared,nowIso});
      print({ok:true,store});return;
    }
    if(command==='list'){
      print({ok:true,stores:listCollectorStores(db)});return;
    }
    if(command==='enable'){
      const store=setCollectorStoreEnabled(db,{storeId:prepared.storeId,enabled:true,nowIso});
      const inserted=ensureCollectorTargets(db,{now:current,historyBackfill:true});
      print({ok:true,store,backfillInserted:inserted});return;
    }
    if(command==='disable'){
      const store=setCollectorStoreEnabled(db,{storeId:prepared.storeId,enabled:false,nowIso});
      print({ok:true,store});return;
    }
    if(command==='reset-day'){
      const day=resetCollectorDay(db,{storeId:prepared.storeId,businessDate:prepared.businessDate,nowIso});
      print({ok:true,day});return;
    }
    if(command==='status'){
      const stores=listCollectorStores(db);
      const control=getCollectorControl(db);
      const todayJst=collectorJstDate(current);
      const next=peekEligibleCollectorDay(db,{nowIso,todayJst});
      const counts=db.prepare(`SELECT state,COUNT(*) AS count FROM collector_days GROUP BY state ORDER BY state`).all();
      print({ok:true,stores,control,counts,nextEligible:next?{storeId:next.storeId,businessDate:next.businessDate}:null});return;
    }
    if(command==='collect-now'){
      const summary=await runCollectorOnce({
        db,
        rawRoot:process.env.JUGEST_COLLECTOR_RAW_ROOT||'/var/lib/jugest/collector/raw',
        clock:()=>now(),
        maxRequests:positiveInt(process.env.JUGEST_COLLECTOR_MAX_REQUESTS,'JUGEST_COLLECTOR_MAX_REQUESTS',10),
        maxRunMs:positiveInt(process.env.JUGEST_COLLECTOR_MAX_RUN_MS,'JUGEST_COLLECTOR_MAX_RUN_MS',4*60*1000),
        requestTimeoutMs:positiveInt(process.env.JUGEST_COLLECTOR_TIMEOUT_MS,'JUGEST_COLLECTOR_TIMEOUT_MS',20000)
      });
      print({ok:true,...summary});return;
    }
  }finally{db.close()}
}

main().catch(error=>{
  const message=String(error?.message||error);
  console.error(message);
  process.exitCode=error instanceof TypeError?2:1;
});
