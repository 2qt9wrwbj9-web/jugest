export const BASE_COMMIT='273ed61ed2019365ae1b38d76288f20e9625c9e1';
export const STATE_KEY='juggler_tool_state_v33';
export const EXTERNAL_DB_KEY='externalDays';

export const predictionHistorySpec={
 shop:'軸選択ベースライン店',
 startDate:'2026-01-01',
 days:72,
 tables:['2','10','101','102','111','112','201','202','211','212','301','302'],
 machines:['my','im'],
 createdAt:1767225600000
};

function dateShift(date,days){
 const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);
}

export function makeRawPredictionHistory(spec=predictionHistorySpec){
 const days=[];
 for(let dayIndex=0;dayIndex<spec.days;dayIndex++){
  const date=dateShift(spec.startDate,dayIndex),machines=spec.tables.map((tableNo,tableIndex)=>{
   const machine=spec.machines[tableIndex%spec.machines.length];
   const setting=1+((dayIndex*3+tableIndex*5+Math.floor(dayIndex/7)+(tableIndex%3)*2)%6);
   const games=5200+((dayIndex*137+tableIndex*211)%2800);
   const bb=Math.max(8,Math.round(games/(310-setting*11))+((dayIndex+tableIndex)%3)-1);
   const rb=Math.max(5,Math.round(games/(490-setting*38))+((dayIndex*2+tableIndex)%3)-1);
   const trend=(setting-3.35)*215+(tableIndex%4-1.5)*55+((dayIndex%9)-4)*18;
   const diff=Math.round(trend+(bb-20)*14+(rb-14)*9);
   return{machine,tableNo,games,diff,bb,rb,gamesSource:'observed',diffSource:'observed'};
  });
  days.push({
   id:dayIndex+1,source:'ana-slo',sourceUrl:'',capturedAt:'',date,shop:spec.shop,
   createdAt:spec.createdAt+dayIndex,updatedAt:spec.createdAt+dayIndex,machines
  });
 }
 return days;
}

export function normalizePredictionHistory(v4Test,spec=predictionHistorySpec){
 return makeRawPredictionHistory(spec).map(day=>({
  ...v4Test.normalizeDay(day),id:day.id,createdAt:day.createdAt,updatedAt:day.updatedAt
 }));
}

export function packPredictionHistory(days){
 return days.map(day=>({
  id:day.id,source:day.source,sourceUrl:day.sourceUrl,capturedAt:day.capturedAt,date:day.date,shop:day.shop,
  createdAt:day.createdAt,updatedAt:day.updatedAt,
  machines:day.machines.map(row=>[
   row.machine,String(row.tableNo),row.games,row.diff,row.bb,row.rb,row.gamesSource,row.diffSource
  ])
 }));
}

export function predictionHistorySignature(spec=predictionHistorySpec){
 const latest=dateShift(spec.startDate,spec.days-1),rows=spec.days*spec.tables.length,stamp=spec.createdAt+spec.days-1;
 return `${spec.shop}|${spec.days}|${rows}|${latest}|${stamp}`;
}

export function predictionTargets(spec=predictionHistorySpec){
 return{
  forward:dateShift(spec.startDate,spec.days),
  historical:dateShift(spec.startDate,59)
 };
}

export const storedProfile={
 weights:{practical:.15,model:.70,strict:.15},
 trainedAt:1768000000000,
 samples:8
};

export function makeStoredState(spec=predictionHistorySpec){
 const targets=predictionTargets(spec),optimization={
  weights:{...storedProfile.weights},rawBest:{practical:.10,model:.75,strict:.15},mode:'walk-forward',
  reason:'accepted',samples:storedProfile.samples,shrink:.5,dates:[]
 };
 return JSON.stringify({
  version:47,
  v4HybridProfiles:{[spec.shop]:{
   signature:predictionHistorySignature(spec),trainedAt:storedProfile.trainedAt,
   trainedTo:dateShift(spec.startDate,spec.days-1),optimization
  }},
  v4PlanDate:targets.forward,v4PlanShop:spec.shop
 });
}

