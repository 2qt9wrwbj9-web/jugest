import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');

function bodies(){
  const out=[];
  const re=/(?:async\s+)?function\s+(v510\w+)\s*\([^)]*\)\s*\{/g;
  let m;
  while((m=re.exec(html))){
    let i=re.lastIndex,depth=1,q='',esc=false;
    for(;i<html.length;i++){
      const c=html[i];
      if(q){if(esc){esc=false;continue}if(c==='\\'){esc=true;continue}if(c===q)q='';continue}
      if(c==='"'||c==="'"||c==='`'){q=c;continue}
      if(c==='{')depth++;
      else if(c==='}'&&--depth===0){out.push([m[1],html.slice(m.index,i+1)]);re.lastIndex=i+1;break}
    }
  }
  return out;
}
const all=bodies();
assert.ok(all.length>=55,`expected v510 core API functions, got ${all.length}`);
for(const [name,s] of all){
  assert.doesNotMatch(s,/\$\(|\bdocument\b|render[A-Z]\w*\(|pageState\(|tabState\(|\bmake\(|\bcalc\(|alert\(|showMiniToast\(/,`${name} must be UI-DOM independent`);
}
assert.match(html,/JUGESTCoreV510\.createBridge\(/,'bridge must be constructed through headless core contract');
assert.doesNotMatch(html,/navigateLegacy\s*:/,'legacy navigation must not be part of the v5.1 bridge');
console.log(`v5.1.0 headless bridge regression PASS (${all.length} core functions)`);
