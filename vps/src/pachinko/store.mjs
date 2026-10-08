import {gzipSync,gunzipSync} from 'node:zlib';
import {MODELS,PACHINKO_STORE,PACHINKO_STORE_ID,identifyPachinkoModel} from './models.mjs';
import {estimatePachinko,poolPachinkoEstimates,PACHINKO_NUMERIC_FIELDS,pachinkoInteger} from './estimator.mjs';
import {canonicalPachinkoJson,pachinkoMachineIdentity,pachinkoRecordFingerprint,pachinkoSha256,validatePachinkoSnapshot,derivePachinkoDay} from './snapshot.mjs';

const DERIVED_FIELDS=['normal_out','normal_safe','net_consumption','estimated_k','estimator_id','estimator_version','estimator_status','sample_size','confidence'];
const MACHINE_FIELDS=['identity','machine_model_key','machine_no','store_machine_id','sis_machine_code','raw_machine_name'];
const UNDATED_LIMIT=200;
function parse(value){return JSON.parse(value)}
function payloadOf(snapshot){return parse(gunzipSync(snapshot.raw_payload_gzip).toString('utf8'))}
function snapshotMeta(snapshot){
  if(!snapshot)return null;
  return {id:snapshot.id,snapshot_id:snapshot.id,store_id:snapshot.store_id,observed_at:snapshot.observed_at,imported_at:snapshot.imported_at,
    server_date:snapshot.server_date,server_time:snapshot.server_time,raw_sha256:snapshot.raw_sha256,content_hash:snapshot.content_hash,
    provenance:parse(snapshot.provenance_json),scopeModelKeys:parse(snapshot.scope_model_keys_json),collector_version:snapshot.collector_version,
    status:snapshot.status,collectionReady:!!snapshot.collection_ready,business_date:snapshot.business_date,assigned_count:snapshot.assigned_count,diagnostics:parse(snapshot.diagnostics_json)};
}
function compact(row,day=null){
  return {record_id:row.id,business_date:day?.business_date??null,...Object.fromEntries(MACHINE_FIELDS.map(key=>[key,row[key]])),
    start:row.start,difference:row.difference,...Object.fromEntries(DERIVED_FIELDS.map(key=>[key,row[key]])),
    date_status:day?.date_status??null,date_assignment_method:day?.date_assignment_method??null,
    previous_snapshot_id:day?.previous_snapshot_id??null,current_snapshot_id:day?.current_snapshot_id??null};
}
function transaction(db,fn){db.exec('BEGIN IMMEDIATE;');try{const result=fn();db.exec('COMMIT;');return result}catch(error){try{db.exec('ROLLBACK;')}catch{}throw error}}
function validateQuery({storeId=PACHINKO_STORE_ID,modelKey='',limit=30}={}){
  if(storeId!==PACHINKO_STORE_ID)throw new Error('invalid_pachinko_store');
  if(typeof modelKey!=='string'||(modelKey&&!MODELS.some(model=>model.key===modelKey)))throw new Error('invalid_pachinko_model');
  if(!Number.isSafeInteger(limit)||limit<1||limit>30)throw new Error('invalid_pachinko_limit');
  return {storeId,modelKey,limit};
}
function resultOf(snapshot,status=snapshot.status){return {snapshotId:snapshot.id,status,businessDate:snapshot.business_date,assignedCount:snapshot.assigned_count,collectionReady:!!snapshot.collection_ready,diagnostics:parse(snapshot.diagnostics_json)}}

