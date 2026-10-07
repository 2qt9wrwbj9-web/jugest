import {createHash} from 'node:crypto';
import {MODELS,PACHINKO_STORE_ID,identifyPachinkoModel} from './models.mjs';
import {inspectPachinkoRaw,pachinkoInteger} from './estimator.mjs';

export function canonicalPachinkoJson(value){
  if(Array.isArray(value))return `[${value.map(item=>canonicalPachinkoJson(item)).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalPachinkoJson(value[key])}`).join(',')}}`;
  const encoded=JSON.stringify(value);if(encoded===undefined)throw new TypeError('pachinko_raw_must_be_json');return encoded;
}
export function pachinkoSha256(value){return createHash('sha256').update(value).digest('hex')}
export function validPachinkoDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(value))return null;
  const time=Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?value:null;
}
function validTime(value){return typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/u.test(value)}
export function pachinkoScope(options={}){
  const keys=options.scopeModelKeys??options.provenance?.scopeModelKeys??MODELS.map(model=>model.key);
  if(!Array.isArray(keys)||keys.length===0||new Set(keys).size!==keys.length||keys.some(key=>!MODELS.some(model=>model.key===key)))throw new Error('invalid_pachinko_model_scope');
  return MODELS.filter(model=>keys.includes(model.key)).map(model=>model.key);
}
export function pachinkoMachineIdentity(raw){
  const model=identifyPachinkoModel(raw),id=pachinkoInteger(raw?.store_machine_id),no=pachinkoInteger(raw?.machine_no);
  if(!model||id===null||id<=0||no===null||no<=0)return null;
  return JSON.stringify([PACHINKO_STORE_ID,String(id),String(no),model.sisMachineCode,model.key]);
}
export function pachinkoRecordFingerprint(raw){
  const identity=pachinkoMachineIdentity(raw);if(!identity)throw new Error('invalid_pachinko_record_identity');
  return pachinkoSha256(canonicalPachinkoJson({identity,raw}));
}
export const fingerprint=pachinkoRecordFingerprint;
export const identity=pachinkoMachineIdentity;

export function validatePachinkoSnapshot(payload,options={}){
  if(!payload||payload.status!==0||!Array.isArray(payload.ranking))throw new Error('invalid_pachinko_payload_status_or_ranking');
  const date=validPachinkoDate(payload.server_date_time?.date),time=payload.server_date_time?.time;
  if(!date||!validTime(time))throw new Error('invalid_pachinko_server_date_time');
  const maxRows=options.maxRows??20000;
  if(!Number.isSafeInteger(maxRows)||maxRows<=0||maxRows>20000)throw new Error('invalid_pachinko_row_limit');
  if(payload.ranking.length===0||payload.ranking.length>=maxRows||payload.truncated===true||payload.has_more===true||payload.pagination?.has_more===true)throw new Error('pachinko_truncated_or_empty_response');
  const scopeModelKeys=pachinkoScope(options),groups=new Map(),allGroups=new Map();
  for(const row of payload.ranking){
    if(!row||typeof row!=='object'||Array.isArray(row)||!(row.store_id===35||row.store_id==='35'))throw new Error('pachinko_unexpected_store_or_row');
    const no=pachinkoInteger(row.machine_no),id=pachinkoInteger(row.store_machine_id);
    if(no===null||no<=0||id===null||id<=0||typeof row.name!=='string'||!row.name.trim()||typeof row.sis_machine_code!=='string'||!row.sis_machine_code)throw new Error('invalid_pachinko_row_identity');
    const inspection=inspectPachinkoRaw(row);if(inspection.diagnostics.length)throw new Error(`invalid_pachinko_raw:${inspection.diagnostics.join(',')}`);
    const allIdentity=JSON.stringify([String(id),String(no),row.sis_machine_code]);
    const count=(allGroups.get(allIdentity)??0)+1;allGroups.set(allIdentity,count);
    if(count>30)throw new Error('pachinko_history_count_exceeds_30');
    const model=identifyPachinkoModel(row);if(!model||!scopeModelKeys.includes(model.key))continue;
    const machineIdentity=pachinkoMachineIdentity(row);
    if(!groups.has(machineIdentity))groups.set(machineIdentity,{identity:machineIdentity,machine_model_key:model.key,machine_no:String(no),store_machine_id:String(id),sis_machine_code:model.sisMachineCode,raw_machine_name:row.name,rows:[]});
    groups.get(machineIdentity).rows.push(row);
  }
  const modelCounts=scopeModelKeys.map(key=>({machine_model_key:key,machine_count:[...groups.values()].filter(group=>group.machine_model_key===key).length,row_count:[...groups.values()].filter(group=>group.machine_model_key===key).reduce((n,group)=>n+group.rows.length,0)}));
  if(modelCounts.some(count=>count.machine_count===0))throw new Error('pachinko_missing_target_model');
  if(options.minMachineCount!==undefined&&(!Number.isSafeInteger(options.minMachineCount)||options.minMachineCount<1||groups.size<options.minMachineCount))throw new Error('pachinko_machine_count_too_small');
  const content={...payload,ranking:payload.ranking.map(canonicalPachinkoJson).sort()};delete content.server_date_time;
  return {snapshotDate:date,snapshotTime:time,serverDate:date,serverTime:time,serverDateTime:`${date}T${time}+09:00`,rowCount:payload.ranking.length,machineCount:groups.size,scopeModelKeys,modelCounts,contentHash:pachinkoSha256(canonicalPachinkoJson(content)),groups};
}

function transition(group,reason,details={}){
  return {identity:group.identity,machine_model_key:group.machine_model_key,machine_no:group.machine_no,store_machine_id:group.store_machine_id,reason,diagnostics:details};
}
function multiset(rows){const result=new Map();for(const raw of rows){const key=pachinkoRecordFingerprint(raw);const entry=result.get(key)??{count:0,raw};entry.count++;result.set(key,entry)}return result}
function differences(previous,current){
  const before=multiset(previous),after=multiset(current),added=[],removed=[];
  for(const [key,entry] of after){const count=entry.count-(before.get(key)?.count??0);for(let n=0;n<count;n++)added.push({fingerprint:key,raw:entry.raw})}
  for(const [key,entry] of before){const count=entry.count-(after.get(key)?.count??0);for(let n=0;n<count;n++)removed.push({fingerprint:key,raw:entry.raw})}
  return {added,removed};
}
export function derivePachinkoDay(previous,current,options={}){
  const currentPayload=current?.payload??current,previousPayload=previous?.payload??previous;
  const now=validatePachinkoSnapshot(currentPayload,{...options,scopeModelKeys:options.scopeModelKeys??current?.scopeModelKeys??options.provenance?.scopeModelKeys});
  const diagnostics={ready:false,snapshotDate:now.snapshotDate,scopeModelKeys:now.scopeModelKeys,comparableCount:0,rollingCount:0,noChangeCount:0,newMachineCount:0,removedMachineCount:0,oneAddCoverage:0,populationCoverage:0,minimumCoverage:0.95};
  const result={businessDate:null,assignments:[],diagnostics,transitions:[]};
  if(!previousPayload){result.transitions=[...now.groups.values()].map(group=>transition(group,'initial_snapshot'));return result}
  const prior=validatePachinkoSnapshot(previousPayload,{...options,scopeModelKeys:options.previousScopeModelKeys??previous?.scopeModelKeys??now.scopeModelKeys});
  const scope=now.scopeModelKeys.filter(key=>prior.scopeModelKeys.includes(key));
  const prev=new Map([...prior.groups].filter(([,group])=>scope.includes(group.machine_model_key))),next=new Map([...now.groups].filter(([,group])=>scope.includes(group.machine_model_key)));
  const gap=(Date.parse(`${now.snapshotDate}T00:00:00Z`)-Date.parse(`${prior.snapshotDate}T00:00:00Z`))/86400000;diagnostics.dayGap=gap;
  if(gap!==1){const reason=gap===0?'same_day':gap<0?'backwards_date':'acquisition_gap';result.transitions=[...next.values()].map(group=>transition(group,reason,{dayGap:gap}));return result}
  const candidates=[];
  for(const [key,group] of next){
    const before=prev.get(key);
    if(!before){
      diagnostics.newMachineCount++;
      const installed=[...prev.values()].some(old=>old.machine_model_key===group.machine_model_key&&old.machine_no===group.machine_no&&old.store_machine_id!==group.store_machine_id);
      const moved=[...prev.values()].some(old=>old.machine_model_key===group.machine_model_key&&old.store_machine_id===group.store_machine_id&&old.machine_no!==group.machine_no);
      result.transitions.push(transition(group,installed?'installation_changed':moved?'machine_no_changed':'new_machine'));continue;
    }
    diagnostics.comparableCount++;
    if(before.rows.length!==group.rows.length){result.transitions.push(transition(group,'history_window_changed',{previousCount:before.rows.length,currentCount:group.rows.length}));continue}
    const diff=differences(before.rows,group.rows);
    if(diff.added.length===1&&diff.removed.length===1){
      diagnostics.rollingCount++;
      candidates.push({...transition(group,'candidate'),...diff.added[0],date_status:'derived',date_assignment_method:'consecutive_snapshot_multiset_previous_day'});
    }else{
      if(diff.added.length===0&&diff.removed.length===0)diagnostics.noChangeCount++;
      result.transitions.push(transition(group,diff.added.length===0&&diff.removed.length===0?'no_change':'multiple_or_unbalanced_difference',{addedCount:diff.added.length,removedCount:diff.removed.length}));
    }
  }
  for(const [key,group] of prev)if(!next.has(key)){diagnostics.removedMachineCount++;result.transitions.push(transition(group,'removed_machine'))}
  let population=0;
  for(const modelKey of scope){
    const before=[...prev.values()].filter(group=>group.machine_model_key===modelKey),after=[...next.values()].filter(group=>group.machine_model_key===modelKey);
    // A wholly new installation is unresolved separately; a response missing most
    // of an existing model must not shrink the comparable population denominator.
    if(after.some(group=>prev.has(group.identity)))population+=Math.max(before.length,after.length);
  }
  diagnostics.populationCount=population;
  diagnostics.oneAddCoverage=diagnostics.comparableCount?diagnostics.rollingCount/diagnostics.comparableCount:0;
  diagnostics.populationCoverage=population?diagnostics.comparableCount/population:0;
  diagnostics.ready=diagnostics.comparableCount>0&&diagnostics.oneAddCoverage>=0.95&&diagnostics.populationCoverage>=0.95;
  if(diagnostics.ready){result.businessDate=prior.snapshotDate;result.assignments=candidates.map(({reason,diagnostics:unused,...assignment})=>assignment)}
  else for(const candidate of candidates)result.transitions.push(transition(candidate,'insufficient_population_coverage',{oneAddCoverage:diagnostics.oneAddCoverage,populationCoverage:diagnostics.populationCoverage}));
  return result;
}
