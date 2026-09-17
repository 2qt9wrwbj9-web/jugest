import {expectedRelevance} from './relevance.mjs';

const JUGGLER_KEYS=new Set(['my','im','go','fk','hp','gg','mr','um']);
const HANA_KEYS=new Set(['houou','king','dragon','star']);
const NEW_KING_V='newkingv';

function requireMachineKeys(values){
  if(!Array.isArray(values)||!values.length)throw new TypeError('expectedMachineKeys must be a non-empty array');
  const keys=values.map((value,index)=>{
    const key=String(value??'').trim();
    if(!key)throw new TypeError(`expectedMachineKeys[${index}] must be non-empty`);
    return key;
  });
  if(new Set(keys).size!==keys.length)throw new RangeError('expectedMachineKeys must not contain duplicates');
  return keys;
}

function familyForMachine(machine){
  const key=String(machine??'').trim();
  if(JUGGLER_KEYS.has(key))return 'juggler';
  if(HANA_KEYS.has(key))return 'hana';
  if(key===NEW_KING_V)return 'new_king_v';
  throw new RangeError(`unsupported machine for PRE v2 relevance: ${key||'<empty>'}`);
}

function requirePosterior(q,{family,tolerance=1e-9}={}){
  if(!Array.isArray(q))throw new TypeError('protected posterior q must be an array');
  if(q.length!==6)throw new RangeError(`protected posterior q must contain six padded setting slots; got ${q.length}`);
  const values=q.map((raw,index)=>{
    const value=Number(raw);
    if(!Number.isFinite(value))throw new TypeError(`protected posterior q[${index}] must be finite`);
    if(value<0)throw new RangeError(`protected posterior q[${index}] must be nonnegative`);
    return value;
  });
  const total=values.reduce((a,b)=>a+b,0);
  if(Math.abs(total-1)>tolerance)throw new RangeError(`protected posterior q must sum to 1; got ${total}`);
  if(family==='new_king_v'&&Math.abs(values[5])>tolerance)throw new RangeError('New King V protected posterior padded sixth/setting 6 slot must be zero');
  return values;
}

function posteriorObject(q,family){
  if(family==='new_king_v')return {1:q[0],2:q[1],3:q[2],4:q[3],V:q[4]};
  return {1:q[0],2:q[1],3:q[2],4:q[3],5:q[4],6:q[5]};
}

function sameSet(a,b){
  if(a.length!==b.length)return false;
  const set=new Set(a);
  return b.every(key=>set.has(key));
}

export function buildRelevanceTruth({judgedRows,expectedMachineKeys,tolerance=1e-9}={}){
  const expected=requireMachineKeys(expectedMachineKeys);
  if(!Array.isArray(judgedRows))throw new TypeError('judgedRows must be an array');
  const rowKeys=[];
  const normalized=[];
  for(const [index,row] of judgedRows.entries()){
    if(!row||typeof row!=='object'||Array.isArray(row))throw new TypeError(`judgedRows[${index}] must be an object`);
    const tableNo=String(row.tableNo??'').trim();
    if(!tableNo)throw new TypeError(`judgedRows[${index}].tableNo is required`);
    if(rowKeys.includes(tableNo))throw new RangeError(`duplicate judged tableNo: ${tableNo}`);
    const family=familyForMachine(row.machine);
    const q=requirePosterior(row.q,{family,tolerance});
    rowKeys.push(tableNo);
    normalized.push({tableNo,family,q});
  }
  if(!sameSet(expected,rowKeys))throw new RangeError('judged rows must match the exact expected machine set; missing or extra machine detected');

  const byKey=new Map(normalized.map(row=>[row.tableNo,row]));
  const truth=new Map();
  for(const key of expected){
    const row=byKey.get(key);
    truth.set(key,expectedRelevance(posteriorObject(row.q,row.family),row.family,{tolerance}));
  }
  return truth;
}

export const __test={familyForMachine,requirePosterior};
