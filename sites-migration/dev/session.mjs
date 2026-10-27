// Imported only by import.meta.env.DEV branches. Never a hosted login method.
import{createSitesRelayStore}from'../lib/storage/relay-store.mjs';import{sha256Text}from'../lib/storage/recovery.mjs';import fixture from './fixture-data.json' with {type:'json'};
const cookieName='jugest-dev-session',ttl=3600000;
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'cache-control':'no-store',...headers}});
export async function readDevelopmentPrincipal(request,{enabled=false,db,bucket,now=Date.now}={}){
 if(!enabled||!db||!bucket)return null;
 const token=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const row=await createSitesRelayStore('development-session-v1',{db,bucket}).get(await sha256Text(token),{type:'json'});
 if(!row||row.expiresAt<=now())return null;
 return{channelId:row.channelId,token};
}
async function seed(db){
 const unrelated=await db.prepare("SELECT id FROM stores WHERE id NOT LIKE 'dev-%' LIMIT 1").first();if(unrelated)throw Error('development_database_not_empty');
 const when='2026-02-19T00:00:00.000Z',metadata=JSON.stringify({source:'pia-public-ranking-top',visibility:'public'});
 const statements=[];
 for(const[id,name]of[['dev-store-one','移植検証・第一店舗'],['dev-store-empty','移植検証・空の店舗']])statements.push(db.prepare('INSERT OR IGNORE INTO stores VALUES(?,?,?,?,?)').bind(id,name,metadata,when,when));
 for(const day of fixture.days){statements.push(db.prepare('INSERT OR IGNORE INTO store_days(store_id,business_date,parser_version,quality_status,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind('dev-store-one',day.date,'frozen-synthetic-fixture','valid',when,when));for(const row of day.machines)statements.push(db.prepare('INSERT OR IGNORE INTO machine_day_data VALUES(?,?,?,?)').bind('dev-store-one',day.date,row.tableNo,JSON.stringify(row)))}
 statements.push(db.prepare('INSERT OR IGNORE INTO client_snapshots VALUES(?,?,?,?,?,?,?)').bind('dev-store-one','store-analysis-default','vps-runtime-v1',fixture.days.at(-1).date,JSON.stringify(fixture.analysis),await sha256Text(JSON.stringify(fixture.analysis)),when));
 statements.push(db.prepare('INSERT OR IGNORE INTO client_snapshots VALUES(?,?,?,?,?,?,?)').bind('dev-store-one','store-latest-status','vps-runtime-v1',fixture.days.at(-1).date,JSON.stringify({status:'completed',generation:1,completedGeneration:1}),'synthetic-test-only',when));
 statements.push(db.prepare('INSERT OR IGNORE INTO analysis_receipts(id,store_id,target_date,component,version,input_hash,output_hash,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(1,'dev-store-one',fixture.days.at(-1).date,'daily','vps-runtime-v1',await sha256Text(JSON.stringify(fixture.days)),await sha256Text(JSON.stringify(fixture.analysis)),when));
 for(let i=0;i<statements.length;i+=50)await db.batch(statements.slice(i,i+50));
}
export async function handleDevelopmentSession(request,{enabled=false,db,bucket,now=Date.now}={}){
 if(!enabled)return new Response('Not Found',{status:404});
 if(request.method==='GET'){
  if(request.headers.get('accept')?.includes('text/html'))return new Response('<!doctype html><meta charset="utf-8"><title>独立した開発検証</title><h1>独立した開発検証</h1><p>テスト専用の店舗データと1時間の開発セッションを作成します。本番データは使いません。</p><form method="post"><button>検証用データで開始</button></form>',{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
  return json({enabled:true,authenticated:!!await readDevelopmentPrincipal(request,{enabled,db,bucket,now})});
 }
 if(request.method!=='POST')return json({ok:false,code:'method_not_allowed'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({ok:false,code:'origin_denied'},403);
 try{await seed(db)}catch(error){if(error.message==='development_database_not_empty')return json({ok:false,code:error.message},409);throw error}
 const token=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join(''),channelId='dev_'+crypto.randomUUID().replaceAll('-','');
 await createSitesRelayStore('juggler-relay-v1',{db,bucket}).setJSON('channel/'+channelId,{receiverHash:await sha256Text(token),revokedAt:null});
 await createSitesRelayStore('development-session-v1',{db,bucket}).setJSON(await sha256Text(token),{channelId,expiresAt:now()+ttl});
 return new Response(null,{status:303,headers:{location:'/','cache-control':'no-store','set-cookie':`${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`}});
}
