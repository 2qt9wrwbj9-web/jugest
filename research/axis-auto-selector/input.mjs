const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function expandMachine(row,index){
 if(isRecord(row))return structuredClone(row);
 if(!Array.isArray(row)||row.length<8)throw new TypeError(`packed machine row ${index} is invalid`);
 const [machine,tableNo,games,diff,bb,rb,gamesSource,diffSource]=row;
 if(typeof machine!=='string'||machine.length===0)throw new TypeError(`packed machine row ${index} machine is invalid`);
 return{machine,tableNo:String(tableNo??''),games:games??null,diff:diff??null,bb:+bb||0,rb:+rb||0,gamesSource:String(gamesSource??'observed'),diffSource:String(diffSource??(diff!=null?'observed':'missing'))};
}
function expandDay(day,index){
 if(!isRecord(day))throw new TypeError(`external history day ${index} must be an object`);
 if(!Array.isArray(day.machines))throw new TypeError(`external history day ${index} machines must be an array`);
 return{...structuredClone(day),machines:day.machines.map(expandMachine)};
}
export function extractExternalDays(input,{store=null}={}){
 let days=null;
 if(Array.isArray(input))days=input;
 else if(isRecord(input)){
  if(Array.isArray(input.externalDays))days=input.externalDays;
  else if(Array.isArray(input.state?.externalDays))days=input.state.externalDays;
  else if(Array.isArray(input.days))days=input.days;
 }
 if(!Array.isArray(days)||days.length===0)throw new TypeError('input does not contain externalDays history');
 const selected=typeof store==='string'&&store.trim()!==''?days.filter(day=>isRecord(day)&&day.shop===store):days;
 if(selected.length===0&&store)throw new TypeError(`store ${store} has no history days`);
 return selected.map(expandDay);
}
