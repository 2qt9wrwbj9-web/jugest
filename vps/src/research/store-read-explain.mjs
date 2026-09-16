import {axisMatches} from './axis-discovery.mjs';

function finite(value,fallback=null){const n=Number(value);return Number.isFinite(n)?n:fallback}
function clamp(value,min=0,max=1){return Math.max(min,Math.min(max,value))}
function familyForField(field){
  const key=String(field||'');
  if(key==='weekday')return 'calendar:weekday';
  if(key==='date_last_digit')return 'calendar:date_tail';
  if(key==='machine_name')return 'machine:identity';
  if(key==='table_no'||key==='table_last_digit')return 'table:identity';
  let match=key.match(/^hist_\d+_(.+)$/);if(match)return `history:${match[1]}`;
  match=key.match(/^store_\d+_(.+)$/);if(match)return `store:${match[1]}`;
  return `feature:${key||'unknown'}`;
}
function predicateLabel(predicate){
  const field=String(predicate?.field||''),op=predicate?.op==='gte'?'以上':predicate?.op==='lte'?'以下':'=',value=predicate?.value;
  if(field==='weekday')return `曜日 ${value}`;
  if(field==='date_last_digit')return `日付末尾 ${value}`;
  if(field==='machine_name')return `機種 ${value}`;
  if(field==='table_no')return `台番 ${value}`;
  if(field==='table_last_digit')return `台番末尾 ${value}`;
  const hist=field.match(/^hist_(\d+)_(.+)$/);if(hist)return `直近${hist[1]}日 ${hist[2]} ${op} ${value}`;
  const store=field.match(/^store_(\d+)_(.+)$/);if(store)return `店舗直近${store[1]}日 ${store[2]} ${op} ${value}`;
  return `${field} ${op} ${value}`;
}
function axisFamilyParts(axis){return [...new Set((axis?.predicates||[]).map(p=>familyForField(p.field)))].sort()}
function axisConfidence(axis){
  const p=finite(axis?.pValue),fold=finite(axis?.foldPassRate),robust=finite(axis?.robustness),support=finite(axis?.support),lift=finite(axis?.lift),weight=Math.abs(finite(axis?.weight,0));
  const pScore=p===null?.55:clamp(1-p/.10),foldScore=fold===null?.70:clamp(fold),robustScore=robust===null?.65:clamp(robust),supportScore=support===null?.50:clamp(Math.log10(Math.max(1,support)+1)/2),liftScore=lift===null?clamp(weight*2):clamp(Math.abs(lift)/.20);
  return Math.round(100*clamp(.30*pScore+.25*foldScore+.20*robustScore+.15*supportScore+.10*liftScore));
}
function explainAxis(axis){
  const parts=axisFamilyParts(axis),confidence=axisConfidence(axis);
  return Object.freeze({id:String(axis?.id||''),familyKey:parts.join('+'),familyParts:Object.freeze(parts),label:(axis?.predicates||[]).map(predicateLabel).join(' × '),confidence,support:finite(axis?.support),lift:finite(axis?.lift),contrast:finite(axis?.contrast),weight:finite(axis?.weight,0)});
}
function collapseAxes(axes){
  const ordered=axes.map(explainAxis).sort((a,b)=>b.confidence-a.confidence||Math.abs(b.weight)-Math.abs(a.weight)||Math.abs(b.lift||0)-Math.abs(a.lift||0)||a.id.localeCompare(b.id));
  const used=new Set(),out=[];
  for(const row of ordered){if(row.familyParts.some(part=>used.has(part)))continue;out.push(row);row.familyParts.forEach(part=>used.add(part))}
  return out;
}
function evidenceConfidence(evidence){
  if(!evidence.length)return 0;
  const weights=evidence.map(row=>Math.abs(Number(row.weight)||0)),sum=weights.reduce((a,b)=>a+b,0);
  return Math.round(sum>0?evidence.reduce((acc,row,index)=>acc+row.confidence*weights[index],0)/sum:evidence.reduce((acc,row)=>acc+row.confidence,0)/evidence.length);
}
export function enrichStoreReadRankings({rankings=[],featureRows=[],model={}}={}){
  const byKey=new Map(featureRows.map(row=>[String(row?.machineKey??row?.tableNo??''),row]));
  const scores=rankings.map(row=>finite(row?.score,0)),min=Math.min(...scores,0),max=Math.max(...scores,0),spread=max-min;
  return Object.freeze(rankings.map(row=>{
    const sample=byKey.get(String(row?.machineKey??row?.tableNo??'')),matching=sample?(model?.axes||[]).filter(axis=>axisMatches(sample,axis)):[];
    const evidence=collapseAxes(matching),confidence=evidenceConfidence(evidence),score=finite(row?.score,0),scoreStrength=spread>1e-12?clamp((score-min)/spread):(score>0?.5:0),reasonStrength=clamp(evidence.length/6);
    const aimScore=Math.round(100*clamp(.10+.50*scoreStrength+.30*(confidence/100)+.10*reasonStrength));
    return Object.freeze({...row,aimScore,evidenceConfidence:confidence,evidenceFamilyCount:evidence.length,evidenceMatchedCount:matching.length,evidence:Object.freeze(evidence)});
  }));
}

export const __test={familyForField,predicateLabel,axisFamilyParts,axisConfidence,collapseAxes,evidenceConfidence};