function retainedOccurrences(previous,current,gap){
  const retained=new Map();if(gap!==0&&gap!==1)return retained;
  const groupRows=rows=>{
    const groups=new Map();for(const row of rows){if(!groups.has(row.identity))groups.set(row.identity,[]);groups.get(row.identity).push(row)}return groups;
  };
  const before=groupRows(previous),after=groupRows(current);
  for(const [identity,rows] of after){
    const prior=before.get(identity);if(!prior)continue;
    const previousCount=prior.reduce((n,row)=>n+row.occurrence_count,0),currentCount=rows.reduce((n,row)=>n+row.occurrence_count,0);
    const sameWindow=previousCount===currentCount,growingWindow=gap===1&&previousCount>0&&previousCount<30&&currentCount===previousCount+1;
    if(!sameWindow&&!growingWindow)continue;
    const oldCounts=new Map(prior.map(row=>[row.id,row])),newCounts=new Map(rows.map(row=>[row.id,row]));
    const added=rows.reduce((n,row)=>n+Math.max(0,row.occurrence_count-(oldCounts.get(row.id)?.occurrence_count??0)),0);
    const removed=prior.reduce((n,row)=>n+Math.max(0,row.occurrence_count-(newCounts.get(row.id)?.occurrence_count??0)),0);
    // An unchanged next-day zero multiset can hide a replacement. A same-day
    // duplicate observation has no new day to infer and can retain its evidence.
    if(!(sameWindow&&added===1&&removed===1)&&!(growingWindow&&added===1&&removed===0)&&!(gap===0&&sameWindow&&added===0&&removed===0))continue;
    for(const row of rows){
      const old=oldCounts.get(row.id);if(!old)continue;
      // A removed identical occurrence may have been the dated one; consume
      // that evidence first instead of assigning it to a later reappearance.
      const known=Math.max(0,old.dated_occurrence_count-Math.max(0,old.occurrence_count-row.occurrence_count));
      if(known)retained.set(row.id,known);
    }
  }
  return retained;
}

function dayNumber(date){const n=Date.parse(`${date}T00:00:00.000Z`);return Number.isFinite(n)?Math.trunc(n/86400000):null}
export function pachinkoBootstrapStatus(db,modelKey,{expectedMachineCount,requiredDays=30,minimumCoverage=1}={}){
  if(!MODELS.some(model=>model.key===modelKey))throw new Error('invalid_pachinko_model');
  const expected=Number(expectedMachineCount);if(!Number.isSafeInteger(expected)||expected<1)throw new Error('invalid_pachinko_expected_machine_count');
  if(!Number.isSafeInteger(requiredDays)||requiredDays<1||requiredDays>365)throw new Error('invalid_pachinko_required_days');
  const need=Math.ceil(expected*minimumCoverage),rows=db.prepare('SELECT business_date,COUNT(DISTINCT identity) n FROM p_machine_days WHERE store_id=? AND machine_model_key=? GROUP BY business_date ORDER BY business_date').all(PACHINKO_STORE_ID,modelKey);
  let run=0,best=0,last=null,completedThrough=null;
  for(const row of rows){
    if(Number(row.n)<need){run=0;last=null;continue}
    const day=dayNumber(row.business_date);if(day===null){run=0;last=null;continue}
    run=last!==null&&day===last+1?run+1:1;last=day;if(run>best)best=run;if(run>=requiredDays)completedThrough=row.business_date;
  }
  return {complete:best>=requiredDays,requiredDays,contiguousDays:best,minimumMachinesPerDay:need,expectedMachineCount:expected,completedThrough};
}

