(function(global){
'use strict';
// Read-only draft predicate. Field definitions and judgement remain in the model.
function isRowEmpty(row,fields){return fields.every(key=>String(row.input[key]??'').trim()==='')}
function findRow(single,rows,id){return [single,...rows].find(row=>row?.id===String(id))}
// IDs and normalized inputs are supplied by the application; no sequence mutation.
function createDraft(id,input){return{id,input,result:null,errors:{}}}
// Shape checks only; numeric validity and normalization remain in the existing model.
function validateImportRows(rows,judgement){
 if(!Array.isArray(rows)||!rows.length||rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw new TypeError('台データを1台以上の配列で渡してください。');
 if(rows.some(row=>judgement.FIELDS.some(key=>row[key]!=null&&!['string','number'].includes(typeof row[key]))))throw new TypeError('入力値は文字列または数値で渡してください。');
}
global.JUGESTJudgementPageInput=Object.freeze({isRowEmpty,findRow,createDraft,validateImportRows});
})(typeof globalThis!=='undefined'?globalThis:this);
