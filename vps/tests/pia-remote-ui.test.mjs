import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {patchJugestIndexSource,__test as sourcePatchTest} from '../src/ui-source-patch.mjs';

const ROOT=resolve(fileURLToPath(new URL('../../',import.meta.url)));

const remoteMod=await import('../../vps-ui-remote-stores.mjs').catch(()=>({}));
const {createRemoteStoreCache}=remoteMod;

test('VPS source patch wires remote store cache into the existing store selector and data bridge',()=>{
  const source=readFileSync(resolve(ROOT,'index.html'),'utf8');
  const patched=patchJugestIndexSource(source);
  assert.match(patched,/vps-ui-remote-stores\.mjs/);
  assert.match(patched,/getStores:\(\)=>vpsMergedStoreRows\(\)/);
  assert.match(patched,/getStoreDates:\(name,limit\)=>vpsMergedStoreDates/);
  assert.match(patched,/getStoreDay:\(name,date\)=>vpsMergedStoreDay/);
  assert.match(patched,/setActiveStore:\(name,opts\)=>vpsSetActiveStore/);
});
test('remote PIA store metadata and overview are not shadowed by an empty local store-master shell',()=>{
  const previous=globalThis.JUGEST_VPS_REMOTE_STORES;
  const remoteRow={id:'pia:35',name:'PIA大船1',latestDate:'2026-10-03',dayCount:5,registered:true,enabled:true,error:false,remote:true};
  const remoteOverview={name:'PIA大船1',latestDate:'2026-10-03',storedDays:5,machineRows:106,totalG:530000,totalBB:1200,totalRB:900,collector:{registered:true,enabled:true,errorCode:'',missingDays:0,latestDate:'2026-10-03'}};
  globalThis.JUGEST_VPS_REMOTE_STORES={
    getStores(){return [remoteRow]},
    getOverview(name){return name===remoteRow.name?remoteOverview:null},
    getDates(){return ['2026-10-03']},
    getDay(){return {shop:remoteRow.name,date:'2026-10-03',rows:[]}}
  };
  try{
    const loadHelpers=new Function('v510KnownStoreRows','v510StoreDates','v510StoreOverview',`${sourcePatchTest.REMOTE_STORE_HELPER};return {vpsMergedStoreRows,vpsMergedStoreOverview};`);
    const emptyLocalRow={name:'PIA大船1',latestDate:'',registered:false,enabled:false,error:false};
    const emptyLocalOverview={name:'PIA大船1',latestDate:'',storedDays:0,machineRows:0,totalG:0,totalBB:0,totalRB:0,collector:{registered:false,enabled:false,errorCode:'',missingDays:0,latestDate:''}};
    const remoteHelpers=loadHelpers(()=>[emptyLocalRow],()=>[],()=>emptyLocalOverview);
    const mergedRow=remoteHelpers.vpsMergedStoreRows().find(row=>row.name==='PIA大船1');
    assert.equal(mergedRow.latestDate,'2026-10-03');
    assert.equal(mergedRow.registered,true);
    assert.equal(remoteHelpers.vpsMergedStoreOverview('PIA大船1').storedDays,5);
    assert.equal(remoteHelpers.vpsMergedStoreOverview('PIA大船1').machineRows,106);

    const localOverview={...emptyLocalOverview,latestDate:'2026-10-02',storedDays:1,machineRows:90,totalG:400000,collector:{registered:true,enabled:true,errorCode:'',missingDays:0,latestDate:'2026-10-02'}};
    const localHelpers=loadHelpers(()=>[{...emptyLocalRow,latestDate:'2026-10-02',registered:true,enabled:true}],()=>['2026-10-02'],()=>localOverview);
    assert.equal(localHelpers.vpsMergedStoreOverview('PIA大船1').storedDays,1,'real local day data must keep precedence');
    assert.equal(localHelpers.vpsMergedStoreRows()[0].latestDate,'2026-10-02','real local row metadata must keep precedence');
  }finally{
    if(previous===undefined)delete globalThis.JUGEST_VPS_REMOTE_STORES;
    else globalThis.JUGEST_VPS_REMOTE_STORES=previous;
  }
});

