// Read-only VPS trend computation. Uses the exact active JUGEST observed-data judge;
// never writes to externalDays, localStorage, IndexedDB or a server.
export function selectTrendDates(dates,period='30'){
 const valid=[...new Set((Array.isArray(dates)?dates:[]).map(String).filter(d=>/^20\d{2}-\d{2}-\d{2}$/.test(d)))].sort().reverse();
 if(String(period)==='all'||!valid.length)return valid;
 const days=Math.max(1,Math.trunc(Number(period)||30));
 const limit=Date.parse(valid[0]+'T00:00:00Z')-(days-1)*86400000;
 return valid.filter(d=>Date.parse(d+'T00:00:00Z')>=limit);
}
function concentration(q){
 if(!Array.isArray(q)||q.length!==6)return NaN;
 const nums=q.map(Number);if(nums.some(x=>!Number.isFinite(x)||x<0))return NaN;
 const sum=nums.reduce((a,b)=>a+b,0);if(!(sum>0))return NaN;
 const h=-nums.reduce((a,v)=>{const p=v/sum;return a+(p>0?p*Math.log(p):0)},0);
 return Math.max(0,Math.min(100,(1-h/Math.log(6))*100));
}
export async function computeVpsTrend({shop='',days=[],machine='',judge,onProgress=()=>{},isCurrent=()=>true,yieldFrame=()=>new Promise(resolve=>setTimeout(resolve,0))}={}){
 if(typeof judge!=='function')throw new TypeError('existing JUGEST judge is required');
 const map=new Map();let read=0,eligible=0,valid=0,missing=0;
 for(const day of days){
  if(!isCurrent())return null;
  for(const row of day?.rows||[]){
   if(!isCurrent())return null;
   if(machine&&row.machine!==machine)continue;
   read++;
   if(!row?.machine||!String(row.tableNo??'').trim()||!Number.isSafeInteger(Number(row.games))||Number(row.games)<=0||!Number.isSafeInteger(Number(row.bb))||!Number.isSafeInteger(Number(row.rb))||Number(row.bb)<0||Number(row.rb)<0||Number(row.bb)+Number(row.rb)>Number(row.games)){missing++;continue}
   eligible++;
   const input={machine:row.machine,tableNo:String(row.tableNo),games:Number(row.games),bb:Number(row.bb),rb:Number(row.rb),diff:row.diff==null?null:row.diff};
   const judged=judge(input);
   if(!judged?.ok||!Array.isArray(judged.q)||judged.q.length!==6){missing++;continue}
   const es=Number(judged.expectedSetting),conf=concentration(judged.q);
   if(!Number.isFinite(es)){missing++;continue}
   valid++;
   const key=row.machine+'|'+String(row.tableNo);
   let item=map.get(key);
   if(!item){item={machine:row.machine,machineName:judged.machineName||row.machineName||row.machine,tableNo:String(row.tableNo),days:0,sumES:0,sumConf:0,confN:0,latest:''};map.set(key,item)}
   item.days++;item.sumES+=es;
   if(Number.isFinite(conf)){item.sumConf+=conf;item.confN++}
   if(String(day.date||'')>item.latest)item.latest=String(day.date);
   // Don't block the iPhone main thread when processing 100+ machines across many days.
   if(valid%40===0){onProgress({phase:'judging',done:valid,total:days.length});await yieldFrame()}
  }
 }
 const rows=[...map.values()].map(x=>({machine:x.machine,machineName:x.machineName,tableNo:x.tableNo,days:x.days,avgES:x.sumES/x.days,confidence:x.confN?x.sumConf/x.confN:null,latest:x.latest})).sort((a,b)=>(b.avgES??-99)-(a.avgES??-99)||a.tableNo.localeCompare(b.tableNo,'ja',{numeric:true}));
 return {shop,dayCount:days.length,rowCount:read,eligibleRows:eligible,judgedRows:valid,skippedRows:missing,rows:rows.slice(0,120)};
}
