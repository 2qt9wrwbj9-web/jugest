import {readFileSync,writeFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../upstream/vps/src/'+p,import.meta.url),'utf8');
const source=read('analytics-handler.mjs');
function section(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i+a.length);if(i<0||j<0)throw Error('missing source anchor '+a);return s.slice(i,j)}
function replace(s,a,b){if(!s.includes(a))throw Error('missing transformation anchor '+a);return s.replace(a,b)}
const helpers=section(source,'function safeJson(', '\nfunction isJudgeMachinesRoute(');
const assistantScope=section(source,'function assistantReadRouteAllowed(', '\nasync function readJsonBody(');
const piaScope=section(read('access/handler.mjs'),'export function canReadPiaRoute(', '\n\nexport function createAccessHandler(');
let authorized=helpers.replace('function authorizedStore(','async function authorizedStore(').replace("const row=db.prepare(","const row=await db.prepare(");
// All query SQL and output mapping below are from the frozen source. Changes
// are async D1 calls, dependency injection, and removal of unported branches.
let handler=section(source,'  return async function analyticsHandler(', '\nexport const __test=');
handler=handler.slice(0,handler.lastIndexOf('\n}'));
handler=replace(handler,"    const assistantKeyRoute=isAssistantKeyRoute(parts);", "    const assistantKeyRoute=false;");
handler=handler.slice(0,handler.indexOf('    if(assistantKeyRoute){'))+handler.slice(handler.indexOf('    const judgeRoute=isJudgeMachinesRoute(parts);'));
handler=replace(handler,'const judgeRoute=isJudgeMachinesRoute(parts);','const judgeRoute=false;');
handler=handler.slice(0,handler.indexOf('    if(judgeRoute){\n'))+handler.slice(handler.indexOf('    const db=openDatabase(canonicalDbPath);'));
handler=replace(handler,'    const db=openDatabase(canonicalDbPath);','');
handler=replace(handler,'      migrate(db);','');
handler=handler.slice(0,handler.indexOf("      if(parts.length===4&&parts[2]==='system'"))+handler.slice(handler.indexOf("      if(parts.length===3&&parts[2]==='stores')"));
handler=handler.slice(0,handler.indexOf("      if(parts.length===5&&parts[4]==='legacy-plan')"))+handler.slice(handler.indexOf("      if(parts.length===6&&parts[4]==='days')"));
const readBranch=section(handler,"      if(parts.length===6&&parts[4]==='research'&&parts[5]==='store-read')","      if(parts.length===6&&parts[4]==='research'&&parts[5]==='comparison')").replace('storeRead=auditStoreRead(', 'storeRead=await auditStoreRead(');
handler=handler.slice(0,handler.indexOf("      if(parts.length===6&&parts[4]==='research'"))+readBranch+handler.slice(handler.indexOf("      if(parts.length===5&&parts[4]==='status')"));
handler=replace(handler,"      sendJson(req,res,404,{ok:false,code:'not_found'});\n    }finally{db.close()}","      sendJson(req,res,503,{ok:false,code:'sites_port_not_implemented'});\n    }finally{}");
handler=handler.replaceAll('=db.prepare(', '=await db.prepare(').replaceAll('const rows=db.prepare(', 'const rows=await db.prepare(');
handler=replace(handler,'.all();','.all();');
// D1 .all() returns {results}, SQLite .all() returns an array: the injected
// readDb facade normalizes this one platform boundary.
handler=replace(handler,'const stores=rows.flatMap(row=>{','const stores=(await Promise.all(rows.map(async row=>{');
handler=replace(handler,"visibility:metadata.visibility==='public'?'public':'private'}]});","visibility:metadata.visibility==='public'?'public':'private'}]}))).flat();");
handler=replace(handler,".all(storeId,limit).reverse();",".all(storeId,limit);\n        rows.reverse();");
handler=replace(handler,"const machines=await db.prepare(","const machineRows=await db.prepare(");
handler=replace(handler,".all(storeId,date).map(row=>safeJson(row.payload_json,null)).filter(Boolean);sendJson", ".all(storeId,date);const machines=machineRows.map(row=>safeJson(row.payload_json,null)).filter(Boolean);sendJson");
handler=replace(handler,'access=authorizedStore(', 'access=await authorizedStore(');
handler=replace(handler,'||authenticatePia(req);','||await authenticatePia(req);');
handler=handler.replaceAll('(req,relayDbPath)','(req)');
writeFileSync(new URL('../lib/generated-store-read.mjs',import.meta.url),`// Generated from frozen JUGEST source. Regenerate with scripts/generate-store-read.mjs.\nconst ANALYSIS_VERSION='vps-runtime-v1',STORE_READ_VERSION='store-read-v1';\n${assistantScope}\n${piaScope}\nexport function createStoreReadHandler({db,authenticateReceiver,authenticateAssistantRead,authenticatePia=()=>null,canAccessStoreMetadata,storeMetadata,sendJson,auditStoreRead=async(_db,_id,payload)=>payload}){\n${authorized}\n${handler}\n}\n`);
// Reuse the original cryptographic checks, token records and revocation checks.
let auth=read('assistant-read-key.mjs');
auth=replace(auth,"import {createRelayStore} from './relay-store.mjs';",'');
auth=replace(auth,"function relayStore(relayDbPath){return createRelayStore(RELAY_STORE_NAME,{dbPath:relayDbPath,root:'jugest'})}","function relayStore(stores){return stores(RELAY_STORE_NAME)}");
auth=replace(auth,"function keyStore(relayDbPath){return createRelayStore(KEY_STORE_NAME,{dbPath:relayDbPath,root:'jugest'})}","function keyStore(stores){return stores(KEY_STORE_NAME)}");
writeFileSync(new URL('../lib/generated-store-auth.mjs',import.meta.url),'// Generated from frozen source; only storage construction is injected.\n'+auth);
// Replace fs/env discovery with explicit configuration. Policy body unchanged.
let policy=section(read('store-access.mjs'),"const PIA_SOURCE=",'\nexport const __test=');
policy=policy.slice(0,policy.indexOf('function readOwnerChannelFile('))+policy.slice(policy.indexOf('export function canAccessStoreMetadata('));
policy=policy.replaceAll("process.env.JUGEST_PIA_ACCESS_MODE??'owner'","'owner'").replaceAll('configuredOwnerChannels(options)','options.piaOwnerChannelIds');
writeFileSync(new URL('../lib/generated-store-policy.mjs',import.meta.url),'// Generated from frozen source; configuration is supplied explicitly.\n'+policy);
console.log('Generated original store read API, auth and policy with D1 async boundaries.');