test('remote store cache exposes only public PIA native stores and normalizes daily machine rows',async()=>{
  assert.equal(typeof createRemoteStoreCache,'function','createRemoteStoreCache must exist');
  const client={
    async listStores(){return [
      {id:'pia:35',name:'PIA大船1',latestDate:'2026-09-20',dayCount:2,source:'pia-public-ranking-top',visibility:'public'},
      {id:'private:1',name:'私有店',latestDate:'2026-09-20',dayCount:1,source:'ana-slo-ios-relay',visibility:'private'}
    ]},
    async getStoreDaysById(id){assert.equal(id,'pia:35');return {days:[{date:'2026-09-19'},{date:'2026-09-20'}]}},
    async getStoreDayById(id,date){assert.equal(id,'pia:35');return {day:{date,machines:[{
      tableNo:'3090',machine:'my',sourceMachineName:'マイジャグラーV',games:4492,bb:9,rb:11,diff:-1993
    }]}}}
  };
  const cache=createRemoteStoreCache({client,eventTarget:new EventTarget()});
  await cache.refresh();
  assert.deepEqual(cache.getStores().map(x=>x.name),['PIA大船1']);
  assert.deepEqual(cache.getDates('PIA大船1',120),['2026-09-20','2026-09-19']);
  const day=cache.getDay('PIA大船1','2026-09-20');
  assert.equal(day.shop,'PIA大船1');
  assert.deepEqual(day.rows[0],{tableNo:'3090',machine:'my',machineName:'マイジャグラーV',games:4492,bb:9,rb:11,diff:-1993,expectedSetting:null,q:null});
});
test('browser analytics client can list remote stores, dates and one canonical day by store id',async()=>{
  const {createVpsAnalyticsClient}=await import('../../vps-browser-analytics.mjs');
  const calls=[];
  const payloads=new Map([
    ['/api/vps/stores',{ok:true,stores:[{id:'pia:35',name:'PIA大船1'}]}],
    ['/api/vps/stores/pia%3A35/days?limit=120',{ok:true,days:[{date:'2026-09-20'}]}],
    ['/api/vps/stores/pia%3A35/days/2026-09-20',{ok:true,day:{date:'2026-09-20',machines:[]}}]
  ]);
  const fetchFn=async url=>{const path=new URL(url,'https://jugest.test').pathname+new URL(url,'https://jugest.test').search;calls.push(path);return {ok:true,status:200,async json(){return payloads.get(path)}}};
  const storage={getItem(){return JSON.stringify({linked:true,channelId:'channel_test_123456',receiverToken:'token'});}};
  const client=createVpsAnalyticsClient({fetchFn,storage,baseUrl:'/api/vps'});
  assert.deepEqual((await client.listStores()).map(x=>x.id),['pia:35']);
  assert.deepEqual((await client.getStoreDaysById('pia:35',{limit:120})).days.map(x=>x.date),['2026-09-20']);
  assert.equal((await client.getStoreDayById('pia:35','2026-09-20')).day.date,'2026-09-20');
  assert.deepEqual(calls,[...payloads.keys()]);
});
test('selecting an uncached older PIA date fetches it and emits an update for the existing data screen',async()=>{
  const target=new EventTarget(),calls=[];
  const client={
    async listStores(){return [{id:'pia:35',name:'PIA大船1',latestDate:'2026-09-20',dayCount:2,source:'pia-public-ranking-top',visibility:'public'}]},
    async getStoreDaysById(){return {days:[{date:'2026-09-19'},{date:'2026-09-20'}]}},
    async getStoreDayById(id,date){calls.push(date);return {day:{date,machines:[{tableNo:date.endsWith('19')?'3089':'3090',machine:'my',sourceMachineName:'マイジャグラーV',games:4000,bb:18,rb:15,diff:500}]}}}
  };
  const cache=createRemoteStoreCache({client,eventTarget:target});
  await cache.refresh();
  assert.deepEqual(calls,['2026-09-20'],'refresh should preload only the latest day');
  const updated=new Promise(resolve=>target.addEventListener('jugest:vps-remote-updated',resolve,{once:true}));
  const pending=cache.getDay('PIA大船1','2026-09-19');
  assert.deepEqual(pending.rows,[]);
  await updated;
  assert.equal(cache.getDay('PIA大船1','2026-09-19').rows[0].tableNo,'3089');
  assert.deepEqual(calls,['2026-09-20','2026-09-19']);
});
test('remote PIA cache enriches canonical rows with the existing server judgement result',async()=>{
  const client={
    async listStores(){return [{id:'pia:35',name:'PIA大船1',latestDate:'2026-09-20',dayCount:1,source:'pia-public-ranking-top',visibility:'public'}]},
    async getStoreDaysById(){return {days:[{date:'2026-09-20'}]}},
    async getStoreDayById(){return {day:{date:'2026-09-20',machines:[{tableNo:'3090',machine:'my',sourceMachineName:'マイジャグラーV',games:4492,bb:9,rb:11,diff:-1993}]}}},
    async judgeMachines(rows){assert.equal(rows[0].tableNo,'3090');return {machines:[{ok:true,index:0,tableNo:'3090',expectedSetting:4.25,q:[0.05,0.1,0.15,0.2,0.2,0.3]}]}}
  };
  const cache=createRemoteStoreCache({client,eventTarget:new EventTarget()});
  await cache.refresh();
  const row=cache.getDay('PIA大船1','2026-09-20').rows[0];
  assert.equal(row.expectedSetting,4.25);
  assert.deepEqual(row.q,[0.05,0.1,0.15,0.2,0.2,0.3]);
});
test('browser analytics client delegates PIA row judgement to the protected batch endpoint',async()=>{
  const seen=[];
  const fetchFn=async(url,options={})=>{seen.push({url,options});return {ok:true,status:200,async json(){return {ok:true,judgeVersion:'external-juggler-browser-parity-v1',machines:[{ok:true,index:0,tableNo:'3090',expectedSetting:4.25,q:[0,0,0,0,0,1]}]}}}};
  const storage={getItem(){return JSON.stringify({linked:true,channelId:'channel_test_123456',receiverToken:'token'});}};
  const {createVpsAnalyticsClient}=await import('../../vps-browser-analytics.mjs');
  const client=createVpsAnalyticsClient({fetchFn,storage,baseUrl:'/api/vps'});
  const result=await client.judgeMachines([{tableNo:'3090',machine:'my',games:4492,bb:9,rb:11,diff:-1993}]);
  assert.equal(result.machines[0].expectedSetting,4.25);
  assert.equal(seen[0].options.method,'POST');
  assert.equal(new URL(seen[0].url,'https://jugest.test').pathname,'/api/vps/judge/machines');
  assert.deepEqual(JSON.parse(seen[0].options.body).machines[0].tableNo,'3090');
});
