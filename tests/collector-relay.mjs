import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const kv = new Map();
const mockStore = {
  async get(key,{type}={}) { const v=kv.get(key); if(v==null)return null; return type==='json'?JSON.parse(JSON.stringify(v)):v; },
  async setJSON(key,val,{onlyIfNew}={}) { if(onlyIfNew&&kv.has(key))return{modified:false}; kv.set(key,JSON.parse(JSON.stringify(val))); return{modified:true}; },
  async delete(key){kv.delete(key)},
  async list({prefix=''}){ return {blobs:[...kv.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}; }
};
let src=fs.readFileSync(new URL('./fixtures/legacy-netlify/functions/relay.mjs',import.meta.url),'utf8');
src=src.replace("import { getStore } from '@netlify/blobs';", "const getStore=()=>globalThis.__mockStore;");
src=src.replace("import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';", "const {createHash,randomBytes,randomInt,timingSafeEqual}=globalThis.__crypto;");
src=src.replace('export default async (req) => {','const __handler = async (req) => {');
src=src.replace('export const config = {','const config = {');
src+='\nglobalThis.__handler=__handler;';
const ctx={__mockStore:mockStore,__crypto:{createHash,randomBytes,randomInt,timingSafeEqual},Request,Response,URL,Buffer,console,setTimeout,clearTimeout};
vm.createContext(ctx); vm.runInContext(src,ctx);
const handler=ctx.__handler;
async function call(body){const r=await handler(new Request('https://jugglerest.netlify.app/api/relay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})); return {status:r.status,j:await r.json()};}
const __jst=new Date(Date.now()+9*60*60*1000); __jst.setUTCDate(__jst.getUTCDate()-1); const testYesterday=__jst.toISOString().slice(0,10); const [testY,testM,testD]=testYesterday.split('-'); const testSlash=`${testY}/${+testM}/${+testD}`;

// Legacy Collector bridge remains intact.
const a=await call({action:'createPair'}); if(!a.j.ok)throw new Error('createPair');
const b=await call({action:'claimPair',code:a.j.code}); if(!b.j.ok)throw new Error('claimPair');
const payload={format:'juggler-external-import-bulk',version:7,source:'ana-slo',shop:'テスト店',sourceStoreId:'テスト店',days:[{date:'2026-09-02',sourceUrl:'x',machines:[{machine:'my',category:'juggler',sourceMachineName:'マイジャグラーV',tableNo:'1',games:5000,diff:100,bb:20,rb:18}]}]};
const c=await call({action:'collectorPush',channelId:b.j.channelId,senderToken:b.j.senderToken,payload}); if(!c.j.ok||c.j.acceptedDates[0]!=='2026-09-02')throw new Error('push');
const d=await call({action:'collectorPull',channelId:a.j.channelId,receiverToken:a.j.receiverToken,sinceRevision:0,limit:45}); if(!d.j.ok||d.j.items.length!==1||d.j.items[0].day.machines[0].tableNo!=='1')throw new Error('pull');
const e=await call({action:'collectorStatus',channelId:a.j.channelId,receiverToken:a.j.receiverToken}); if(!e.j.ok||e.j.days!==1)throw new Error('status');
const f=await call({action:'unlink',channelId:a.j.channelId,receiverToken:a.j.receiverToken}); if(!f.j.ok)throw new Error('unlink');
if([...kv.keys()].some(k=>k.startsWith(`collector-day/${a.j.channelId}/`)||k===`collector-index/${a.j.channelId}`))throw new Error('cleanup');

// iPhone-only Collector: no PC/Python, no 6-digit pairing required.
const ios=await call({action:'createIosCollector'});
if(!ios.j.ok||!ios.j.collectorKey||!ios.j.channelId||!ios.j.receiverToken)throw new Error('createIosCollector');
const cfg=await call({action:'iosCollectorConfigure',channelId:ios.j.channelId,receiverToken:ios.j.receiverToken,stores:[{shop:'エスパス日拓新宿歌舞伎町店',sourceStoreId:'エスパス日拓新宿歌舞伎町店',slug:'%e3%82%a8%e3%82%b9%e3%83%91%e3%82%b9-data-test',startDate:testYesterday}]});
if(!cfg.j.ok||cfg.j.stores.length!==1)throw new Error('ios configure');
const next=await call({action:'iosCollectorNext',collectorKey:ios.j.collectorKey});
if(!next.j.ok||!next.j.hasJob||next.j.job.date!==testYesterday)throw new Error('ios next');
if([...kv.keys()].some(k=>k.startsWith(`ios-job/${ios.j.channelId}/`)))throw new Error('legacy next must not leak opaque job records');
const text=`\n全データ一覧\n機種名\n台番号\nG数\n差枚\nBB\nRB\nART\n合成確率\nBB確率\nRB確率\nART確率\nマイジャグラーV\n601\n2,727\n-94\n11\n7\n0\n1/151.5\n1/247.9\n1/389.6\n1/0.0\nファンキージャグラー2\n760\n5,584\n-694\n20\n13\n0\n1/169.2\n1/279.2\n1/429.5\n1/0.0\nキングハナハナ-30\n1315\n5,353\n-1,092\n17\n14\n0\n1/172.7\n1/314.9\n1/382.4\n1/0.0\n機種別データピックアップ\n`;
const push=await call({action:'iosCollectorHtmlPush',collectorKey:ios.j.collectorKey,sourceStoreId:next.j.job.sourceStoreId,date:next.j.job.date,text});
if(!push.j.ok||push.j.machines!==3||push.j.quality.inputMode!=='text')throw new Error('ios text push');
const pull2=await call({action:'collectorPull',channelId:ios.j.channelId,receiverToken:ios.j.receiverToken,sinceRevision:0,limit:45});
if(!pull2.j.ok||pull2.j.items.length!==1||pull2.j.items[0].day.machines.length!==3)throw new Error('ios pull');
const status2=await call({action:'collectorStatus',channelId:ios.j.channelId,receiverToken:ios.j.receiverToken});
if(!status2.j.ok||status2.j.iosConfiguredStores.length!==1)throw new Error('ios status');
const unlink2=await call({action:'unlink',channelId:ios.j.channelId,receiverToken:ios.j.receiverToken});
if(!unlink2.j.ok)throw new Error('ios unlink');
if([...kv.keys()].some(k=>k.includes(ios.j.channelId)&&k.startsWith('ios-collector-config/')))throw new Error('ios cleanup');


// v5.0.3: dedicated target UI contract, opaque job tokens, identity guard, manual-priority scheduling and 5-slot smoothing.
const v3=await call({action:'createIosCollector'});
if(!v3.j.ok)throw new Error('v503 create');
const oldKey=v3.j.collectorKey;
const rotated=await call({action:'rotateIosCollectorKey',channelId:v3.j.channelId,receiverToken:v3.j.receiverToken});
if(!rotated.j.ok||rotated.j.collectorKey===oldKey)throw new Error('v503 rotate');
const oldDenied=await call({action:'iosCollectorNextV2',collectorKey:oldKey});
if(oldDenied.status!==401)throw new Error('old key must be revoked');
const key503=rotated.j.collectorKey;
const highUrl=`https://ana-slo.com/${testYesterday}-%E6%9C%80%E5%84%AA%E5%85%88%E5%BA%97-data/`;
const normalUrl=`https://ana-slo.com/${testYesterday}-%E9%80%9A%E5%B8%B8%E5%BA%97-data/`;
const addHigh=await call({action:'iosCollectorTargetUpsert',channelId:v3.j.channelId,receiverToken:v3.j.receiverToken,url:highUrl,startDate:testYesterday,priority:3,enabled:true});
const addNormal=await call({action:'iosCollectorTargetUpsert',channelId:v3.j.channelId,receiverToken:v3.j.receiverToken,url:normalUrl,startDate:testYesterday,priority:2,enabled:true});
if(!addHigh.j.ok||!addNormal.j.ok||addNormal.j.stores.length!==2)throw new Error('v503 target upsert');
const v3status0=await call({action:'collectorStatus',channelId:v3.j.channelId,receiverToken:v3.j.receiverToken,sinceRevision:0});
if(v3status0.j.iosTargets.length!==2||v3status0.j.pending!==0)throw new Error('v503 initial target status');
const j1=await call({action:'iosCollectorNextV2',collectorKey:key503});
if(!j1.j.ok||j1.j.state!=='RUN'||!j1.j.jobToken||!j1.j.url.includes('最優先店')||j1.j.transportMode!=='raw_unicode'||j1.j.waitSeconds<0||j1.j.waitSeconds>800)throw new Error('v503 high priority next');
const wrong=`${testSlash}\n別の店舗\n${text}`;
const wrongPush=await call({action:'iosCollectorPushV2',collectorKey:key503,jobToken:j1.j.jobToken,text:wrong});
if(wrongPush.status!==422||wrongPush.j.code!=='page_identity'||wrongPush.j.requestedShop!=='最優先店'||wrongPush.j.requestedDate!==testYesterday||typeof wrongPush.j.shopMatch!=='boolean'||typeof wrongPush.j.dateMatch!=='boolean'||!String(wrongPush.j.requestedUrl||'').includes('ana-slo.com')||!Number.isFinite(+wrongPush.j.textLength)||!Number.isFinite(+wrongPush.j.textBytes)||!Number.isFinite(+wrongPush.j.parsedMachines)||!String(wrongPush.j.textPreview||'').length)throw new Error('v503 detailed identity diagnostics');
const j2=await call({action:'iosCollectorNextV2',collectorKey:key503});
if(!j2.j.ok||j2.j.state!=='RUN'||!j2.j.url.includes('通常店')||j2.j.transportMode!=='raw_unicode')throw new Error('v503 retry must not stall other store');
const correct=`${testSlash}\n通常店\n${text}`;
const goodPush=await call({action:'iosCollectorPushV2',collectorKey:key503,jobToken:j2.j.jobToken,text:correct});
if(!goodPush.j.ok||goodPush.j.state!=='SAVED'||goodPush.j.machines!==3)throw new Error('v503 opaque push');
const v3status1=await call({action:'collectorStatus',channelId:v3.j.channelId,receiverToken:v3.j.receiverToken,sinceRevision:0});
if(v3status1.j.pending!==1||v3status1.j.days!==1)throw new Error('v503 server pending');
const normalTarget=v3status1.j.iosTargets.find(x=>x.shop==='通常店');
if(!normalTarget||normalTarget.latestDate!==testYesterday||normalTarget.priority!==2)throw new Error('v503 target summary');
const v3pull=await call({action:'collectorPull',channelId:v3.j.channelId,receiverToken:v3.j.receiverToken,sinceRevision:0,limit:45});
if(v3pull.j.items.length!==1||v3pull.j.items[0].day.machines.length!==3)throw new Error('v503 manual pull source');
const delNormal=await call({action:'iosCollectorTargetDelete',channelId:v3.j.channelId,receiverToken:v3.j.receiverToken,sourceStoreId:normalTarget.sourceStoreId});
if(!delNormal.j.ok||delNormal.j.stores.length!==1)throw new Error('v503 target delete');
await call({action:'unlink',channelId:v3.j.channelId,receiverToken:v3.j.receiverToken});

// v5.0.3 iOS URL transport diagnostic: raw Unicode first, then uppercase percent fallback after a real upstream 400.
const tr=await call({action:'createIosCollector'});
const trUrl=`https://ana-slo.com/${testYesterday}-%E6%97%A5%E6%9C%AC%E5%BA%97-data/`;
const trAdd=await call({action:'iosCollectorTargetUpsert',channelId:tr.j.channelId,receiverToken:tr.j.receiverToken,url:trUrl,startDate:testYesterday,priority:2,enabled:true});
if(!trAdd.j.ok)throw new Error('transport target');
const tr1=await call({action:'iosCollectorNextV2',collectorKey:tr.j.collectorKey});
if(tr1.j.state!=='RUN'||tr1.j.transportMode!=='raw_unicode'||!tr1.j.url.includes('日本店'))throw new Error('transport raw unicode first');
const trFail=await call({action:'iosCollectorPushV2',collectorKey:tr.j.collectorKey,jobToken:tr1.j.jobToken,text:'400 Bad Request cloudflare',fetchUrl:tr1.j.url});
if(trFail.status!==422||trFail.j.code!=='upstream_http_400'||trFail.j.transportMode!=='raw_unicode'||trFail.j.fetchUrlMatchesExpected!==true)throw new Error('transport 400 diagnostics');
const trFailureKey=[...kv.keys()].find(k=>k.startsWith(`ios-failure/${tr.j.channelId}/`));
if(!trFailureKey)throw new Error('transport failure state');
const trFailure=kv.get(trFailureKey); trFailure.nextRetryAt=0; kv.set(trFailureKey,trFailure);
const tr2=await call({action:'iosCollectorNextV2',collectorKey:tr.j.collectorKey});
if(tr2.j.state!=='RUN'||tr2.j.transportMode!=='upper_percent'||!/%E6%97%A5%E6%9C%AC%E5%BA%97/.test(tr2.j.url))throw new Error('transport upper percent fallback');
await call({action:'unlink',channelId:tr.j.channelId,receiverToken:tr.j.receiverToken});

// v5.0.4: header-driven parser supports all public ana-slo layouts without shifting columns.
async function layoutRoundTrip(name, bodyText, expected) {
  const c=await call({action:'createIosCollector'});
  const u=`https://ana-slo.com/${testYesterday}-${encodeURIComponent(name)}-data/`;
  const add=await call({action:'iosCollectorTargetUpsert',channelId:c.j.channelId,receiverToken:c.j.receiverToken,url:u,startDate:testYesterday,priority:2,enabled:true});
  if(!add.j.ok)throw new Error(`layout add ${name}`);
  const job=await call({action:'iosCollectorNextV2',collectorKey:c.j.collectorKey});
  if(job.j.state!=='RUN')throw new Error(`layout job ${name}`);
  const pushed=await call({action:'iosCollectorPushV2',collectorKey:c.j.collectorKey,jobToken:job.j.jobToken,text:`${testSlash}\n${name}\n${bodyText}`,fetchUrl:job.j.url});
  if(!pushed.j.ok||pushed.j.state!=='SAVED'||pushed.j.machines!==1)throw new Error(`layout push ${name}: ${JSON.stringify(pushed.j)}`);
  if(pushed.j.quality?.parserBuild!=='v504-header-driven-1')throw new Error(`layout parser build ${name}`);
  const pull=await call({action:'collectorPull',channelId:c.j.channelId,receiverToken:c.j.receiverToken,sinceRevision:0,limit:45});
  const row=pull.j.items?.[0]?.day?.machines?.[0];
  if(!row)throw new Error(`layout row ${name}`);
  for(const [k,v] of Object.entries(expected))if(row[k]!==v)throw new Error(`layout ${name} ${k}: ${row[k]} !== ${v}`);
  await call({action:'unlink',channelId:c.j.channelId,receiverToken:c.j.receiverToken});
}
const layoutTail='\nART\n合成確率\nBB確率\nRB確率\nART確率';
await layoutRoundTrip('完全形式店',`全データ一覧\n機種名\n台番号\nG数\n差枚\nBB\nRB${layoutTail}\nマイジャグラーV\n514\n5,353\n-1,092\n17\n14\n0\n1/172.7\n1/314.9\n1/382.4\n1/0.0\n機種別データピックアップ`,{tableNo:'514',games:5353,diff:-1092,bb:17,rb:14,gamesSource:'observed',diffSource:'observed'});
await layoutRoundTrip('差枚非公開店',`全データ一覧\n機種名\n台番号\nG数\nBB\nRB${layoutTail}\nマイジャグラーV\n515\n6,200\n23\n19\n0\n1/147.6\n1/269.6\n1/326.3\n1/0.0\n機種別データピックアップ`,{tableNo:'515',games:6200,diff:null,bb:23,rb:19,gamesSource:'observed',diffSource:'missing'});
await layoutRoundTrip('G非公開店',`全データ一覧\n機種名\n台番号\n差枚\nBB\nRB\nマイジャグラーV\n516\n+408\n38\n29\n機種別データピックアップ`,{tableNo:'516',games:null,diff:408,bb:38,rb:29,gamesSource:'missing',diffSource:'observed'});

// A page with target rows but no trustworthy headers must be rejected instead of guessing a shifted schema.
{
  const c=await call({action:'createIosCollector'}),name='見出し欠損店',u=`https://ana-slo.com/${testYesterday}-${encodeURIComponent(name)}-data/`;
  await call({action:'iosCollectorTargetUpsert',channelId:c.j.channelId,receiverToken:c.j.receiverToken,url:u,startDate:testYesterday,priority:2,enabled:true});
  const job=await call({action:'iosCollectorNextV2',collectorKey:c.j.collectorKey});
  const bad=await call({action:'iosCollectorPushV2',collectorKey:c.j.collectorKey,jobToken:job.j.jobToken,text:`${testSlash}\n${name}\n全データ一覧\nマイジャグラーV\n601\n5000\n20\n15`,fetchUrl:job.j.url});
  if(bad.status!==422||bad.j.code!=='parse_empty'||bad.j.quality?.schemaGuard!=='header_required')throw new Error('header guard must reject unknown schema');
  await call({action:'unlink',channelId:c.j.channelId,receiverToken:c.j.receiverToken});
}

// Manual latest-date requeue lets a corrected parser reacquire an already-saved day without resetting the whole collector.
{
  const c=await call({action:'createIosCollector'}),name='再取得テスト店',u=`https://ana-slo.com/${testYesterday}-${encodeURIComponent(name)}-data/`;
  await call({action:'iosCollectorTargetUpsert',channelId:c.j.channelId,receiverToken:c.j.receiverToken,url:u,startDate:testYesterday,priority:2,enabled:true});
  const job=await call({action:'iosCollectorNextV2',collectorKey:c.j.collectorKey});
  const body=`${testSlash}\n${name}\n全データ一覧\n機種名\n台番号\nG数\nBB\nRB\nマイジャグラーV\n600\n5,000\n20\n15\n機種別データピックアップ`;
  const saved=await call({action:'iosCollectorPushV2',collectorKey:c.j.collectorKey,jobToken:job.j.jobToken,text:body,fetchUrl:job.j.url});
  if(!saved.j.ok)throw new Error('requeue seed save');
  const rq=await call({action:'iosCollectorRequeueDate',channelId:c.j.channelId,receiverToken:c.j.receiverToken,sourceStoreId:(await call({action:'collectorStatus',channelId:c.j.channelId,receiverToken:c.j.receiverToken})).j.iosTargets[0].sourceStoreId,date:testYesterday});
  if(!rq.j.ok||rq.j.requeued!==true)throw new Error('requeue action');
  const st=await call({action:'collectorStatus',channelId:c.j.channelId,receiverToken:c.j.receiverToken});
  if(st.j.days!==0||st.j.iosTargets[0].missingDays<1)throw new Error('requeue status');
  const again=await call({action:'iosCollectorNextV2',collectorKey:c.j.collectorKey});
  if(again.j.state!=='RUN'||again.j.url.indexOf(name)<0)throw new Error('requeue next job');
  await call({action:'unlink',channelId:c.j.channelId,receiverToken:c.j.receiverToken});
}

// Five jobs max inside one 15-minute window. Random offsets are 0..800 sec and at least ~60 sec apart.
const slot=await call({action:'createIosCollector'}), slotStores=[];
for(let i=0;i<6;i++)slotStores.push({shop:`Store ${i}`,sourceStoreId:`store-${i}`,slug:`store-${i}`,startDate:testYesterday,priority:2,enabled:true});
const slotCfg=await call({action:'iosCollectorConfigure',channelId:slot.j.channelId,receiverToken:slot.j.receiverToken,stores:slotStores});
if(!slotCfg.j.ok||slotCfg.j.stores.length!==6)throw new Error('slot configure');
const waits=[];
for(let i=0;i<5;i++){const x=await call({action:'iosCollectorNextV2',collectorKey:slot.j.collectorKey});if(x.j.state!=='RUN')throw new Error(`slot run ${i}`);waits.push(x.j.waitSeconds)}
for(let i=0;i<waits.length;i++){if(waits[i]<0||waits[i]>800)throw new Error('slot wait range');if(i&&waits[i]-waits[i-1]<55)throw new Error(`slot spacing ${waits}`)}
const sixth=await call({action:'iosCollectorNextV2',collectorKey:slot.j.collectorKey});
if(sixth.j.state!=='WAIT'||sixth.j.reason!=='rate_limit'||!(sixth.j.waitSeconds>0&&sixth.j.waitSeconds<=900))throw new Error(`slot sixth must wait for next window: ${JSON.stringify(sixth.j)}`);
await call({action:'unlink',channelId:slot.j.channelId,receiverToken:slot.j.receiverToken});

// A live 20-minute lease is temporary, so NextV2 must WAIT rather than claim collection is DONE.
{
  const c=await call({action:'createIosCollector'}),name='lease-wait店',u=`https://ana-slo.com/${testYesterday}-${encodeURIComponent(name)}-data/`;
  await call({action:'iosCollectorTargetUpsert',channelId:c.j.channelId,receiverToken:c.j.receiverToken,url:u,startDate:testYesterday,priority:2,enabled:true});
  const first=await call({action:'iosCollectorNextV2',collectorKey:c.j.collectorKey});
  if(first.j.state!=='RUN')throw new Error('lease wait seed RUN');
  const blocked=await call({action:'iosCollectorNextV2',collectorKey:c.j.collectorKey});
  if(blocked.j.state!=='WAIT'||blocked.j.reason!=='lease'||!(blocked.j.waitSeconds>0&&blocked.j.waitSeconds<=1200))throw new Error(`lease must WAIT: ${JSON.stringify(blocked.j)}`);
  await call({action:'unlink',channelId:c.j.channelId,receiverToken:c.j.receiverToken});
}

// A failed fetch enters backoff. That is temporary too, so NextV2 must WAIT until retry time.
{
  const c=await call({action:'createIosCollector'}),name='backoff-wait店',u=`https://ana-slo.com/${testYesterday}-${encodeURIComponent(name)}-data/`;
  await call({action:'iosCollectorTargetUpsert',channelId:c.j.channelId,receiverToken:c.j.receiverToken,url:u,startDate:testYesterday,priority:2,enabled:true});
  const first=await call({action:'iosCollectorNextV2',collectorKey:c.j.collectorKey});
  if(first.j.state!=='RUN')throw new Error('backoff wait seed RUN');
  const failed=await call({action:'iosCollectorPushV2',collectorKey:c.j.collectorKey,jobToken:first.j.jobToken,text:'400 Bad Request cloudflare',fetchUrl:first.j.url});
  if(failed.j.code!=='upstream_http_400')throw new Error('backoff wait seed failure');
  const blocked=await call({action:'iosCollectorNextV2',collectorKey:c.j.collectorKey});
  if(blocked.j.state!=='WAIT'||blocked.j.reason!=='backoff'||!(blocked.j.waitSeconds>0&&blocked.j.waitSeconds<=900))throw new Error(`backoff must WAIT: ${JSON.stringify(blocked.j)}`);
  await call({action:'unlink',channelId:c.j.channelId,receiverToken:c.j.receiverToken});
}

// DONE is reserved for a genuinely exhausted target (the only requested day is already saved).
{
  const c=await call({action:'createIosCollector'}),name='done-complete店',u=`https://ana-slo.com/${testYesterday}-${encodeURIComponent(name)}-data/`;
  await call({action:'iosCollectorTargetUpsert',channelId:c.j.channelId,receiverToken:c.j.receiverToken,url:u,startDate:testYesterday,priority:2,enabled:true});
  const first=await call({action:'iosCollectorNextV2',collectorKey:c.j.collectorKey});
  if(first.j.state!=='RUN')throw new Error('done complete seed RUN');
  const body=`${testSlash}\n${name}\n全データ一覧\n機種名\n台番号\nG数\nBB\nRB\nマイジャグラーV\n700\n5,000\n20\n15\n機種別データピックアップ`;
  const saved=await call({action:'iosCollectorPushV2',collectorKey:c.j.collectorKey,jobToken:first.j.jobToken,text:body,fetchUrl:first.j.url});
  if(!saved.j.ok)throw new Error('done complete seed save');
  const done=await call({action:'iosCollectorNextV2',collectorKey:c.j.collectorKey});
  if(done.j.state!=='DONE'||done.j.reason!=='complete')throw new Error(`saved target must be DONE: ${JSON.stringify(done.j)}`);
  await call({action:'unlink',channelId:c.j.channelId,receiverToken:c.j.receiverToken});
}

console.log('relay collector integration PASS');
