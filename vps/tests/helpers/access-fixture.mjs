import {mkdtempSync,rmSync,writeFileSync,mkdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {createWebServer} from '../../src/web-server.mjs';
import {migrateAccessDatabase,createAccessStore} from '../../src/access/store.mjs';
import {openDatabase} from '../../src/db.mjs';
import {migrate} from '../../src/schema.mjs';
import {createRelayStore} from '../../src/relay-store.mjs';

export const ORIGIN='https://jugest.net',CHANNEL='channel_access_owner_123',TOKEN='owner-receiver-token-fixture';
// Test-only owner policy; enabling sharing explicitly rejects legacy public mode.
process.env.JUGEST_PIA_ACCESS_MODE='owner';process.env.JUGEST_PIA_OWNER_CHANNEL_IDS=CHANNEL;
export async function accessFixture(t,{trustLoopbackProxy=false}={}){
  const dir=mkdtempSync(join(tmpdir(),'jugest-access-api-')),dbPath=join(dir,'access.sqlite'),canonicalDbPath=join(dir,'jugest.sqlite'),relayDbPath=join(dir,'relay.sqlite'),root=join(dir,'web');
  mkdirSync(root);writeFileSync(join(root,'index.html'),'<title>JUGEST</title>');
  for(const file of ['pia.json','backup.json','data.json','access.sqlite','pia.csv','pia.json.gz'])writeFileSync(join(root,file),'PRIVATE_PIA_MARKER');
  mkdirSync(join(root,'public'));writeFileSync(join(root,'public','pia.json'),'PRIVATE_PIA_MARKER');
  symlinkSync(join(root,'pia.json'),join(root,'pia-alias.js'));
  writeFileSync(join(root,'.secret'),'PRIVATE_PIA_MARKER');symlinkSync(join(root,'.secret'),join(root,'secret-alias.css'));
  const db=openDatabase(canonicalDbPath);migrate(db);
  const date='2026-10-05',now='2026-10-06T10:00:00Z';
  for(const [id,source] of [['pia:35','pia-public-ranking-top'],['private','ana-slo-ios-relay']]){
    db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,JSON.stringify({source,collectorChannelId:CHANNEL,visibility:source.startsWith('pia')?'public':'private'}),now,now);
    db.prepare("INSERT INTO store_days(store_id,business_date,quality_status,created_at,updated_at) VALUES(?,?,'valid',?,?)").run(id,date,now,now);
    db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)').run(id,date,'1',JSON.stringify({tableNo:'3090',machine:'my',games:5000,bb:20,rb:18,diff:900}));
  }
  db.close();migrateAccessDatabase(dbPath);
  let clock=Date.parse(now);
  const store=createAccessStore({dbPath,now:()=>clock});
  const enroll=store.issueEnrollment({kind:'bootstrap'}),admin=store.registerCredential({enrollmentId:enroll.id,credential:{webauthnId:'test-credential',publicKey:Buffer.from('key'),counter:0}}),session=store.issueAdminSession(admin.id);
  const relay=createRelayStore('juggler-relay-v1',{dbPath:relayDbPath,root:'jugest'});
  await relay.setJSON(`channel/${CHANNEL}`,{receiverHash:createHash('sha256').update(TOKEN).digest('hex'),revokedAt:0});
  const server=createWebServer({rootDir:root,relayDbPath,canonicalDbPath,rawRoot:join(dir,'raw'),accessConfig:{dbPath,origin:ORIGIN,rpID:'jugest.net',trustLoopbackProxy,now:()=>clock}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{server.closeAllConnections?.();await new Promise(r=>server.close(r));store.close();rmSync(dir,{recursive:true,force:true})});
  const cookie='__Host-jugest_admin='+session.token;
  const request=(route,{body,method=body?'POST':'GET',cookie:jar=cookie,origin=ORIGIN,extra={}}={})=>fetch(base+route,{method,headers:{...(jar?{cookie:jar}:{}),...(body?{'content-type':'application/json','x-jugest-access':'1',origin}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});
  return {base,store,admin,cookie,request,dbPath,canonicalDbPath,now:()=>clock,advance:ms=>{clock+=ms},owner:{authorization:'Bearer '+TOKEN,'x-jugest-channel-id':CHANNEL}};
}
