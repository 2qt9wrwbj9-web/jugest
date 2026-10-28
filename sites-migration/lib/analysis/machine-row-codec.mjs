// Fixed brutePrepare row contract: no graph nodes/maps/functions exist here.
// Tuples avoid a second full graph of metadata while preserving every field.
const fields=['date','machine','tableNo','games','diff','bb','rb','es','p4','p5','features','_bid'];
const special=['NaN','+Infinity','-Infinity','-0'];
function encode(v){if(typeof v==='number'&&(!Number.isFinite(v)||Object.is(v,-0)))return{$number:Number.isNaN(v)?'NaN':v===Infinity?'+Infinity':v===-Infinity?'-Infinity':'-0'};if(v===null||['string','boolean','number'].includes(typeof v))return v;throw Error('machine_row_value_invalid')}
function decode(v){if(v&&typeof v==='object'){if(Object.keys(v).length!==1||!special.includes(v.$number))throw Error('machine_row_value_invalid');return v.$number==='NaN'?NaN:v.$number==='+Infinity'?Infinity:v.$number==='-Infinity'?-Infinity:-0}return encode(v)}
export function encodeMachineRows(rows){return{format:'machine-row-tuples-v1',rows:rows.map(r=>{if(Object.keys(r).length!==fields.length||fields.some(k=>!Object.hasOwn(r,k))||!Array.isArray(r.features))throw Error('machine_row_contract_changed');return fields.map(k=>k==='features'?r.features.map(encode):encode(r[k]))})}}
export function decodeMachineRows(value){if(value?.format!=='machine-row-tuples-v1'||!Array.isArray(value.rows))throw Error('machine_row_contract_changed');return value.rows.map(tuple=>{if(!Array.isArray(tuple)||tuple.length!==fields.length)throw Error('machine_row_contract_changed');return Object.fromEntries(fields.map((k,i)=>[k,k==='features'?tuple[i].map(decode):decode(tuple[i])]))})}
