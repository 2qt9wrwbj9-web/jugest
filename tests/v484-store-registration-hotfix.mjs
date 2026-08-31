import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src=fs.readFileSync(new URL('../ana-launcher.js',import.meta.url),'utf8');
const start=src.indexOf("function catalogLabel(");
const end=src.indexOf('async function loadCatalogShops',start);
assert.ok(start>=0&&end>start,'catalog parser helpers must exist');
const code=src.slice(start,end);

class TinyDOMParser{
  parseFromString(html){
    return {querySelectorAll(sel){
      assert.equal(sel,'a[href]');
      const out=[];
      const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while((m=re.exec(html))){
        const href=m[1];
        const text=m[2].replace(/<[^>]+>/g,'');
        out.push({getAttribute(k){return k==='href'?href:null},textContent:text});
      }
      return out;
    }};
  }
}
const ctx={
  DOMParser:TinyDOMParser,
  URL,
  location:{origin:'https://ana-slo.com'},
  displayNameFromSlug(v=''){try{return decodeURIComponent(String(v)).replace(/-/g,' ')}catch{return String(v).replace(/-/g,' ')}}
};
vm.createContext(ctx);
vm.runInContext(code+';this.__parse=parseCatalogShops;this.__label=catalogLabelIsShop;this.__listSlug=catalogListSlug;',ctx);

assert.equal(ctx.__label('8/8(土)'),false,'schedule dates must never become shop names');
assert.equal(ctx.__label('2026/08/08(土)'),false,'full dates must never become shop names');
assert.equal(ctx.__label('ジアス大船'),true);
assert.equal(ctx.__listSlug('/ホールデータ/神奈川県/ジアス大船-データ一覧/','神奈川県'),'ジアス大船');

const fixture=`
<table><tr><td><a href="/2026-08-08-アビバ関内店-data/">8/8(土)</a></td><td>アビバ関内店</td></tr></table>
<h4>ホール一覧</h4>
<table>
<tr><td><a href="/ホールデータ/神奈川県/ジアス大船-データ一覧/">ジアス大船</a></td><td>鎌倉市</td></tr>
<tr><td><a href="/ホールデータ/神奈川県/ザシティ-ベルシティ川崎店-データ一覧/">ザシティ/ベルシティ川崎店</a></td><td>川崎市川崎区</td></tr>
</table>`;
const shops=ctx.__parse(fixture,'神奈川県');
assert.deepEqual(JSON.parse(JSON.stringify(shops)),[
  {slug:'ザシティ-ベルシティ川崎店',shopName:'ザシティ/ベルシティ川崎店',prefecture:'神奈川県'},
  {slug:'ジアス大船',shopName:'ジアス大船',prefecture:'神奈川県'}
].sort((a,b)=>a.shopName.localeCompare(b.shopName,'ja')));
assert.ok(!shops.some(x=>/8\/8/.test(x.shopName)),'schedule date labels must not leak into catalog');

const fallback=ctx.__parse('<a href="/2026-08-08-アビバ関内店-data/">8/8(土)</a><a href="/2026-08-09-アビバ逗子駅前店-data/">8/9(日)</a>','神奈川県');
assert.deepEqual(new Set(fallback.map(x=>x.shopName)),new Set(['アビバ関内店','アビバ逗子駅前店']),'daily-link fallback must derive names from slug when anchor text is a date');

for(const token of [
  'id="jacCatalogPaste"',
  "navigator.clipboard?.readText",
  "addEventListener('paste'",
  '-webkit-user-select:text',
  '-webkit-touch-callout:default'
]) assert.ok(src.includes(token),'missing paste hardening: '+token);

const pub=fs.readFileSync(new URL('../public/ana-launcher.js',import.meta.url),'utf8');
assert.equal(src,pub,'root/public launcher must remain byte-identical');
console.log('v4.8.4 store-registration hotfix regression: ok');