function tieRows(){
 const keys=['台10','台2','台1','台12','台11','台3','台20','台4','台30','台5','台21','台6'];
 return keys.map((key,index)=>({
  key,practicalSignal:.5,modelSignal:.5,strictSignal:.5,hybridValidatedBonus:0,
  actualES:1+(12-index)*.4,actualP4:.08+(12-index)*.065
 }));
}

function bonusRows(){
 return Array.from({length:12},(_,index)=>({
  key:`bonus-${index+1}`,
  practicalSignal:index===0?.95:index===1?.20:.82-index*.035,
  modelSignal:index===0?.95:index===1?.20:.76-index*.025,
  strictSignal:index===0?.95:index===1?.20:.70-index*.018,
  hybridValidatedBonus:index===0?.18:index===1?1.05:(index===7?.04:0),
  actualES:index===0?1.2:index===1?5.9:2.1+(index%5)*.65,
  actualP4:index===0?.08:index===1?.94:.18+(index%5)*.14
 }));
}

function variedDay(dayIndex){
 return Array.from({length:12},(_,index)=>{
  const practical=((index*7+dayIndex*3)%13)/12;
  const model=((index*5+dayIndex*2+1)%13)/12;
  const strict=((index*3+dayIndex*5+2)%13)/12;
  const outcome=((index*(dayIndex+2)+dayIndex*7)%12)/11;
  return{
   key:`day-${dayIndex}-table-${[10,2,31,4,15,6,27,8,19,20,11,12][index]}`,
   practicalSignal:practical,modelSignal:model,strictSignal:strict,
   hybridValidatedBonus:(index+dayIndex)%7===0?.035:0,
   actualES:1+outcome*5,actualP4:.04+outcome*.92
  };
 });
}

export function makeUtilityCases(){
 const insufficient=variedDay(9);insufficient[9].actualES='invalid';insufficient[10].actualP4='invalid';insufficient[11].actualES='invalid';
 return[
  {name:'numeric-key-tie',weights:{practical:.55,model:.30,strict:.15},samples:[{date:'2026-04-01',rows:tieRows()}]},
  {name:'fixed-bonus-and-raw-score',weights:{practical:.55,model:.30,strict:.15},samples:[{date:'2026-04-02',rows:bonusRows()}]},
  {name:'multiple-days-stability',weights:{practical:.20,model:.65,strict:.15},samples:Array.from({length:5},(_,i)=>({date:dateShift('2026-04-03',i),rows:variedDay(i)}))},
  {name:'degenerate-empty',weights:{practical:.55,model:.30,strict:.15},samples:[]},
  {name:'degenerate-fewer-than-ten-valid',weights:{practical:.55,model:.30,strict:.15},samples:[{date:'2026-04-09',rows:insufficient}]}
 ];
}

export function encodeNonFinite(value){
 if(typeof value==='number'&&!Number.isFinite(value))return value===Infinity?'Infinity':value===-Infinity?'-Infinity':'NaN';
 if(Array.isArray(value))return value.map(encodeNonFinite);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encodeNonFinite(item)]));
 return value;
}

export function compactPrediction(result){
 return{
  trainingDays:result.trainingDays,lifetimeDays:result.lifetimeDays,from:result.from,to:result.to,
  ranking:{
   hybridWeights:result.ranking.hybridWeights,
   hybridOptimization:{
    weights:result.ranking.hybridOptimization.weights,
    mode:result.ranking.hybridOptimization.mode,
    reason:result.ranking.hybridOptimization.reason,
    samples:result.ranking.hybridOptimization.samples,
    stored:result.ranking.hybridOptimization.stored||false,
    trainedAt:result.ranking.hybridOptimization.trainedAt??null,
    trainedTo:result.ranking.hybridOptimization.trainedTo??null
   }
  },
  rows:result.rows.map(row=>({
   rank:row.rank,machine:row.machine,tableNo:row.tableNo,aimScore:row.aimScore,hybridScore:row.hybridScore,
   predP4:row.predP4,predES:row.predES,
   practicalSignal:row.practicalSignal,modelSignal:row.modelSignal,strictSignal:row.strictSignal,
   hybridValidatedBonus:row.hybridValidatedBonus
  }))
 };
}
