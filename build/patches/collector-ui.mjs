export function patchCollectorUiApp(input){
 let app=String(input??'');
 const startDate='<label><small>取得開始日</small><input data-store-start type="date" value="${esc(e.startDate)}"></label>';
 if(!app.includes(startDate))throw new Error('Collector start-date control anchor missing');
 app=app.replace(startDate,'');
 const open='<section class="panel sync-setup"><h2>';
 const compactOpen=`<details class="panel sync-setup collector-link-card" \${d.linked?'':'open'}><summary class="collector-link-summary">`;
 const headingClose='</h2>\n    <p>端末同期とは別の、取得データをJUGESTへ送るための連携です。</p>';
 const compactHeadingClose=`\${d.linked?'　設定を表示':''}</summary>\n    <p>端末同期とは別の、取得データをJUGESTへ送るための連携です。</p>`;
 const close='</section>\n    <div class="data-kpis">';
 const compactClose='</details>\n    <div class="data-kpis">';
 for(const [from,to,label] of [[open,compactOpen,'Collector compact setup open'],[headingClose,compactHeadingClose,'Collector compact setup heading'],[close,compactClose,'Collector compact setup close']]){
  const hits=app.split(from).length-1;
  if(hits!==1)throw new Error(`${label} anchor count ${hits}`);
  app=app.replace(from,to);
 }
 return app;
}