export function importPachinkoSnapshot(db,{payload,rawText,observedAt,provenance={},collectorVersion='pachinko-domain-v1',bootstrapWindowEdges=false}={}){
  if(!provenance||typeof provenance!=='object'||Array.isArray(provenance))throw new TypeError('invalid_pachinko_provenance');
  const meta=validatePachinkoSnapshot(payload,{provenance});
  const raw=rawText??JSON.stringify(payload);if(typeof raw!=='string')throw new TypeError('pachinko_raw_text_required');
  let rawPayload;try{rawPayload=JSON.parse(raw)}catch{throw new Error('invalid_pachinko_raw_json')}
  if(canonicalPachinkoJson(rawPayload)!==canonicalPachinkoJson(payload))throw new Error('pachinko_raw_payload_mismatch');
  const importedAt=new Date().toISOString(),observation=observedAt??(provenance.observed_at_unknown===true?null:importedAt);
  if(observation!==null&&(typeof observation!=='string'||!Number.isFinite(Date.parse(observation))))throw new Error('invalid_pachinko_observed_at');
  if(typeof collectorVersion!=='string'||!collectorVersion)throw new Error('invalid_pachinko_collector_version');
  const rawHash=pachinkoSha256(raw),scopeJson=JSON.stringify(meta.scopeModelKeys),provenanceJson=canonicalPachinkoJson(provenance);
  return transaction(db,()=>{
    const existing=db.prepare('SELECT * FROM p_snapshots WHERE raw_sha256=? AND scope_model_keys_json=?').get(rawHash,scopeJson);
    if(existing)return resultOf(existing,'duplicate');
    const inserted=db.prepare(`INSERT INTO p_snapshots(store_id,observed_at,imported_at,server_date,server_time,raw_payload_gzip,raw_sha256,content_hash,collector_version,provenance_json,scope_model_keys_json,row_count,machine_count,status,diagnostics_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'pending','{}')`)
      .run(PACHINKO_STORE_ID,observation,importedAt,meta.snapshotDate,meta.snapshotTime,gzipSync(raw),rawHash,meta.contentHash,collectorVersion,provenanceJson,scopeJson,meta.rowCount,meta.machineCount);
    const snapshotId=Number(inserted.lastInsertRowid);
    const columns=['fingerprint','store_id',...MACHINE_FIELDS,'raw_json',...PACHINKO_NUMERIC_FIELDS,...DERIVED_FIELDS,'diagnostics_json'];
    const insertRecord=db.prepare(`INSERT INTO p_records(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')}) ON CONFLICT(fingerprint) DO NOTHING`);
    const getRecord=db.prepare('SELECT id FROM p_records WHERE fingerprint=?'),members=new Map(),memberInfo=new Map();
    for(const group of meta.groups.values())for(const row of group.rows){
      const fingerprint=pachinkoRecordFingerprint(row),estimate=estimatePachinko(group.machine_model_key,row);
      const record={fingerprint,store_id:PACHINKO_STORE_ID,...Object.fromEntries(MACHINE_FIELDS.map(key=>[key,group[key]])),raw_json:canonicalPachinkoJson(row),
        ...Object.fromEntries(PACHINKO_NUMERIC_FIELDS.map(key=>[key,pachinkoInteger(row[key])])),...estimate,diagnostics_json:JSON.stringify(estimate.diagnostics)};
      insertRecord.run(...columns.map(key=>record[key]));
      const id=getRecord.get(fingerprint).id;members.set(id,(members.get(id)??0)+1);memberInfo.set(id,{id,identity:group.identity,machine_model_key:group.machine_model_key});
    }
    const addMember=db.prepare('INSERT INTO p_snapshot_members(snapshot_id,record_id,occurrence_count) VALUES(?,?,?)');
    for(const [id,count] of members)addMember.run(snapshotId,id,count);
    const currentMembers=[...members].map(([id,count])=>({...memberInfo.get(id),occurrence_count:count}));
    const readMembers=db.prepare('SELECT r.id,r.identity,r.machine_model_key,m.occurrence_count,m.dated_occurrence_count FROM p_snapshot_members m JOIN p_records r ON r.id=m.record_id WHERE m.snapshot_id=?');
    const priorMemberCache=new Map(),knownOccurrences=new Map(),newAssignments=new Map();
    const anchors=new Map(db.prepare('SELECT * FROM p_model_anchors').all().map(anchor=>[anchor.model_key,anchor]));
    const modelResults=[],transitions=[];
    const setAnchor=db.prepare('INSERT INTO p_model_anchors(model_key,snapshot_id,server_date) VALUES(?,?,?) ON CONFLICT(model_key) DO UPDATE SET snapshot_id=excluded.snapshot_id,server_date=excluded.server_date');
    const snapshotById=db.prepare('SELECT * FROM p_snapshots WHERE id=?'),snapshotCache=new Map();
    const anchorSnapshot=id=>{if(!snapshotCache.has(id))snapshotCache.set(id,snapshotById.get(id));return snapshotCache.get(id)};
    let assignedCount=0;const businessDates=new Set();
    const addDay=db.prepare('INSERT INTO p_machine_days(store_id,business_date,identity,machine_no,store_machine_id,machine_model_key,record_id,previous_snapshot_id,current_snapshot_id,date_status,date_assignment_method) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    const existingDay=db.prepare('SELECT record_id FROM p_machine_days WHERE store_id=? AND business_date=? AND machine_no=?');
    const markKnownInSnapshot=db.prepare('UPDATE p_snapshot_members SET dated_occurrence_count=MIN(occurrence_count,dated_occurrence_count+1) WHERE snapshot_id=? AND record_id=?');
    for(const key of meta.scopeModelKeys){
      const anchor=anchors.get(key),currentModelGroups=[...meta.groups.values()].filter(group=>group.machine_model_key===key);
      if(!anchor){
        setAnchor.run(key,snapshotId,meta.snapshotDate);modelResults.push({machine_model_key:key,status:'seeded',ready:true,previous_snapshot_id:null,bootstrap:pachinkoBootstrapStatus(db,key,{expectedMachineCount:currentModelGroups.length})});
        for(const group of currentModelGroups)transitions.push({previousSnapshotId:null,...group,reason:'initial_snapshot',diagnostics:{}});
        continue;
      }
      const previousId=anchor.snapshot_id,priorDate=anchor.server_date,priorSnapshot=anchorSnapshot(previousId);
      const priorRows=payloadOf(priorSnapshot).ranking.filter(row=>identifyPachinkoModel(row)?.key===key);
      const previous={status:0,server_date_time:{date:priorDate,time:'00:00:00'},ranking:priorRows};
      const derived=derivePachinkoDay(previous,payload,{scopeModelKeys:[key]});
      const gap=derived.diagnostics.dayGap;
      if(!priorMemberCache.has(previousId))priorMemberCache.set(previousId,readMembers.all(previousId));
      const carried=retainedOccurrences(priorMemberCache.get(previousId).filter(row=>row.machine_model_key===key),currentMembers.filter(row=>row.machine_model_key===key),gap);
      for(const [id,count] of carried)knownOccurrences.set(id,count);
      for(const transition of derived.transitions)transitions.push({...transition,previousSnapshotId:previousId});
      let conflicts=false;
      const bootstrapBefore=pachinkoBootstrapStatus(db,key,{expectedMachineCount:currentModelGroups.length});
      const candidateAssignments=[...derived.assignments.map(assignment=>({...assignment,business_date:derived.businessDate,bootstrapEdge:false})),...(!bootstrapWindowEdges||bootstrapBefore.complete?[]:derived.removedAssignments.map(assignment=>({...assignment,bootstrapEdge:true})))];
      for(const assignment of candidateAssignments){
        const recordId=getRecord.get(assignment.fingerprint)?.id;if(!recordId)throw new Error('pachinko_assignment_record_missing');
        const date=assignment.business_date,existing=existingDay.get(PACHINKO_STORE_ID,date,assignment.machine_no);
        if(existing){
          if(existing.record_id!==recordId){conflicts=true;transitions.push({...assignment,previousSnapshotId:previousId,reason:'day_conflict',diagnostics:{existingRecordId:existing.record_id,incomingRecordId:recordId,businessDate:date,bootstrapEdge:assignment.bootstrapEdge}})}
          continue;
        }
        addDay.run(PACHINKO_STORE_ID,date,assignment.identity,assignment.machine_no,assignment.store_machine_id,assignment.machine_model_key,recordId,previousId,snapshotId,assignment.date_status,assignment.date_assignment_method);
        if(assignment.bootstrapEdge)markKnownInSnapshot.run(previousId,recordId);else newAssignments.set(recordId,(newAssignments.get(recordId)??0)+1);
        assignedCount++;businessDates.add(date);
      }
      const previousGroups=validatePachinkoSnapshot(previous,{scopeModelKeys:[key]}).groups;
      const hasComparable=currentModelGroups.some(group=>previousGroups.has(group.identity)),whollyNew=gap===1&&!hasComparable;
      const ready=!conflicts&&(derived.diagnostics.ready||gap>1||gap===0||whollyNew);
      const status=conflicts?'day_conflict':derived.diagnostics.ready?'derived':gap>1?'gap_seeded':gap===0?'same_day':whollyNew?'installation_seeded':gap<0?'backwards_date':'not_ready';
      if(ready&&gap!==0)setAnchor.run(key,snapshotId,meta.snapshotDate);
      modelResults.push({machine_model_key:key,status,ready,previous_snapshot_id:previousId,diagnostics:derived.diagnostics,bootstrap:pachinkoBootstrapStatus(db,key,{expectedMachineCount:currentModelGroups.length})});
    }
    const writeKnown=db.prepare('UPDATE p_snapshot_members SET dated_occurrence_count=? WHERE snapshot_id=? AND record_id=?');
    for(const [id,count] of members){const known=Math.min(count,(knownOccurrences.get(id)??0)+(newAssignments.get(id)??0));if(known)writeKnown.run(known,snapshotId,id)}
    const insertTransition=db.prepare('INSERT INTO p_transitions(current_snapshot_id,previous_snapshot_id,identity,machine_model_key,machine_no,store_machine_id,reason,diagnostics_json) VALUES(?,?,?,?,?,?,?,?)');
    for(const t of transitions)insertTransition.run(snapshotId,t.previousSnapshotId,t.identity,t.machine_model_key,t.machine_no,t.store_machine_id,t.reason,JSON.stringify(t.diagnostics));
    const collectionReady=meta.scopeModelKeys.length===MODELS.length&&modelResults.every(result=>result.ready);
    const status=assignedCount>0?'derived':modelResults.some(result=>!result.ready)?'not_ready':modelResults.some(result=>result.status==='gap_seeded')?'gap_seeded':modelResults.every(result=>result.status==='same_day')?'same_day':'seeded';
    const businessDate=businessDates.size===1?[...businessDates][0]:null;
    const diagnostics={ready:collectionReady,scopeModelKeys:meta.scopeModelKeys,rowCount:meta.rowCount,machineCount:meta.machineCount,modelResults,transitionCount:transitions.length};
    db.prepare('UPDATE p_snapshots SET status=?,collection_ready=?,business_date=?,assigned_count=?,diagnostics_json=? WHERE id=?').run(status,collectionReady?1:0,businessDate,assignedCount,JSON.stringify(diagnostics),snapshotId);
    return {snapshotId,status,businessDate,assignedCount,collectionReady,diagnostics};
  });
}


export function reconcilePachinkoBusinessDates(db,{modelKeys=['OUMI5_SPECIAL_ALTA'],requiredDays=30,dryRun=true}={}){
  if(!Array.isArray(modelKeys)||!modelKeys.length||new Set(modelKeys).size!==modelKeys.length||modelKeys.some(key=>!MODELS.some(model=>model.key===key)))throw new Error('invalid_pachinko_model_scope');
  if(!Number.isSafeInteger(requiredDays)||requiredDays<1||requiredDays>365)throw new Error('invalid_pachinko_required_days');
  const run=()=>{
    const getRecord=db.prepare('SELECT id FROM p_records WHERE fingerprint=?'),existingDay=db.prepare('SELECT record_id FROM p_machine_days WHERE store_id=? AND business_date=? AND machine_no=?');
    const addDay=db.prepare('INSERT INTO p_machine_days(store_id,business_date,identity,machine_no,store_machine_id,machine_model_key,record_id,previous_snapshot_id,current_snapshot_id,date_status,date_assignment_method) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    const markKnown=db.prepare('UPDATE p_snapshot_members SET dated_occurrence_count=MIN(occurrence_count,dated_occurrence_count+1) WHERE snapshot_id=? AND record_id=?');
    const setAnchor=db.prepare('INSERT INTO p_model_anchors(model_key,snapshot_id,server_date) VALUES(?,?,?) ON CONFLICT(model_key) DO UPDATE SET snapshot_id=excluded.snapshot_id,server_date=excluded.server_date');
    const allSnapshots=db.prepare("SELECT s.* FROM p_snapshots s WHERE s.store_id=? AND EXISTS(SELECT 1 FROM json_each(s.scope_model_keys_json) scope WHERE scope.value=?) ORDER BY s.server_date,s.server_time,s.id");
    const result={dryRun,requiredDays,inserted:0,existing:0,conflicts:0,models:[]};
    for(const key of modelKeys){
      const rawSnapshots=allSnapshots.all(PACHINKO_STORE_ID,key),byDate=new Map();for(const snapshot of rawSnapshots)byDate.set(snapshot.server_date,snapshot);
      const snapshots=[...byDate.values()].sort((a,b)=>a.server_date.localeCompare(b.server_date)||a.server_time.localeCompare(b.server_time)||a.id-b.id);
      if(!snapshots.length){result.models.push({machine_model_key:key,snapshotCount:0,inserted:0,conflicts:0,bootstrap:null});continue}
      const latestMeta=validatePachinkoSnapshot(payloadOf(snapshots.at(-1)),{scopeModelKeys:[key]}),expectedMachineCount=[...latestMeta.groups.values()].filter(group=>group.machine_model_key===key).length;
      const modelResult={machine_model_key:key,snapshotCount:snapshots.length,pairs:0,readyPairs:0,inserted:0,addedInserted:0,removedInserted:0,existing:0,conflicts:0,bootstrapBefore:pachinkoBootstrapStatus(db,key,{expectedMachineCount,requiredDays}),bootstrap:null};
      for(let i=1;i<snapshots.length;i++){
        const previousSnapshot=snapshots[i-1],currentSnapshot=snapshots[i];
        if(dayNumber(currentSnapshot.server_date)-dayNumber(previousSnapshot.server_date)!==1)continue;
        modelResult.pairs++;
        const previousPayload={status:0,server_date_time:{date:previousSnapshot.server_date,time:previousSnapshot.server_time},ranking:payloadOf(previousSnapshot).ranking.filter(row=>identifyPachinkoModel(row)?.key===key)};
        const currentPayload=payloadOf(currentSnapshot),derived=derivePachinkoDay(previousPayload,currentPayload,{scopeModelKeys:[key]});
        if(!derived.diagnostics.ready)continue;modelResult.readyPairs++;
        const bootstrap=pachinkoBootstrapStatus(db,key,{expectedMachineCount,requiredDays});
        const candidates=[...derived.assignments.map(assignment=>({...assignment,business_date:derived.businessDate,bootstrapEdge:false})),...(bootstrap.complete?[]:derived.removedAssignments.map(assignment=>({...assignment,bootstrapEdge:true})))];
        let pairConflict=false;
        for(const assignment of candidates){
          const recordId=getRecord.get(assignment.fingerprint)?.id;if(!recordId)throw new Error('pachinko_assignment_record_missing');
          const found=existingDay.get(PACHINKO_STORE_ID,assignment.business_date,assignment.machine_no);
          if(found){
            if(found.record_id===recordId){result.existing++;modelResult.existing++;continue}
            result.conflicts++;modelResult.conflicts++;pairConflict=true;continue;
          }
          addDay.run(PACHINKO_STORE_ID,assignment.business_date,assignment.identity,assignment.machine_no,assignment.store_machine_id,assignment.machine_model_key,recordId,previousSnapshot.id,currentSnapshot.id,assignment.date_status,assignment.date_assignment_method);
          markKnown.run(assignment.bootstrapEdge?previousSnapshot.id:currentSnapshot.id,recordId);
          result.inserted++;modelResult.inserted++;if(assignment.bootstrapEdge)modelResult.removedInserted++;else modelResult.addedInserted++;
        }
        if(!pairConflict)setAnchor.run(key,currentSnapshot.id,currentSnapshot.server_date);
      }
      modelResult.bootstrap=pachinkoBootstrapStatus(db,key,{expectedMachineCount,requiredDays});result.models.push(modelResult);
    }
    return result;
  };
  db.exec('BEGIN IMMEDIATE;');try{const result=run();db.exec(dryRun?'ROLLBACK;':'COMMIT;');return result}catch(error){try{db.exec('ROLLBACK;')}catch{}throw error}
}

function safeSum(rows,key){const value=rows.reduce((sum,row)=>sum+row[key],0);return Number.isSafeInteger(value)?value:null}
function summaryFor(rows,model){
  const valid=rows.filter(row=>row.estimated_k!==null&&Number.isFinite(row.estimated_k)&&row.estimated_k>0&&row.estimator_status==='verified');
  const values=valid.map(row=>row.estimated_k).sort((a,b)=>a-b);
  const statuses=new Set(rows.map(row=>row.estimator_status));
  return {machine_model_key:model.key,total_machine_count:rows.length,valid_machine_count:valid.length,total_start:safeSum(rows,'start'),total_difference:safeSum(rows,'difference'),
    positive_count:rows.filter(row=>row.difference>0).length,non_negative_count:rows.filter(row=>row.difference>=0).length,
    pooled_k:poolPachinkoEstimates(model.key,valid),
    simple_mean_k:values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null,
    median_k:values.length?(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2:null,
    estimator_status:statuses.size===1?[...statuses][0]:statuses.size===0?model.estimatorStatus:'mixed'};
}
function machineOrder(a,b){return MODELS.findIndex(m=>m.key===a.machine_model_key)-MODELS.findIndex(m=>m.key===b.machine_model_key)||Number(a.machine_no)-Number(b.machine_no)||a.store_machine_id.localeCompare(b.store_machine_id)}
function sampleUndatedMachines(rows){
  const machines=new Map();
  for(const row of rows){if(!machines.has(row.identity))machines.set(row.identity,[]);machines.get(row.identity).push(row)}
  const buckets=[...machines.values()].sort((a,b)=>machineOrder(a[0],b[0])),samples=[];
  for(let round=0;samples.length<UNDATED_LIMIT;round++){
    let found=false;
    for(const bucket of buckets){
      if(bucket[round]){found=true;samples.push(bucket[round]);if(samples.length===UNDATED_LIMIT)break}
    }
    if(!found)break;
  }
  return samples;
}
export function getPachinkoMatrix(db,options={}){
  const {storeId,modelKey,limit}=validateQuery(options);
  const latest=db.prepare('SELECT * FROM p_snapshots WHERE store_id=? ORDER BY server_date DESC,server_time DESC,id DESC LIMIT 1').get(storeId);
  const dateRows=db.prepare("SELECT DISTINCT business_date FROM p_machine_days WHERE store_id=? AND (?='' OR machine_model_key=?) ORDER BY business_date DESC LIMIT ?").all(storeId,modelKey,modelKey,limit);
  const dates=dateRows.map(row=>row.business_date),dated=[];
  const readDay=db.prepare("SELECT r.*,d.business_date,d.date_status,d.date_assignment_method,d.previous_snapshot_id,d.current_snapshot_id FROM p_machine_days d JOIN p_records r ON r.id=d.record_id WHERE d.store_id=? AND d.business_date=? AND (?='' OR d.machine_model_key=?) ORDER BY CAST(d.machine_no AS INTEGER),d.store_machine_id");
  for(const date of dates)dated.push(...readDay.all(storeId,date,modelKey,modelKey));
  const records=dated.map(row=>compact(row,row));
  const summaries=dates.map(date=>({business_date:date,models:MODELS.filter(model=>!modelKey||model.key===modelKey).map(model=>summaryFor(dated.filter(row=>row.business_date===date&&row.machine_model_key===model.key),model))}));
  // Display evidence follows each model's actual scoped observation, not the
  // recovery anchor or the newest (possibly sea-only) snapshot for the store.
  const displayModels=MODELS.filter(model=>!modelKey||model.key===modelKey),displaySnapshots=new Map();
  const readModelSnapshot=db.prepare("SELECT s.* FROM p_snapshots s WHERE s.store_id=? AND EXISTS(SELECT 1 FROM json_each(s.scope_model_keys_json) scope WHERE scope.value=?) ORDER BY s.server_date DESC,s.server_time DESC,s.id DESC LIMIT 1");
  for(const model of displayModels)displaySnapshots.set(model.key,readModelSnapshot.get(storeId,model.key)??null);
  const modelSnapshots=displayModels.map(model=>({machine_model_key:model.key,snapshot:snapshotMeta(displaySnapshots.get(model.key))}));
  const readMembers=db.prepare('SELECT r.*,m.snapshot_id,m.occurrence_count,m.dated_occurrence_count FROM p_snapshot_members m JOIN p_records r ON r.id=m.record_id WHERE m.snapshot_id=? AND r.machine_model_key=? ORDER BY CAST(r.machine_no AS INTEGER),r.store_machine_id,r.id');
  const latestRows=displayModels.flatMap(model=>{const snapshot=displaySnapshots.get(model.key);return snapshot?readMembers.all(snapshot.id,model.key):[]});
  const undatedRows=latestRows.map(row=>({...row,occurrence_count:row.occurrence_count-row.dated_occurrence_count})).filter(row=>row.occurrence_count>0);
  const undatedSamples=[];
  const undatedModels=MODELS.filter(model=>!modelKey||model.key===modelKey).map(model=>{
    const rows=undatedRows.filter(row=>row.machine_model_key===model.key),samples=sampleUndatedMachines(rows);undatedSamples.push(...samples);
    return {machine_model_key:model.key,snapshot_id:displaySnapshots.get(model.key)?.id??null,record_count:rows.length,occurrence_count:rows.reduce((sum,row)=>sum+row.occurrence_count,0),sample_count:samples.length,truncated:rows.length>UNDATED_LIMIT};
  });
  const undated={record_count:undatedRows.length,occurrence_count:undatedRows.reduce((sum,row)=>sum+row.occurrence_count,0),models:undatedModels,
    records:undatedSamples.map(row=>({...compact(row),snapshot_id:row.snapshot_id,occurrence_count:row.occurrence_count})),sample_limit:UNDATED_LIMIT,per_model_sample_limit:UNDATED_LIMIT,truncated:undatedModels.some(model=>model.truncated)};
  const rosterMap=new Map([...dated,...latestRows].map(row=>[row.identity,{...Object.fromEntries(MACHINE_FIELDS.map(key=>[key,row[key]])),snapshot_id:row.snapshot_id??null}]));
  return {store:PACHINKO_STORE,models:MODELS,dates,records,summaries,roster:[...rosterMap.values()].sort(machineOrder),undated,latestSnapshot:snapshotMeta(latest),modelSnapshots};
}

export function getPachinkoRecord(db,recordId){
  const id=pachinkoInteger(recordId);if(id===null||id<=0)throw new Error('invalid_pachinko_record_id');
  const record=db.prepare('SELECT * FROM p_records WHERE id=?').get(id);if(!record)return null;
  const snapshots=db.prepare('SELECT s.*,m.occurrence_count,m.dated_occurrence_count FROM p_snapshot_members m JOIN p_snapshots s ON s.id=m.snapshot_id WHERE m.record_id=? ORDER BY s.server_date DESC,s.server_time DESC,s.id DESC').all(id).map(row=>({...snapshotMeta(row),occurrence_count:row.occurrence_count,dated_occurrence_count:row.dated_occurrence_count}));
  const snapshotById=db.prepare('SELECT * FROM p_snapshots WHERE id=?');
  const assignments=db.prepare('SELECT * FROM p_machine_days WHERE record_id=? ORDER BY business_date DESC').all(id).map(day=>({...day,previous_snapshot:snapshotMeta(snapshotById.get(day.previous_snapshot_id)),current_snapshot:snapshotMeta(snapshotById.get(day.current_snapshot_id))}));
  const derived={...Object.fromEntries(DERIVED_FIELDS.map(key=>[key,record[key]])),diagnostics:parse(record.diagnostics_json)};
  return {...compact(record,assignments[0]),fingerprint:record.fingerprint,raw:parse(record.raw_json),derived,snapshots,snapshot:snapshots[0]??null,date_assignments:assignments};
}

export function reestimatePachinkoRecords(db){
  return transaction(db,()=>{
    const records=db.prepare('SELECT * FROM p_records ORDER BY id').all();
    const update=db.prepare(`UPDATE p_records SET ${DERIVED_FIELDS.map(key=>`${key}=?`).join(',')},diagnostics_json=? WHERE id=?`);
    const counts={processed:0,updated:0,valid:0,null:0,verified:0,provisional:0};
    for(const record of records){
      const estimate=estimatePachinko(record.machine_model_key,parse(record.raw_json));
      const changed=DERIVED_FIELDS.some(key=>record[key]!==estimate[key])||record.diagnostics_json!==JSON.stringify(estimate.diagnostics);
      if(changed){update.run(...DERIVED_FIELDS.map(key=>estimate[key]),JSON.stringify(estimate.diagnostics),record.id);counts.updated++}
      counts.processed++;counts[estimate.estimated_k===null?'null':'valid']++;
      if(estimate.estimator_status==='verified')counts.verified++;if(estimate.estimator_status==='provisional')counts.provisional++;
    }
    return counts;
  });
}
