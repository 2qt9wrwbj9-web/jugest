import {DatabaseSync} from 'node:sqlite';
import {canAccessStoreMetadata,storeMetadata} from '../store-access.mjs';
import {authenticateReadOnlyPrincipal} from '../assistant-read-key.mjs';
import {createAllocationService,validAllocationDate} from './service.mjs';

const keys=new Set(['my','my6','im','go','fk','hp','gg','mr','um']);
function isStoreList(parts){return parts?.length===4&&parts[0]==='api'&&parts[1]==='vps'&&parts[2]==='allocation'&&parts[3]==='stores'}
export function isAllocationRoute(parts){return isStoreList(parts)||(parts?.length===7&&parts[0]==='api'&&parts[1]==='vps'&&parts[2]==='stores'&&parts[4]==='days'&&parts[6]==='allocation')}
function send(req,res,status,payload,extra={}){
  const body=Buffer.from(JSON.stringify(payload));res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':String(body.length),'cache-control':'no-store','x-content-type-options':'nosniff',...extra});res.end(req.method==='HEAD'?undefined:body);
}
function accessStore(dbPath,id,auth){
  const db=new DatabaseSync(dbPath,{readOnly:true});
  try{
    db.exec('PRAGMA query_only=ON;');
    const row=db.prepare('SELECT source_metadata_json FROM stores WHERE id=?').get(id);
    if(!row)return 404;
    const meta=storeMetadata(row.source_metadata_json),piaOnly=['admin','pia-viewer'].includes(auth.kind);
    return (piaOnly?meta.source==='pia-public-ranking-top':canAccessStoreMetadata(meta,auth.channelId))?200:403;
  }finally{db.close()}
}
function listStores(dbPath,auth){
  const db=new DatabaseSync(dbPath,{readOnly:true});
  try{
    db.exec('PRAGMA query_only=ON;');
    const piaOnly=['admin','pia-viewer'].includes(auth.kind);
    return db.prepare('SELECT id,name,source_metadata_json FROM stores ORDER BY name,id').all().flatMap(row=>{
      const meta=storeMetadata(row.source_metadata_json);
      return (piaOnly?meta.source==='pia-public-ranking-top':canAccessStoreMetadata(meta,auth.channelId))?[{id:row.id,name:row.name}]:[];
    });
  }finally{db.close()}
}
function parseDetail(params){
  for(const key of params.keys())if(!['machine','band','kind','count','detail'].includes(key)||params.getAll(key).length!==1)throw new Error('bad_query');
  if(!params.size)return null;
  const machine=params.get('machine');if(!keys.has(machine))throw new Error('bad_machine');
  if(params.has('detail')&&!['1','true'].includes(params.get('detail')))throw new Error('bad_detail');
  const band=params.get('band')||'456',kind=params.get('kind')||'atLeast';
  if(!['456','56','6'].includes(band)||!['exact','atLeast'].includes(kind))throw new Error('bad_detail');
  let count=null;
  if(params.has('count')){
    const raw=params.get('count');if(!/^(?:0|[1-9]\d{0,2})$/.test(raw))throw new Error('bad_count');
    count=Number(raw);if(count>120||count<(kind==='exact'?0:1))throw new Error('bad_count');
  }
  return {machine,band,kind,count};
}
export function createAllocationHandler({rootDir,relayDbPath,canonicalDbPath,rawRoot,authenticatePiaReadOnly=()=>null,service=null}={}){
  const allocation=service||createAllocationService({rootDir,dbPath:canonicalDbPath,rawRoot});
  return async function handle(req,res,{parts,url}){
    const method=String(req.method||'GET').toUpperCase();
    if(!['GET','HEAD'].includes(method)){send(req,res,405,{ok:false,code:'method_not_allowed'},{allow:'GET, HEAD'});return}
    const auth=authenticateReadOnlyPrincipal(req,relayDbPath)||authenticatePiaReadOnly(req);
    if(!auth){send(req,res,401,{ok:false,code:'unauthorized'});return}
    if(isStoreList(parts)){
      if(url.searchParams.size){send(req,res,400,{ok:false,code:'bad_query'});return}
      try{send(req,res,200,{ok:true,stores:listStores(canonicalDbPath,auth)})}catch{send(req,res,503,{ok:false,code:'allocation_data_unavailable'})}return;
    }
    const storeId=parts[3],date=parts[5];
    if(!validAllocationDate(date)){send(req,res,400,{ok:false,code:'bad_date'});return}
    let detail;try{detail=parseDetail(url.searchParams)}catch(error){send(req,res,400,{ok:false,code:error.message});return}
    try{
      const status=accessStore(canonicalDbPath,storeId,auth);
      if(status!==200){send(req,res,status,{ok:false,code:status===404?'store_not_found':'forbidden'});return}
    }catch{send(req,res,503,{ok:false,code:'allocation_data_unavailable'});return}
    const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort()};
    res.once('close',abort);
    try{
      const canCompute=auth.authType==='receiver'||auth.kind==='admin';
      const report=await allocation.analyzeStoreDay({storeId,date,detail,signal:controller.signal,allowCompute:canCompute});
      if(controller.signal.aborted)return;
      send(req,res,report.ok?200:report.code==='allocation_result_not_ready'?409:['day_not_found','store_not_found'].includes(report.code)?404:422,report.ok?{...report,access:{canCompute,mode:canCompute?'owner':'saved-read'}}:report);
    }catch(error){
      if(controller.signal.aborted)return;
      const code=String(error?.code||error?.message||'');
      const known=['bad_date','bad_machine','bad_detail','bad_count','allocation_busy','allocation_timeout','allocation_calculation_failed'];
      send(req,res,code.startsWith('bad_')?400:503,{ok:false,code:known.includes(code)?code:'allocation_unavailable'});
    }finally{res.removeListener('close',abort)}
  };
}
export const __test={parseDetail,accessStore};
