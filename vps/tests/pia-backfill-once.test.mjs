import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {ingestCollectorDay} from '../src/ingest/canonical-ingest.mjs';
import {backfillPiaRollingHistory,shouldBackfillPiaRollingHistory} from '../src/collectors/pia-backfill-once.mjs';
import {normalizePiaJugglerRow,PIA_PARSER_BUILD} from '../src/collectors/pia-public.mjs';

function row({no,name,code,id}){const games=1200+id*17,bb=5+(id%18),rb=4+(id%15),specialOut=120,out=specialOut+games*3,diff=(id-15)*31;return {store_id:35,machine_no:no,name,sis_machine_code:code,store_machine_id:no,special:bb,start:rb,final_start:id,special_1:bb,special_2:0,special_2d:rb,special_out:specialOut,special_safe:0,out,safe:out+diff,difference:diff}}
function snapshot(){const ranking=[];for(const [no,name,code] of [[3090,'ＳマイジャグラーⅤＫＤ','00087'],[3118,'Ｓゴーゴージャグラー３ＫＡ','00088']])for(let id=1;id<=30;id++)ranking.push(row({no,name,code,id}));return {status:0,ranking,server_date_time:{date:'2026-09-22',time:'07:00:00'}}}
function response(data){return {ok:true,status:200,text:async()=>JSON.stringify(data)}}
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'jugest-pia-backfill-')),db=openDatabase(join(dir,'db.sqlite'));migrate(db);return {dir,db,rawRoot:join(dir,'raw'),close:async()=>{db.close();await rm(dir,{recursive:true,force:true})}}}
async function seedAnchor(f,data=snapshot()){
  const machines=[data.ranking[29],data.ranking[59]].map(normalizePiaJugglerRow);
  const day={date:'2026-09-21',source:'pia-public',sourceUrl:'test',parserBuild:PIA_PARSER_BUILD,machines,quality:{score:100,grade:'A',warnings:[],totalMachines:2,parserBuild:PIA_PARSER_BUILD}};
  await ingestCollectorDay(f.db,{rawRoot:f.rawRoot,source:'pia-public-ranking-top',sourceStoreId:'pia:35',shop:'PIA大船1',date:'2026-09-21',parserBuild:PIA_PARSER_BUILD,revision:1,day,rawText:JSON.stringify(data),nowIso:'2026-09-22T00:00:00.000Z',sourceMetadata:{visibility:'public',marker:'keep-me'}});
}

test('verified 2026-09-21 anchor backfills missing 29 days oldest to newest',async()=>{const f=await fixture();try{const data=snapshot();await seedAnchor(f,data);const before=f.db.prepare('SELECT source_metadata_json FROM stores WHERE id=?').get('pia:35').source_metadata_json;assert.equal(shouldBackfillPiaRollingHistory(f.db).attempt,true);const result=await backfillPiaRollingHistory(f.db,{rawRoot:f.rawRoot,fetchImpl:async()=>response(data),minMachineCount:2,nowIso:'2026-09-22T00:10:00.000Z'});assert.equal(result.status,'backfilled');assert.equal(result.addedDays,29);assert.equal(result.anchorMatches,2);const days=f.db.prepare("SELECT business_date FROM store_days WHERE store_id=? ORDER BY business_date").all('pia:35').map(x=>x.business_date);assert.equal(days.length,30);assert.equal(days[0],'2026-08-23');assert.equal(days.at(-1),'2026-09-21');assert.equal(f.db.prepare("SELECT COUNT(*) n FROM machine_day_data WHERE store_id=? AND business_date=?").get('pia:35','2026-08-23').n,2);assert.equal(f.db.prepare('SELECT source_metadata_json FROM stores WHERE id=?').get('pia:35').source_metadata_json,before);assert.equal(shouldBackfillPiaRollingHistory(f.db).reason,'complete')}finally{await f.close()}});

test('anchor mismatch fails closed before adding historical days',async()=>{const f=await fixture();try{const data=snapshot();await seedAnchor(f,data);const bad=structuredClone(data);bad.ranking[29]={...bad.ranking[29],difference:999999};await assert.rejects(()=>backfillPiaRollingHistory(f.db,{rawRoot:f.rawRoot,fetchImpl:async()=>response(bad),minMachineCount:2}),/anchor mismatch/);assert.deepEqual(f.db.prepare("SELECT business_date FROM store_days WHERE store_id=? ORDER BY business_date").all('pia:35').map(x=>x.business_date),['2026-09-21'])}finally{await f.close()}});
