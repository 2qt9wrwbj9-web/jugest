export const PARSER_VERSION=4500;

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
  ['newkingv',['ニューキングハナハナV','LニューキングハナハナV','スマート沖スロニューキングハナハナV','スマスロニューキングハナハナV']],
  ['houou',['ハナハナホウオウ～天翔～','ハナハナホウオウ-天翔-','ハナハナホウオウ天翔','ホウオウ～天翔～','ホウオウ天翔']],
  ['dragon',['ドラゴンハナハナ～閃光～','ドラゴンハナハナ-閃光-','ドラゴンハナハナ閃光','スマート沖スロドラゴンハナハナ～閃光～','Lドラゴンハナハナ～閃光～']],
  ['star',['スターハナハナ','スマート沖スロスターハナハナ','Lスターハナハナ']],
  ['king',['キングハナハナ','スマート沖スロキングハナハナ','Lキングハナハナ']]
];

const HANA_KEYS=new Set(['houou','king','dragon','star','newkingv']);
const machineToken=(name='')=>{let s=String(name);try{s=s.normalize('NFKC')}catch{}return s.toUpperCase().replace(/\s+/g,'').replace(/[‐‑‒–—―]/g,'-').replace(/[・･]/g,'').replace(/[Φφ]/g,'Φ')};
const aliasTokens=aliases.map(([k,aa])=>[k,aa.map(machineToken)]);
const norm=(name='')=>{const s=machineToken(name);for(const [k,aa] of aliasTokens)if(aa.some(a=>s.includes(a)))return k;return''};
const num=(v,nullable=false)=>{const s=strip(String(v??'')).replace(/,/g,'').replace(/[＋+]/g,'+').replace(/[−－–—]/g,'-').trim();if(!s||/^[―ー\-–—]+$/.test(s))return nullable?null:NaN;const q=s.match(/[+-]?\d+(?:\.\d+)?/);if(!q)return nullable?null:NaN;const n=Number(q[0]);return Number.isFinite(n)?n:(nullable?null:NaN)};
const cells=(row)=>{const out=[];let q;const re=/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1>/gi;while((q=re.exec(row)))out.push({type:q[1].toLowerCase(),text:strip(q[2])});return out};
const rows=(table)=>{const out=[];let q;const re=/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;while((q=re.exec(table))){const c=cells(q[1]);if(c.length)out.push(c)}return out};
const idx=(h,p)=>h.findIndex(x=>p.some(y=>x.includes(y)));
const infer=(prefix)=>{const txt=machineToken(strip(prefix.slice(-9000)));let best={key:'',idx:-1};for(const [key,aa] of aliasTokens)for(const a of aa){const i=txt.lastIndexOf(a);if(i>best.idx)best={key,idx:i}}return best.key};

export function parseAnaSloHtml({html,date,sourceUrl,expectedMedian=NaN}={}){
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
  const explicitHasTarget=metas.some(m=>m.mi>=0&&m.rr.some(row=>row!==m.hr&&norm((row[m.mi]||{}).text)));
  const selected=explicitHasTarget?metas.filter(m=>m.mi>=0):metas;
  const machines=[];let candidateRows=0,invalidRows=0,duplicateRows=0,conflictRows=0;const matchedTables=selected.length;const unmatchedJugglerNames=new Map(),unmatchedHanaNames=new Map();
  for(const m of selected){
    const {rr,hr,no,g,df,bb,rb,mi,scope}=m;
    for(const row of rr){
      if(row===hr)continue;const c=row.map(x=>x.text);if(c.length<=Math.max(no,g,df,bb,rb,mi))continue;
      const key=mi>=0?norm(c[mi]):scope;
      if(!key){if(mi>=0){const tok=machineToken(c[mi]),n=String(c[mi]||'').trim()||'不明';if(tok.includes('ジャグ'))unmatchedJugglerNames.set(n,(unmatchedJugglerNames.get(n)||0)+1);if(tok.includes('ハナハナ'))unmatchedHanaNames.set(n,(unmatchedHanaNames.get(n)||0)+1)}continue}
      candidateRows++;
      const tableNo=String(c[no]||'').replace(/[^0-9A-Za-z-]/g,'').trim(),games=num(c[g]),diff=num(c[df],true),b=num(c[bb]),r=num(c[rb]);
      if(!tableNo||!Number.isFinite(games)||games<0||!Number.isFinite(b)||b<0||!Number.isFinite(r)||r<0||(b+r>games&&games>0)){invalidRows++;continue}
      machines.push({machine:key,category:HANA_KEYS.has(key)?'hanahana':'juggler',sourceMachineName:mi>=0?c[mi]:(aliases.find(x=>x[0]===key)?.[1]?.[0]||key),tableNo,games,diff,bb:b,rb:r,_explicit:mi>=0});
    }
  }
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
    else if(ratio<0.75){score-=25;warnings.push('台数が通常よりかなり少ない')}
    else if(ratio<0.9){score-=10;warnings.push('台数が通常より少なめ')}
    else if(ratio>1.35){score-=50;warnings.push(`台数が通常の${Math.round(ratio*100)}%で異常に多い`)}
    else if(ratio>1.2){score-=25;warnings.push('台数が通常よりかなり多い')}
    else if(ratio>1.1){score-=10;warnings.push('台数が通常より多め')}
  }
  if(candidateRows&&invalidRows/candidateRows>0.08){score-=15;warnings.push(`無効行${invalidRows}件`)}else if(invalidRows){score-=5;warnings.push(`無効行${invalidRows}件`)}
  if(duplicateRows){score-=5;warnings.push(`重複${duplicateRows}件を台番単位で統合`)}
  if(conflictRows){score-=20;warnings.push(`同一台番の機種競合${conflictRows}件を除外`)}
  const unmatchedJugglerRows=[...unmatchedJugglerNames.values()].reduce((a,b)=>a+b,0),unmatchedJugglerLabels=[...unmatchedJugglerNames.keys()];
  const unmatchedHanaRows=[...unmatchedHanaNames.values()].reduce((a,b)=>a+b,0),unmatchedHanaLabels=[...unmatchedHanaNames.keys()];
  if(unmatchedJugglerRows){score-=20;warnings.push(`未認識のジャグラー表記${unmatchedJugglerRows}台：${unmatchedJugglerLabels.slice(0,3).join(' / ')}`)}
  if(unmatchedHanaRows){score-=20;warnings.push(`未認識のハナハナ表記${unmatchedHanaRows}台：${unmatchedHanaLabels.slice(0,3).join(' / ')}`)}
  if(explicitHasTarget&&metas.length>selected.length)warnings.push(`機種名列つき表を優先（補助表${metas.length-selected.length}件を除外）`);
  if(dedup.length&&diffMissing/dedup.length>0.2){score-=15;warnings.push('差枚欠損が多い')}
  score=Math.max(0,Math.min(100,score));const grade=score>=90?'A':score>=75?'B':score>=60?'C':'D';
  return {date,sourceUrl,machines:dedup,quality:{score,grade,warnings,candidateRows,invalidRows,duplicateRows,conflictRows,unmatchedJugglerRows,unmatchedJugglerLabels,unmatchedHanaRows,unmatchedHanaLabels,diffMissing,matchedTables,machineCounts:counts,totalMachines:dedup.length,explicitTablePreferred:explicitHasTarget}};
}
