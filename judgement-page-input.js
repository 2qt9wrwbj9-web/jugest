(function(global){
'use strict';
// Read-only draft predicate. Field definitions and judgement remain in the model.
function isRowEmpty(row,fields){return fields.every(key=>String(row.input[key]??'').trim()==='')}
function findRow(single,rows,id){return [single,...rows].find(row=>row?.id===String(id))}
// IDs and normalized inputs are supplied by the application; no sequence mutation.
function createDraft(id,input){return{id,input,result:null,errors:{}}}
global.JUGESTJudgementPageInput=Object.freeze({isRowEmpty,findRow,createDraft});
})(typeof globalThis!=='undefined'?globalThis:this);
