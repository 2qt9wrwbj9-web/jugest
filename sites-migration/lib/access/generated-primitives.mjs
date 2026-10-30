// Fixed source ACCESS validation; no secret values or DB initialization.
export const ACCESS_LIMITS=Object.freeze({adminMs:43200000,freshMs:300000,ceremonyMs:300000,enrollmentMs:900000});
const error=code=>{throw new Error(code)};
function duration(value,min,max){if(!Number.isInteger(value)||value<min||value>max)error('invalid_duration');return value}
function label(value){if(typeof value!=='string'||value.length>80||/[\u0000-\u001f\u007f]/.test(value))error('invalid_label');return value.trim()}
function normalizeCode(value){return typeof value==='string'?value.trim().toUpperCase():''}

export{duration,label,normalizeCode};
