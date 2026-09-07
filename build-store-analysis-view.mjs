function replaceSection(text,startMarker,endMarker,replacement,label){
 const start=text.indexOf(startMarker);
 if(start<0)throw new Error(`${label} start anchor missing`);
 const end=text.indexOf(endMarker,start);
 if(end<0)throw new Error(`${label} end anchor missing`);
 return text.slice(0,start)+replacement+text.slice(end);
}
function replaceOnce(text,from,to,label){
 const hits=text.split(from).length-1;
 if(hits!==1)throw new Error(`${label} anchor count ${hits}`);
 return text.replace(from,to);
}

export function patchStoreAnalysisHtml(html){
 const evidence=`function v510AnalysisEvidence(c,meta={}){let practicalEffect=Number.isFinite(+c?.practicalEffect)?+c.practicalEffect:0;return{label:c?.label||c?.name||c?.meta?.label||"",family:c?.family||c?.meta?.family||"",scope:c?.scope||"",machine:c?.machine||"",machineName:c?.scope==="machine"&&c?.machine?analysisMachineName(c.machine):"",practicalEffect,confidence:Number.isFinite(+c?.confidence)?+c.confidence:0,days:+c?.days||0,rows:+c?.rows||0,recent30:Number.isFinite(+c?.recent30)?+c.recent30:null,q:Number.isFinite(+c?.q)?+c.q:null,rankScore:Number.isFinite(+c?.rankScore)?+c.rankScore:null,status:c?.status||"",capped:Math.abs(practicalEffect)>=.699,factGroup:meta.factGroup||"",relatedConditions:Array.isArray(meta.relatedConditions)?meta.relatedConditions:[]}}\n`;
 html=replaceSection(html,'function v510AnalysisEvidence(c){','function v510ComplexPattern(c){',evidence,'store-analysis evidence serializer');
 const result=`function v510StoreAnalysisResult(r=bruteResults){
 if(!r)return null;
 let all=r.singleEvidence?.all||[],storeCandidates=all.filter(c=>c.scope!=="machine"&&bruteSingleRankEligible(c)),positivePool=storeCandidates.filter(c=>c.practicalEffect>0),negativePool=storeCandidates.filter(c=>c.practicalEffect<0),positiveStore=bruteSingleFactGroups(storeCandidates.filter(c=>c.practicalEffect>0)),negativeStore=bruteSingleFactGroups(storeCandidates.filter(c=>c.practicalEffect<0));
 const grouped=(roots,pool,limit)=>roots.slice(0,limit).map(x=>{let relatedConditions=pool.filter(c=>c!==x.c&&bruteSingleFactGroup(c)===x.factGroup).sort((a,b)=>(b.rankScore||0)-(a.rankScore||0)||(b.confidence||0)-(a.confidence||0)).slice(0,8).map(c=>({label:c?.meta?.label||"",practicalEffect:Number.isFinite(+c?.practicalEffect)?+c.practicalEffect:0,confidence:Number.isFinite(+c?.confidence)?+c.confidence:0,days:+c?.days||0,rows:+c?.rows||0,capped:Math.abs(+c?.practicalEffect||0)>=.699}));return v510AnalysisEvidence(x.c,{factGroup:x.factGroup,relatedConditions})});
 let machineBuckets=new Map;for(let c of all){if(c.scope!=="machine"||c.practicalEffect<=0||!bruteSingleRankEligible(c))continue;let a=machineBuckets.get(c.machine);if(!a)machineBuckets.set(c.machine,a=[]);a.push(c)}
 let machinePositive=[...machineBuckets].map(([machine,pool])=>({machine,machineName:analysisMachineName(machine),evidence:grouped(bruteSingleFactGroups(pool),pool,4)})).filter(x=>x.evidence.length).sort((a,b)=>(b.evidence[0]?.rankScore||0)-(a.evidence[0]?.rankScore||0)||a.machineName.localeCompare(b.machineName,'ja'));
 return{shop:r.prep?.shop||"",from:r.prep?.from||"",latest:r.prep?.latest||"",days:r.prep?.days?.length||0,rowCount:+r.prep?.rowCount||0,meanES:Number.isFinite(+r.prep?.overall?.meanES)?+r.prep.overall.meanES:null,usableCount:+r.singleEvidence?.usableCount||0,rawUsableCount:+r.singleEvidence?.usableCount||0,conditionCount:+r.singleEvidence?.conditionCount||0,independentCount:bruteSingleFactGroups(storeCandidates).length,evidenceConfidence:Number.isFinite(+r.singleEvidence?.confidence)?+r.singleEvidence.confidence:null,complexTested:+r.complexTested||0,fdrSignificant:+r.fdrSignificant||0,confirmSignificant:+r.confirmSignificant||0,rawS:+r.rawS||0,rawA:+r.rawA||0,maxDims:+r.maxDims||1,machines:(r.machineSummaries||[]).map(x=>({machine:x.machine,machineName:analysisMachineName(x.machine),n:+x.n||0,meanES:Number.isFinite(+x.meanES)?+x.meanES:null,delta:Number.isFinite(+x.delta)?+x.delta:null,meanP5:Number.isFinite(+x.meanP5)?+x.meanP5:null})),positive:grouped(positiveStore,positivePool,20),negative:grouped(negativeStore,negativePool,10),machinePositive,patterns:bruteTop(r.patterns||[],20).map(v510ComplexPattern),machinePatterns:bruteTop(r.machinePatterns||[],20).map(v510ComplexPattern)}
}\n`;
 html=replaceSection(html,'function v510StoreAnalysisResult(r=bruteResults){','async function v510RunStoreAnalysis(',result,'store-analysis grouped result');
 return html;
}

