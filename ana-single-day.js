(()=>{
'use strict';
const VERSION='1.0.0';
const PARSER_VERSION=4500;
const ALLOWED_HOSTS=['ana-slo.com','www.ana-slo.com'];
if(!ALLOWED_HOSTS.includes(location.hostname.toLowerCase())){alert('アナスロ上で実行してね');return;}
const m=location.pathname.match(/^\/(\d{4}-\d{2}-\d{2})-(.+)-data\/?$/);
if(!m){alert('アナスロの日別データページ（YYYY-MM-DD-店舗名-data/）で実行してね');return;}
if(document.getElementById('jugglerSingleDayExporter')){document.getElementById('jugglerSingleDayExporter').remove();}
const pageDate=m[1],slug=m[2];
function inferShopName(){
  const h1=[...document.querySelectorAll('h1,h2')].map(x=>x.textContent.trim()).find(Boolean)||'';
  let t=h1||document.title||decodeURIComponent(slug||'');
  t=t.replace(/20\d{2}[年\/-]\d{1,2}[月\/-]\d{1,2}日?/g,' ').replace(/アナスロ|データ|出玉|差枚|結果|スロット/gi,' ').replace(/まとめ/gi,' ').replace(/\s+/g,' ').trim();
  if(t.length>2&&t.length<80)return t;
  try{return decodeURIComponent(slug).replace(/-/g,' ')}catch{return slug}
}
const shopName=inferShopName();
const decEnt=(s='')=>{const map={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};return String(s).replace(/&#x([0-9a-f]+);/gi,(_,x)=>String.fromCodePoint(parseInt(x,16))).replace(/&#([0-9]+);/g,(_,x)=>String.fromCodePoint(parseInt(x,10))).replace(/&([a-z]+);/gi,(z,k)=>map[k.toLowerCase()]??z)};
const strip=(s='')=>decEnt(String(s).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[\u00a0\t\r ]+/g,' ').replace(/\n\s+/g,'\n').trim();
const aliases=[
 ['my',['マイジャグラーV','マイジャグラー5','マイジャグV','マイジャグ5']],
 ['im',['ネオアイムジャグラーEX','ネオアイムジャグラー','ネオアイム']],
 ['go',['ゴーゴージャグラー3','ゴーゴージャグラーⅢ','ゴージャグ3','ゴージャグⅢ']],
 ['fk',['ファンキージャグラー2','ファンキージャグラーⅡ','ファンキー2','ファンキーⅡ']],
 ['hp',['ハッピージャグラーVⅢ','ハッピージャグラーVIII','ハッピージャグラーV3','ハッピーVⅢ','ハッピーVIII','ハッピーV3']],
 ['gg',['ジャグラーガールズSS','ジャグラーガールズ','ガールズSS']],
 ['mr',['ミスタージャグラー','ミスター']],
 ['um',['ウルトラミラクルジャグラー','ウルトラミラクル','ウルミラ']],
 // HANA HANA: put New King V before King because the latter is a substring of the former.
 ['newkingv',['ニューキングハナハナV','LニューキングハナハナV','スマート沖スロニューキングハナハナV','スマスロニューキングハナハナV']],
 ['houou',['ハナハナホウオウ～天翔～','ハナハナホウオウ-天翔-','ハナハナホウオウ天翔','ホウオウ～天翔～','ホウオウ天翔']],
 ['dragon',['ドラゴンハナハナ～閃光～','ドラゴンハナハナ-閃光-','ドラゴンハナハナ閃光','スマート沖スロドラゴンハナハナ～閃光～','Lドラゴンハナハナ～閃光～']],
 ['star',['スターハナハナ','スマート沖スロスターハナハナ','Lスターハナハナ']],
 ['king',['キングハナハナ','スマート沖スロキングハナハナ','Lキングハナハナ']]
];
const machineToken=(name='')=>{let s=String(name);try{s=s.normalize('NFKC')}catch{}return s.toUpperCase().replace(/\s+/g,'').replace(/[‐‑‒–—―]/g,'-').replace(/[・･]/g,'').replace(/[Φφ]/g,'Φ')};
const aliasTokens=aliases.map(([k,aa])=>[k,aa.map(machineToken)]);
const norm=(name='')=>{const s=machineToken(name);for(const [k,aa] of aliasTokens)if(aa.some(a=>s.includes(a)))return k;return''};
const num=(v,nullable=false)=>{const s=strip(String(v??'')).replace(/,/g,'').replace(/[＋+]/g,'+').replace(/[−－–—]/g,'-').trim();if(!s||/^[―ー\-–—]+$/.test(s))return nullable?null:NaN;const q=s.match(/[+-]?\d+(?:\.\d+)?/);if(!q)return nullable?null:NaN;const n=Number(q[0]);return Number.isFinite(n)?n:(nullable?null:NaN)};
const cells=(row)=>{const out=[];let q;const re=/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1>/gi;while((q=re.exec(row)))out.push({type:q[1].toLowerCase(),text:strip(q[2])});return out};
const rows=(table)=>{const out=[];let q;const re=/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;while((q=re.exec(table))){const c=cells(q[1]);if(c.length)out.push(c)}return out};
const idx=(h,p)=>h.findIndex(x=>p.some(y=>x.includes(y)));
const infer=(prefix)=>{const txt=machineToken(strip(prefix.slice(-9000)));let best={key:'',idx:-1};for(const [key,aa] of aliasTokens)for(const a of aa){const i=txt.lastIndexOf(a);if(i>best.idx)best={key,idx:i}}return best.key};
function parseHtml(html,date,url,expectedMedian=NaN){
  const src=String(html||'');let q;const tables=[];const re=/<table\b[^>]*>[\s\S]*?<\/table>/gi;while((q=re.exec(src)))tables.push({html:q[0],index:q.index});
  const metas=[];
  for(const t of tables){
    const rr=rows(t.html);if(!rr.length)continue;
    const hr=rr.find(r=>r.some(c=>c.type==='h'))||rr[0],h=hr.map(c=>c.text.replace(/\s+/g,''));
    const no=idx(h,['台番号','台番']),g=idx(h,['G数','総回転数','回転数','ゲーム数']),df=idx(h,['差枚','総差枚']),bb=idx(h,['BB','BIG']),rb=idx(h,['RB','REG']),mi=idx(h,['機種名','機種']);
    if(no<0||g<0||df<0||bb<0||rb<0)continue;
    const scope=mi>=0?'':infer(src.slice(0,t.index));if(mi<0&&!scope)continue;
    metas.push({t,rr,hr,no,g,df,bb,rb,mi,scope});
  }
  // ana-slo の「全データ一覧」のように機種名列を持つ表がある場合はそれだけを使う。
  // 見出しから機種を推測する補助表まで同時に読むと同じ実台を二重計上し得るため。
  const explicitHasTarget=metas.some(m=>m.mi>=0&&m.rr.some(row=>row!==m.hr&&norm((row[m.mi]||{}).text)));
  const selected=explicitHasTarget?metas.filter(m=>m.mi>=0):metas;
  const machines=[];let candidateRows=0,invalidRows=0,duplicateRows=0,conflictRows=0,matchedTables=selected.length;const unmatchedJugglerNames=new Map(),unmatchedHanaNames=new Map();
  for(const m of selected){
    const {rr,hr,no,g,df,bb,rb,mi,scope}=m;
    for(const row of rr){
      if(row===hr)continue;const c=row.map(x=>x.text);if(c.length<=Math.max(no,g,df,bb,rb,mi))continue;
      const key=mi>=0?norm(c[mi]):scope;if(!key){if(mi>=0){const tok=machineToken(c[mi]),n=String(c[mi]||'').trim()||'不明';if(tok.includes('ジャグ'))unmatchedJugglerNames.set(n,(unmatchedJugglerNames.get(n)||0)+1);if(tok.includes('ハナハナ'))unmatchedHanaNames.set(n,(unmatchedHanaNames.get(n)||0)+1)}continue}candidateRows++;
      const tableNo=String(c[no]||'').replace(/[^0-9A-Za-z-]/g,'').trim(),games=num(c[g]),diff=num(c[df],true),b=num(c[bb]),r=num(c[rb]);
      if(!tableNo||!Number.isFinite(games)||games<0||!Number.isFinite(b)||b<0||!Number.isFinite(r)||r<0||(b+r>games&&games>0)){invalidRows++;continue}
      machines.push({machine:key,category:['houou','king','dragon','star','newkingv'].includes(key)?'hanahana':'juggler',sourceMachineName:mi>=0?c[mi]:(aliases.find(x=>x[0]===key)?.[1]?.[0]||key),tableNo,games,diff,bb:b,rb:r,_explicit:mi>=0});
    }
  }
  // 台番は店舗内の物理台を識別するキー。機種名が誤推測されても同じ台番を2台に増やさない。
  const byNo=new Map(),conflicts=new Set();
  const rowRank=x=>(x._explicit?1000000:0)+(x.diff!=null?100000:0)+Math.max(0,+x.games||0);
  for(const x of machines){
    const k=x.tableNo,prev=byNo.get(k);
    if(!prev){byNo.set(k,x);continue}
    duplicateRows++;
    if(prev.machine!==x.machine){conflictRows++;conflicts.add(k);continue}
    if(rowRank(x)>=rowRank(prev))byNo.set(k,x);
  }
  for(const k of conflicts)byNo.delete(k);
  const dedup=[...byNo.values()].map(({_explicit,...x})=>x),counts={};for(const x of dedup)counts[x.machine]=(counts[x.machine]||0)+1;
  const diffMissing=dedup.filter(x=>x.diff==null).length;
  let score=100;const warnings=[];
  if(Number.isFinite(expectedMedian)&&expectedMedian>=10){
    const ratio=dedup.length/expectedMedian;
    if(ratio<0.5){score-=50;warnings.push(`台数が通常の${Math.round(ratio*100)}%程度`)}
    else if(ratio<0.75){score-=25;warnings.push(`台数が通常よりかなり少ない`)}
    else if(ratio<0.9){score-=10;warnings.push(`台数が通常より少なめ`)}
    else if(ratio>1.35){score-=50;warnings.push(`台数が通常の${Math.round(ratio*100)}%で異常に多い`)}
    else if(ratio>1.2){score-=25;warnings.push(`台数が通常よりかなり多い`)}
    else if(ratio>1.1){score-=10;warnings.push(`台数が通常より多め`)}
  }
  if(candidateRows&&invalidRows/candidateRows>0.08){score-=15;warnings.push(`無効行${invalidRows}件`)}else if(invalidRows){score-=5;warnings.push(`無効行${invalidRows}件`)}
  if(duplicateRows){score-=5;warnings.push(`重複${duplicateRows}件を台番単位で統合`)}
  if(conflictRows){score-=20;warnings.push(`同一台番の機種競合${conflictRows}件を除外`)}
  const unmatchedJugglerRows=[...unmatchedJugglerNames.values()].reduce((a,b)=>a+b,0),unmatchedJugglerLabels=[...unmatchedJugglerNames.keys()];
  const unmatchedHanaRows=[...unmatchedHanaNames.values()].reduce((a,b)=>a+b,0),unmatchedHanaLabels=[...unmatchedHanaNames.keys()];
  if(unmatchedJugglerRows){score-=20;warnings.push(`未認識のジャグラー表記${unmatchedJugglerRows}台：${unmatchedJugglerLabels.slice(0,3).join(' / ')}`)}
  if(unmatchedHanaRows){score-=20;warnings.push(`未認識のハナハナ表記${unmatchedHanaRows}台：${unmatchedHanaLabels.slice(0,3).join(' / ')}`)}
  if(explicitHasTarget&&metas.length>selected.length)warnings.push(`機種名列つき表を優先（補助表${metas.length-selected.length}件を除外）`);
  if(dedup.length&&diffMissing/dedup.length>0.2){score-=15;warnings.push(`差枚欠損が多い`)}
  score=Math.max(0,Math.min(100,score));const grade=score>=90?'A':score>=75?'B':score>=60?'C':'D';
  return {date,sourceUrl:url,machines:dedup,quality:{score,grade,warnings,candidateRows,invalidRows,duplicateRows,conflictRows,unmatchedJugglerRows,unmatchedJugglerLabels,unmatchedHanaRows,unmatchedHanaLabels,diffMissing,matchedTables,machineCounts:counts,totalMachines:dedup.length,explicitTablePreferred:explicitHasTarget}};
}

const day=parseHtml(document.documentElement.outerHTML,pageDate,location.href,NaN);
if(!day.machines.length){
  alert('対象13機種（ジャグラー8＋ハナハナ5）の台データを検出できなかったよ。ページの読み込み完了後にもう一度実行してね。');
  return;
}
const payload={
  format:'juggler-external-import-bulk',version:5,source:'ana-slo',shop:shopName,
  requestedDays:1,successDays:1,failedDays:[],
  days:[{date:day.date,sourceUrl:day.sourceUrl,machines:day.machines}]
};
const json=JSON.stringify(payload,null,2);
const escHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const machineNames={my:'マイジャグV',im:'ネオアイム',go:'ゴージャグ3',fk:'ファンキー2',hp:'ハッピーVⅢ',gg:'ガールズSS',mr:'ミスター',um:'ウルミラ',houou:'ホウオウ天翔',king:'キングハナハナ',dragon:'ドラゴン閃光',star:'スターハナハナ',newkingv:'ニューキングV'};
const counts=day.quality?.machineCounts||{};
const countText=Object.entries(counts).filter(([,n])=>n>0).map(([k,n])=>`${machineNames[k]||k} ${n}`).join(' / ');
const root=document.createElement('div');root.id='jugglerSingleDayExporter';
root.innerHTML=`<style>
#jugglerSingleDayExporter{position:fixed;z-index:2147483647;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;padding:14px;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:#f6f1e7}
#jugglerSingleDayExporter *{box-sizing:border-box}.jsd-box{width:min(620px,100%);max-height:90vh;overflow:auto;background:#111;border:1px solid #8a6a2f;border-radius:16px;padding:14px;box-shadow:0 18px 70px #000}.jsd-title{font-size:18px;font-weight:900;color:#f4df9d}.jsd-sub{font-size:11px;color:#aaa;margin-top:4px}.jsd-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:12px 0}.jsd-stat{background:#080808;border-radius:10px;padding:9px;text-align:center}.jsd-stat small{display:block;color:#999;font-size:9px}.jsd-stat b{display:block;margin-top:2px;font-size:15px}.jsd-note{font-size:10px;color:#c9c1b7;line-height:1.5;background:#0a0a0a;border-left:3px solid #8a6a2f;padding:8px;border-radius:7px}.jsd-buttons{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.jsd-btn{appearance:none;border:1px solid #66522f;background:#221b11;color:#fff;border-radius:10px;padding:10px 12px;font:inherit;font-weight:800}.jsd-btn.primary{background:#7a1e1e;border-color:#a87b32}.jsd-btn.close{margin-left:auto;background:#171717;border-color:#444}.jsd-status{min-height:20px;margin-top:8px;font-size:11px;color:#d8c58d}.jsd-details{margin-top:8px;color:#aaa;font-size:9px;word-break:break-word}
</style><div class="jsd-box"><div class="jsd-title">単日データ取得 <span style="font-size:11px;color:#a99055">v${VERSION}</span></div><div class="jsd-sub">${escHtml(shopName)} / ${pageDate}</div><div class="jsd-stats"><div class="jsd-stat"><small>取得台数</small><b>${day.machines.length}</b></div><div class="jsd-stat"><small>品質</small><b>${day.quality?.grade||'—'}</b></div><div class="jsd-stat"><small>差枚欠損</small><b>${day.quality?.diffMissing||0}</b></div></div><div class="jsd-note">今開いているページだけを読み取ったよ。追加のアナスロ通信・長期保存・Relay送信はしない。出力JSONは設定判別ツールの外部JSON取込形式と互換。</div><div class="jsd-buttons"><button class="jsd-btn primary" id="jsdCopy">JSONをコピー</button><button class="jsd-btn" id="jsdShare">共有 / ファイル保存</button><button class="jsd-btn close" id="jsdClose">閉じる</button></div><div class="jsd-status" id="jsdStatus"></div><details class="jsd-details"><summary>内訳・品質</summary><div style="margin-top:6px">${escHtml(countText||'対象機種なし')}</div><div style="margin-top:4px">${escHtml((day.quality?.warnings||[]).join(' / ')||'警告なし')}</div></details></div>`;
document.documentElement.appendChild(root);
const status=root.querySelector('#jsdStatus');
root.querySelector('#jsdClose').onclick=()=>root.remove();
root.addEventListener('click',e=>{if(e.target===root)root.remove()});
root.querySelector('#jsdCopy').onclick=async()=>{
  try{await navigator.clipboard.writeText(json);status.textContent=`コピー完了：${day.machines.length}台 / ${pageDate}`;}
  catch(e){
    const ta=document.createElement('textarea');ta.value=json;ta.style.cssText='position:fixed;inset:10%;z-index:2147483647;width:80%;height:60%;background:#080808;color:#fff';document.body.appendChild(ta);ta.focus();ta.select();
    try{document.execCommand('copy');status.textContent='コピー完了';ta.remove();}catch{status.textContent='自動コピーできなかったので、表示されたJSONを長押しでコピーしてね';}
  }
};
root.querySelector('#jsdShare').onclick=async()=>{
  const safeShop=shopName.replace(/[\\/:*?"<>|]/g,'_').slice(0,60)||'shop';
  const name=`ana-slo_${safeShop}_${pageDate}.json`;
  const file=new File([json],name,{type:'application/json'});
  try{
    if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:`${shopName} ${pageDate}`});status.textContent='共有シートを開いたよ';return;}
  }catch(e){if(e?.name==='AbortError')return;}
  const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);status.textContent='JSONファイルを保存したよ';
};
})();
