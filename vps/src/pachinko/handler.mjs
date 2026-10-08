import {openPachinkoDatabase} from './schema.mjs';
import {getPachinkoMatrix,getPachinkoRecord,getPachinkoYutimeRanking} from './store.mjs';
import {MODELS,PACHINKO_STORE,PACHINKO_STORE_ID} from './models.mjs';
import {authenticateReceiver} from '../assistant-read-key.mjs';
import {canAccessStoreMetadata} from '../store-access.mjs';

const PUBLIC_PIA_METADATA=Object.freeze({source:'pia-public-ranking-top',visibility:'public'});
function send(req,res,status,payload,extra={}){const body=Buffer.from(JSON.stringify(payload));res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':String(body.length),'cache-control':'no-store','pragma':'no-cache','x-content-type-options':'nosniff',...extra});if(String(req.method||'GET').toUpperCase()==='HEAD')res.end();else res.end(body)}
function parts(pathname){try{const d=decodeURIComponent(pathname);if(d.includes('\0')||d.includes('\\'))return null;return d.split('/').filter(Boolean)}catch{return null}}
function errorCode(error){const msg=String(error?.message||error);if(msg.startsWith('invalid_pachinko_'))return {status:400,code:msg};if(['pachinko_readonly_database_missing','unsupported_pachinko_schema','not_an_independent_pachinko_database'].includes(msg))return {status:503,code:'pachinko_preparation_required'};return {status:500,code:'pachinko_read_failed'}}
function parseLimit(url){const raw=url.searchParams.get('limit');if(raw===null)return 30;if(!/^\d+$/u.test(raw))throw new Error('invalid_pachinko_limit');const n=Number(raw);if(!Number.isSafeInteger(n))throw new Error('invalid_pachinko_limit');return n}
async function defaultReceiver(req,relayDbPath){return relayDbPath?await authenticateReceiver(req,relayDbPath):null}

export function createPachinkoHandler({dbPath,relayDbPath=null,authenticatePia=()=>null,authorizeReceiver=defaultReceiver,accessOptions={},clock=()=>new Date()}={}){
  if(typeof dbPath!=='string'||!dbPath.trim())throw new TypeError('dbPath is required');
  if(typeof authenticatePia!=='function'||typeof authorizeReceiver!=='function')throw new TypeError('pachinko_auth_functions_required');
  return async function pachinkoHandler(req,res){
    const method=String(req.method||'GET').toUpperCase();
    if(!['GET','HEAD'].includes(method)){send(req,res,405,{ok:false,code:'method_not_allowed'},{allow:'GET, HEAD'});return}
    const url=new URL(req.url||'/','http://127.0.0.1'),p=parts(url.pathname);
    if(!p||p[0]!=='api'||p[1]!=='pachinko'){send(req,res,404,{ok:false,code:'not_found'});return}
    const piaPrincipal=authenticatePia(req);
    let receiver=null;
    if(!piaPrincipal)receiver=await authorizeReceiver(req,relayDbPath);
    if(!piaPrincipal&&!receiver){send(req,res,401,{ok:false,code:'unauthorized'});return}
    if(!piaPrincipal&&!canAccessStoreMetadata(PUBLIC_PIA_METADATA,receiver.channelId,accessOptions)){send(req,res,403,{ok:false,code:'forbidden'});return}
    let db;
    try{
      db=openPachinkoDatabase(dbPath,{readOnly:true});
      if(p.length===3&&p[2]==='stores'){
        const matrix=getPachinkoMatrix(db,{limit:1});
        send(req,res,200,{ok:true,stores:[{...PACHINKO_STORE,models:MODELS,latestSnapshot:matrix.latestSnapshot,modelSnapshots:matrix.modelSnapshots}]});return;
      }
      if(p[2]!=='stores'||p.length<4){send(req,res,404,{ok:false,code:'not_found'});return}
      const storeId=p[3];if(storeId!==PACHINKO_STORE_ID){send(req,res,404,{ok:false,code:'store_not_found'});return}
      if(p.length===5&&p[4]==='yutime'){
        send(req,res,200,{ok:true,...getPachinkoYutimeRanking(db,{now:clock()})});return;
      }
      if(p.length===5&&p[4]==='matrix'){
        const modelKey=String(url.searchParams.get('model')||'');const limit=parseLimit(url);
        const matrix=getPachinkoMatrix(db,{storeId,modelKey,limit});send(req,res,200,{ok:true,...matrix});return;
      }
      if(p.length===6&&p[4]==='records'){
        if(!/^\d+$/u.test(p[5])){send(req,res,400,{ok:false,code:'invalid_pachinko_record_id'});return}
        const record=getPachinkoRecord(db,Number(p[5]));if(!record){send(req,res,404,{ok:false,code:'record_not_found'});return}
        send(req,res,200,{ok:true,record});return;
      }
      send(req,res,404,{ok:false,code:'not_found'});
    }catch(error){const mapped=errorCode(error);send(req,res,mapped.status,{ok:false,code:mapped.code});}
    finally{try{db?.close()}catch{}}
  };
}

export const __test={parts,errorCode,parseLimit,PUBLIC_PIA_METADATA};