export function patchStoreAnalysisApp(app){
 const oldKpi='<div><small>使える根拠</small><b>${r.usableCount||0}</b></div></div><div class="section-label">プラス根拠</div>';
 const newKpi='<div><small>独立根拠</small><b>${r.independentCount||0}系統</b></div></div><p class="micro-note">検証条件 ${formatCount(r.rawUsableCount??r.usableCount)}件 / 条件種類 ${formatCount(r.conditionCount)}種</p><div class="section-label">プラス根拠</div>';
 app=replaceOnce(app,oldKpi,newKpi,'store-analysis independent KPI');
 const oldRow="<article class=\"evidence-row\"><span>${i+1}</span><div><b>${esc(e.label)}</b><small>${e.days}日 / ${e.rows}台 ・ 信頼 ${Math.round(e.confidence||0)}</small></div><strong class=\"plus\">${e.practicalEffect>=0?'+':''}${Number(e.practicalEffect||0).toFixed(3)}</strong></article>";
 const newRow="<article class=\"evidence-row\"><span>${i+1}</span><div><b>${esc(e.label)}</b><small>${e.days}日 / ${e.rows}台 ・ 信頼 ${Math.round(e.confidence||0)}${e.relatedConditions?.length?` ・ 関連 ${e.relatedConditions.length}件`:''}</small></div><strong class=\"plus\">${e.practicalEffect>=0?'+':''}${Number(e.practicalEffect||0).toFixed(3)}</strong></article>";
 app=replaceOnce(app,oldRow,newRow,'store-analysis evidence row');
 const oldAfter="${(r.positive||[]).slice(0,8).map((e,i)=>`<article class=\"evidence-row\"><span>${i+1}</span><div><b>${esc(e.label)}</b><small>${e.days}日 / ${e.rows}台 ・ 信頼 ${Math.round(e.confidence||0)}${e.relatedConditions?.length?` ・ 関連 ${e.relatedConditions.length}件`:''}</small></div><strong class=\"plus\">${e.practicalEffect>=0?'+':''}${Number(e.practicalEffect||0).toFixed(3)}</strong></article>`).join('')||'<div class=\"empty-card\">安定したプラス根拠はまだないよ。</div>'}</div><details class=\"intel-details\"><summary>機種別配分を見る</summary>";
 const newAfter="${(r.positive||[]).slice(0,8).map((e,i)=>`<article class=\"evidence-row\"><span>${i+1}</span><div><b>${esc(e.label)}</b><small>${e.days}日 / ${e.rows}台 ・ 信頼 ${Math.round(e.confidence||0)}${e.relatedConditions?.length?` ・ 関連 ${e.relatedConditions.length}件`:''}</small></div><strong class=\"plus\">${e.practicalEffect>=0?'+':''}${Number(e.practicalEffect||0).toFixed(3)}</strong></article>`).join('')||'<div class=\"empty-card\">安定したプラス根拠はまだないよ。</div>'}</div>${(r.positive||[]).some(e=>e.capped)?'<p class=\"micro-note\">※ +0.700 は効果量の上限に到達した表示です。</p>':''}${(r.machinePositive||[]).length?`<details class=\"intel-details\"><summary>機種別のプラス根拠 ${r.machinePositive.length}機種</summary><div class=\"pattern-list\">${r.machinePositive.map(g=>`<div><b>${esc(g.machineName)}</b><span>${(g.evidence||[]).slice(0,3).map(e=>`${esc(e.label)} / 信 ${Math.round(e.confidence||0)}${e.capped?' / 上限':''}`).join('<br>')}</span></div>`).join('')}</div></details>`:''}<details class=\"intel-details\"><summary>機種別配分を見る</summary>";
 app=replaceOnce(app,oldAfter,newAfter,'store-analysis machine evidence section');
 return app;
}
