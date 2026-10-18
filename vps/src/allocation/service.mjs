import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {loadAllocationSnapshot} from './store-day.mjs';
import {AllocationResultStore} from './results.mjs';
import {getAllocationLikelihoodSourceHash} from './likelihoods.mjs';
import {createAllocationCalculator} from './calculator.mjs';

const VERSION='store-day-service-v1',ALPHA=.05;
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value?.[key]!==undefined).map(key=>[key,structuredClone(value[key])]));
export function validAllocationDate(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date}
export function principalFamilySize(groups){
  return Math.max(1,groups.reduce((total,group)=>{
    const n=group.nInstalled;
    return total+3*(Number.isInteger(n)&&n>0?new Set([n,Math.ceil(n/2),Math.ceil(n/3)]).size:3);
  },0));
}
function publicRow(row){return pick(row,['id','tableNo','machine','input','eligible','reasons','warnings','diffIssue','individual','neutral'])}
function publicGroup(group){return {...pick(group,['machine','machineName','nInstalled','nObserved','eligible','reasons','zeroGamesN','lowGamesN','diffN']),rows:(group.rows||[]).map(publicRow),result:null}}
function publicSnapshot(value){return pick(value,['inputHash','rosterHash','provenanceHash','rawHash','sourceHash','normalizedHash','normalizedPayloadHash','parserVersion','updatedAt','createdAt','date','businessDate','verificationScope','provenanceVersion','revisionHash'])}
function cleanRoster(value){return pick(value,['status','nInstalled','nObserved','nSupported','nUnsupported','reasons','hash','rosterHash','verified','scope','complete'])}
function safeQuality(value){return pick(value,['status','reasons','warnings','duplicateN','missingN','unknownN','zeroGamesN','lowGamesN','complete','verified','rawKind','canonicalRowsN','observedN','duplicates'])}

