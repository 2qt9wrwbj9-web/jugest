// D1 infrastructure only: compare the observed source rows and atomically publish
// a small plan. All numerical/model/trial logic lives in the frozen source.
import{canonicalJson,hashCanonical}from'../../upstream/vps/src/canonical-json.mjs';
const fault=code=>Object.assign(Error(code),{code});
export async function createPrePlan(db,storeId){return{storeId,revision:(await db.prepare('SELECT revision FROM sites_pre_epochs WHERE store_id=?').bind(storeId).first())?.revision??0,reads:[],writes:[]}}
export async function observe(plan,db,table,where='store_id=?',values=[plan.storeId]){
 if(!/^[a-z_0-9]+$/.test(table))throw Error('invalid_internal_table');
 const rows=(await db.prepare(`SELECT * FROM ${table} WHERE ${where}`).bind(...values).all()).results;
 plan.reads.push({table,where,values,rows});return rows;
}
export function insertRow(plan,table,row,{ignore=false}={}){const keys=Object.keys(row);plan.writes.push({sql:`INSERT ${ignore?'OR IGNORE ':''}INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`,values:keys.map(k=>row[k]??null)})}
export function writeSql(plan,sql,values){plan.writes.push({sql,values})}
function expectedRows(read){
 const body=canonicalJson(read.rows);if(new TextEncoder().encode(body).byteLength>1500000)throw fault('pre_compare_row_too_large');
 const columns=Object.keys(read.rows[0]??{}),match=columns.map(k=>`t.${k} IS json_extract(q.value,'$.${k}')`).join(' AND ')||'1';
 return{sql:`(SELECT COUNT(*) FROM ${read.table} WHERE ${read.where})=json_array_length(?) AND NOT EXISTS(SELECT 1 FROM json_each(?) q WHERE NOT EXISTS(SELECT 1 FROM ${read.table} t WHERE ${match}))`,values:[...read.values,body,body]};
}
export function prePlanStatements({db,plan,job=null}){
 const checks=plan.reads.map(expectedRows),guard=checks.length?checks.map(x=>'('+x.sql+')').join(' AND '):'1',token=crypto.randomUUID();
 let condition=guard,args=checks.flatMap(x=>x.values);
 if(job){condition+=" AND EXISTS(SELECT 1 FROM sites_analysis_jobs WHERE id=? AND state='succeeded' AND attempts=? AND result_key=?)";args.push(job.id,job.attempts,job.result_key);condition+=" AND EXISTS(SELECT 1 FROM sites_analysis_heads WHERE store_id=? AND kind=? AND latest_job_id=?)";args.push(job.store_id,job.kind,job.id)}
 const bump=db.prepare(`INSERT INTO sites_pre_epochs(store_id,revision,owner) SELECT ?,?,? WHERE ${condition} ON CONFLICT(store_id) DO UPDATE SET revision=excluded.revision,owner=excluded.owner WHERE sites_pre_epochs.revision=?`).bind(plan.storeId,plan.revision+1,token,...args,plan.revision);
 const fence=db.prepare('INSERT INTO sites_pre_fences(operation_id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM sites_pre_epochs WHERE store_id=? AND revision=? AND owner=?) THEN 1 ELSE 0 END').bind(token,plan.storeId,plan.revision+1,token);
 return[bump,fence,...plan.writes.map(x=>db.prepare(x.sql).bind(...x.values))];
}
export async function commitPrePlan(db,plan,{onStage=()=>{}}={}){onStage('pre:commit-begin',{identity:hashCanonical(plan)});await db.batch(prePlanStatements({db,plan}));onStage('pre:committed')}
