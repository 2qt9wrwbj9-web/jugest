(function(global){
'use strict';
// Read-only draft predicate. Field definitions and judgement remain in the model.
function isRowEmpty(row,fields){return fields.every(key=>String(row.input[key]??'').trim()==='')}
function findRow(single,rows,id){return [single,...rows].find(row=>row?.id===String(id))}
global.JUGESTJudgementPageInput=Object.freeze({isRowEmpty,findRow});
})(typeof globalThis!=='undefined'?globalThis:this);
