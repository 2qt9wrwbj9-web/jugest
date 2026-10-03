(function(global){
'use strict';
// Read-only draft predicate. Field definitions and judgement remain in the model.
function isRowEmpty(row,fields){return fields.every(key=>String(row.input[key]??'').trim()==='')}
global.JUGESTJudgementPageInput=Object.freeze({isRowEmpty});
})(typeof globalThis!=='undefined'?globalThis:this);