export function createAllocationService({rootDir,dbPath,rawRoot,loadSnapshot=loadAllocationSnapshot,calculate=null,resultStore=null,maxRequests=2}={}){
  if(!Number.isSafeInteger(maxRequests)||maxRequests<1||maxRequests>4)throw new TypeError('invalid_allocation_concurrency');
  const cache=resultStore||new AllocationResultStore({maxEntries:8,maxPayloadBytes:8*1024*1024});
  const calculator=calculate?null:createAllocationCalculator();
  const run=calculate||((input,options)=>calculator.calculate(input,options));
  let requests=0;
  async function analyzeSnapshot({storeId,date,detail=null,signal,allowCompute=true}={}){
    if(!validAllocationDate(date))throw Object.assign(new TypeError('bad_date'),{code:'bad_date'});
    if(typeof storeId!=='string'||!storeId.trim()||storeId.length>200)throw Object.assign(new TypeError('bad_store'),{code:'bad_store'});
    if(signal?.aborted)throw Object.assign(new Error('allocation_aborted'),{code:'allocation_aborted'});
    const source=await loadSnapshot({dbPath,rawRoot,storeId,date});
    if(signal?.aborted)throw Object.assign(new Error('allocation_aborted'),{code:'allocation_aborted'});
    if(!source.ok)return {ok:false,code:source.code||'allocation_data_unavailable'};
    const familySize=principalFamilySize(source.groups);
    if(detail){
      const group=source.groups.find(g=>g.machine===detail.machine);
      if(!group)throw Object.assign(new TypeError('bad_machine'),{code:'bad_machine'});
      detail={...detail,count:detail.count??group.nInstalled};
      if(!['456','56','6'].includes(detail.band)||!['exact','atLeast'].includes(detail.kind))throw Object.assign(new TypeError('bad_detail'),{code:'bad_detail'});
      if(!Number.isInteger(detail.count)||detail.count<(detail.kind==='exact'?0:1)||detail.count>group.nInstalled||detail.count>120)throw Object.assign(new TypeError('bad_count'),{code:'bad_count'});
    }
    const modelHash=hash([VERSION,...['../../../store-day-allocation.js','./likelihoods.mjs','../analysis/runtime-adapter.mjs','./worker.mjs','./service.mjs','./provenance.mjs','./store-day.mjs'].map(file=>readFileSync(new URL(file,import.meta.url),'utf8')),getAllocationLikelihoodSourceHash(rootDir)]);
    const scopeHash=hash({familySize,alpha:ALPHA,groups:source.groups.map(g=>[g.machine,g.nInstalled]),detail});
    const key={storeId,date,inputHash:source.snapshot.inputHash||hash(source.groups),rosterHash:source.snapshot.rosterHash||hash(source.roster),provenanceHash:source.snapshot.provenanceHash||'',modelHash,scopeHash};
    let cached;try{cached=cache.get(key)}catch{/* A cache outage is not a source-data failure. */}
    // Readers may inspect the last partial result. Owners must be able to retry
    // transient calculation failures without changing the source-data hash.
    const retryCalculation=allowCompute&&cached?.groups?.some(group=>group.reasons?.includes('calculation_failed'));
    if(cached&&!retryCalculation)return structuredClone(cached);
    const groups=source.groups.map(publicGroup);
    const eligible=source.groups.filter(group=>group.eligible&&group.nInstalled===group.rows.length&&group.rows.length>0&&group.rows.length<=120);
    if(eligible.length&&!allowCompute)return {ok:false,code:'allocation_result_not_ready'};
    for(const group of groups)if(group.eligible&&!eligible.some(g=>g.machine===group.machine)){
      group.eligible=false;group.reasons=[...(group.reasons||[]),group.nInstalled>120?'machine_size_limit':'roster_incomplete'];
    }
    const computed=eligible.length?await run({rootDir,groups:eligible,familySize,alpha:ALPHA,detail},{signal}):[];
    for(const item of computed){
      const group=groups.find(g=>g.machine===item.machine);if(!group)continue;
      if(item.errorCode||!item.result?.ok){group.eligible=false;group.reasons=[...(group.reasons||[]),'calculation_failed'];continue}
      group.result=item.result;group.rows=item.rows.map(publicRow);
      group.tableHash=item.tableHash;group.likelihoodSourceHash=item.sourceHash;
      group.differenceReference=item.differenceReference??null;
    }
    for(const group of groups)if(group.eligible&&!group.result){group.eligible=false;group.reasons=[...(group.reasons||[]),'calculation_failed']}
    const quality=safeQuality(source.quality),supportedGroupsCompleted=groups.length>0&&groups.every(group=>group.eligible&&group.result?.ok);
    if(!supportedGroupsCompleted)quality.status=groups.some(group=>group.result?.ok)?'partial':'held';
    const completed=supportedGroupsCompleted&&quality.status==='verified'&&!(source.unsupported||[]).length;
    const report={ok:true,version:VERSION,completed,supportedGroupsCompleted,store:pick(source.store,['id','name']),date,snapshot:{...publicSnapshot(source.snapshot),inputHash:key.inputHash,rosterHash:key.rosterHash,modelHash,scopeHash},roster:cleanRoster(source.roster),quality,groups,unsupported:(source.unsupported||[]).map(row=>pick(row,['id','tableNo','machine','machineName','reason','reasons','warnings','membershipVerified','observationVerified'])),familySize,alpha:ALPHA,strongEnabled:false,calibration:{status:'not-validated-for-real-world',strongEnabled:false},computedAt:new Date().toISOString()};
    if(allowCompute){try{cache.set(key,report)}catch{report.cacheWarning='result_cache_unavailable'}}
    return structuredClone(report);
  }
  async function analyzeStoreDay(args){
    if(requests>=maxRequests)throw Object.assign(new Error('allocation_busy'),{code:'allocation_busy'});
    requests++;
    try{return await analyzeSnapshot(args)}finally{requests--}
  }
  return {analyzeStoreDay,close(){calculator?.close();if(!resultStore)cache.close()}};
}
