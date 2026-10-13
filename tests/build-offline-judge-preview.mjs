// Makes an isolated review copy from the actual product files, without deploying.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const destination=path.resolve('docs/development/completion-20261012/preview.html');
const sources={};
const read=file=>{const bytes=fs.readFileSync(file);sources[file]=createHash('sha256').update(bytes).digest('hex');return bytes};
const inline=text=>text.replace(/<\/script/gi,'<\\/script');
const css='data:text/css;base64,'+read('app-v510.css').toString('base64');
const logo='data:image/png;base64,'+read('assets/jugest-mark.png').toString('base64');
// The source changelog contains literal <head> text. Remove comments from the
// generated copy before locating real elements; the original source is retained.
let html=read('index.html').toString().replace(/<!--[^]*?-->/g,'');
html=html.replace(/<link\b[^>]*\brel="(?:icon|apple-touch-icon|manifest)"[^>]*>/g,'');
html=html.replace(/<title>[^]*?<\/title>/,'<title>開発確認用・JUGEST 並列判別／全台系</title>');
let app='';let count=0;
html=html.replace(/<script\b[^>]*\bsrc="\.\/([^"]+)"[^>]*>\s*<\/script>/g,(_,file)=>{
 count++;let code=read(file).toString();
 if(file==='app-v510.js'){
  code=code.replaceAll('jugest:v510:ui','jugest:completion-preview:ui').replaceAll('./app-v510.css',css).replaceAll('./assets/jugest-mark.png',logo);
  app='<script>'+inline(code)+'</script>';return '';
 }
 return '<script>'+inline(code)+'</script>';
});
assert.equal(count,9);assert.ok(app);assert.equal((html.match(/<head\b/g)||[]).length,1);
const prefix=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' data:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; connect-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none';">
<script>
window.fetch=async function(url,options={}){const method=String(options.method||'GET').toUpperCase();if(method==='GET'&&typeof url==='string'&&url.startsWith('/api/'))return new Response(JSON.stringify({ok:true,stores:[],items:[],receipts:[],linked:false}),{headers:{'content-type':'application/json'}});throw new TypeError('この確認用コピーは外部へ接続しません');};
try{const key='jugest:completion-preview:ui';if(!localStorage.getItem(key)){const rows=Array.from({length:5},(_,i)=>({machine:'mr',tableNo:String(101+i),games:'8000',bb:i===4?'22':'36',rb:i===4?'16':'34',diff:''}));localStorage.setItem(key,JSON.stringify({workspace:'judgement',observedMode:'parallel',observedGroup:true,observedDrafts:{version:1,single:{},rows}}));}}catch(_){}
</script>`;
html=html.replace(/<head\b[^>]*>/,m=>m+prefix);
const finish=`<script>
customElements.whenDefined('jugest-app').then(()=>{const app=document.querySelector('jugest-app');let attempts=0;const boot=()=>{if(!app.bridge()?.judgeObservedMachine){if(attempts++<100)setTimeout(boot,20);return;}app.navigate('judgement');app.handleObservedAction('judge-all');const decorate=()=>{const root=app.shadowRoot;for(const b of root.querySelectorAll('[data-workspace]'))if(b.dataset.workspace!=='judgement')b.disabled=true;const page=root.querySelector('.observed-page');if(page&&!page.querySelector('[data-development-note]')){const p=document.createElement('p');p.dataset.developmentNote='';p.className='observed-help';p.textContent='開発確認用：本番には接続しません。架空の5台を入力済みで、自由に変更・再判別できます。';page.prepend(p);}};new MutationObserver(decorate).observe(app.shadowRoot,{childList:true,subtree:true});decorate();};boot();});
</script>`;
assert.equal((html.match(/<\/body>/g)||[]).length,1);
html=html.replace('</body>',app+finish+'</body>');
fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,html);
fs.writeFileSync(destination.replace(/\.html$/,'.sources.json'),JSON.stringify({artifact:'preview.html',sha256:createHash('sha256').update(html).digest('hex'),sources},null,2)+'\n');
console.log(JSON.stringify({artifact:destination,bytes:Buffer.byteLength(html),sourceFiles:Object.keys(sources).length}));
