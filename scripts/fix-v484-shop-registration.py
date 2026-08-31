from pathlib import Path

for path in [Path('ana-launcher.js'),Path('public/ana-launcher.js')]:
 s=path.read_text()
 old='''function parseCatalogShops(html,prefecture=''){const out=new Map();try{const d=new DOMParser().parseFromString(html,'text/html');for(const a of d.querySelectorAll('a[href]')){let u;try{u=new URL(a.getAttribute('href'),location.origin)}catch{continue}const m=decodeURI(u.pathname).match(/^\\/(\\d{4}-\\d{2}-\\d{2})-(.+)-data\\/?$/);if(!m)continue;const sg=m[2],txt=String(a.textContent||'').replace(/\\s+/g,' ').trim(),name=txt&&txt.length<100&&!/^詳細|データ$/i.test(txt)?txt:displayNameFromSlug(sg);if(!out.has(sg))out.set(sg,{slug:sg,shopName:name,prefecture})}}catch{}if(!out.size){const re=/href=["']([^"']*\\/(\\d{4}-\\d{2}-\\d{2})-([^"'/?#]+)-data\\/?)["']/gi;let m;while((m=re.exec(html))){const sg=m[3];if(!out.has(sg))out.set(sg,{slug:sg,shopName:displayNameFromSlug(sg),prefecture})}}return [...out.values()].sort((a,b)=>a.shopName.localeCompare(b.shopName,'ja'))}'''
 new='''function catalogLinkLabel(a,sg){const txt=String(a?.textContent||'').replace(/\\s+/g,' ').trim();const bad=!txt||txt.length>=100||/^(?:詳細|データ|データを見る|見る)$/i.test(txt)||/^\\d{1,2}\\/\\d{1,2}(?:\\([^)]*\\))?$/.test(txt)||/^\\d{4}[年\\/-]\\d{1,2}[月\\/-]\\d{1,2}日?/.test(txt);return bad?displayNameFromSlug(sg):txt}
function parseCatalogShops(html,prefecture=''){const out=new Map();try{const d=new DOMParser().parseFromString(html,'text/html');for(const a of d.querySelectorAll('a[href]')){let u;try{u=new URL(a.getAttribute('href'),location.origin)}catch{continue}const m=decodeURI(u.pathname).match(/^\\/(\\d{4}-\\d{2}-\\d{2})-(.+)-data\\/?$/);if(!m)continue;const sg=m[2],name=catalogLinkLabel(a,sg),old=out.get(sg);if(!old||old.shopName===displayNameFromSlug(sg)&&name!==old.shopName)out.set(sg,{slug:sg,shopName:name,prefecture})}}catch{}if(!out.size){const re=/href=["']([^"']*\\/(\\d{4}-\\d{2}-\\d{2})-([^"'/?#]+)-data\\/?)["']/gi;let m;while((m=re.exec(html))){const sg=m[3];if(!out.has(sg))out.set(sg,{slug:sg,shopName:displayNameFromSlug(sg),prefecture})}}return [...out.values()].sort((a,b)=>a.shopName.localeCompare(b.shopName,'ja'))}'''
 assert old in s, f'catalog parser anchor missing: {path}'
 s=s.replace(old,new)
 old_ui='''<input id=\\"jacCatalogUrl\\" style=\\"width:100%;margin-top:5px;background:#080808;color:#fff;border:1px solid #554936;border-radius:8px;padding:9px\\" inputmode=\\"url\\" placeholder=\\"https://ana-slo.com/2026-08-30-xxxxx-data/\\"><div class=\\"jac-row\\" style=\\"margin-top:7px\\"><button class=\\"jac-btn\\" id=\\"jacCatalogUrlRegister\\">URLから登録</button>'''
 new_ui='''<input id=\\"jacCatalogUrl\\" style=\\"width:100%;margin-top:5px;background:#080808;color:#fff;border:1px solid #554936;border-radius:8px;padding:9px\\" inputmode=\\"url\\" autocapitalize=\\"off\\" autocomplete=\\"off\\" autocorrect=\\"off\\" spellcheck=\\"false\\" placeholder=\\"https://ana-slo.com/2026-08-30-xxxxx-data/\\"><div class=\\"jac-row\\" style=\\"margin-top:7px\\"><button class=\\"jac-btn gold\\" id=\\"jacCatalogPaste\\">貼り付け</button><button class=\\"jac-btn\\" id=\\"jacCatalogUrlRegister\\">URLから登録</button>'''
 assert old_ui in s, f'url input anchor missing: {path}'
 s=s.replace(old_ui,new_ui)
 anchor="function registerCatalogUrl(){const row=parseDirectShopUrl($('jacCatalogUrl').value);"
 insert="""async function pasteCatalogUrl(){const input=$('jacCatalogUrl'),status=$('jacCatalogStatus');try{if(!navigator.clipboard?.readText)throw new Error('clipboard_unavailable');const text=String(await navigator.clipboard.readText()||'').trim();if(!text)throw new Error('clipboard_empty');input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));status.textContent=parseDirectShopUrl(text)?'✅ URLを貼り付けたよ。内容を確認して登録してね。':'⚠️ 貼り付けた内容はアナスロの日別データURLではないみたい。'}catch(e){input.focus();status.textContent='⚠️ 自動貼り付けが使えない場合は、URL欄を長押し →「ペースト」で貼り付けてね。'}}\n"""+anchor
 assert anchor in s
 s=s.replace(anchor,insert)
 old_bind="$('jacCatalogRegister').onclick=registerCatalogSelection;\n$('jacCatalogUrlRegister').onclick=registerCatalogUrl;"
 new_bind="$('jacCatalogRegister').onclick=registerCatalogSelection;\n$('jacCatalogPaste').onclick=pasteCatalogUrl;\n$('jacCatalogUrlRegister').onclick=registerCatalogUrl;"
 assert old_bind in s
 s=s.replace(old_bind,new_bind)
 path.write_text(s)
