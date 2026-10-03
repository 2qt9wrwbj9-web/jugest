export function patchCollectorCoverageHtml(input){
 let html=String(input??'');
 const helperAnchor='async function v510RefreshCollector(){';
 const helper=`function v510CollectorCoveragePayload(){\n const grouped=new Map();\n for(const d of externalDays||[]){\n  const shop=canonicalExternalShopName(d?.shop||'').trim(),date=String(d?.date||'');if(!shop||!/^20\\d{2}-\\d{2}-\\d{2}$/.test(date))continue;\n  let row=grouped.get(shop);if(!row){row={shop,dates:new Set()};grouped.set(shop,row)}row.dates.add(date);\n }\n return [...grouped.values()].slice(0,100).map(r=>({shop:r.shop,dates:[...r.dates].sort().slice(-370)}));\n}\n\n`;
 if((html.split(helperAnchor).length-1)!==1)throw new Error('Collector coverage helper anchor missing');
 html=html.replace(helperAnchor,helper+helperAnchor);
 const revisionAnchor='sinceRevision:Math.max(0,+collectorSyncState.revision||0)}';
 const replacement='sinceRevision:Math.max(0,+collectorSyncState.revision||0),localCoverage:v510CollectorCoveragePayload()}';
 const hits=html.split(revisionAnchor).length-1;
 if(hits<5)throw new Error(`Collector status coverage anchor count ${hits}`);
 return html.replaceAll(revisionAnchor,replacement);
}
