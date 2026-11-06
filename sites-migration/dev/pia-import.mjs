import {readDevelopmentPrincipal} from './session.mjs';
import {importPiaDay, MAX_PIA_FILE_BYTES} from '../lib/collectors/pia-file-import.mjs';

const json = (body, status = 200) => Response.json(body, {status, headers: {'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}});
const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PIA大船1の原本確認</title><main><h1>PIA大船1の原本確認</h1>
<p>利用が許可されている出典を登録した開発検証用です。1営業日分のJSONを選び、照合結果を確認してから保存してください。</p>
<label>原本ファイル <input type="file" accept=".json,application/json" id="file"></label>
<p><button id="review" disabled>保存前に照合する</button> <button id="commit" disabled>確認した原本を保存</button></p>
<details id="preview" hidden><summary>保存予定の台データを確認</summary><pre id="rows" style="white-space:pre-wrap"></pre></details><pre id="result" role="status" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre><p><a href="/">店舗画面へ</a></p></main>
<script>
const file=document.getElementById('file'), result=document.getElementById('result'), commit=document.getElementById('commit'), review=document.getElementById('review');
const preview=document.getElementById('preview'), rows=document.getElementById('rows');
let approved=null;
file.onchange=()=>{approved=null;commit.disabled=true;review.disabled=!file.files.length;result.textContent='';preview.hidden=true;preview.open=false};
async function send(save){
 const selected=file.files[0]; if(!selected || save && approved?.file!==selected)return;
 const token=approved?.token;approved=null;commit.disabled=review.disabled=true;preview.hidden=true;preview.open=false;
 try{
  const response=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json',...(save?{'x-jugest-reviewed-hash':token}:{})},body:selected});
  const data=await response.json();
  if(!response.ok){result.textContent='確認できませんでした（'+data.code+'）';return}
  const statuses={new:'保存可能・未保存',duplicate:'同じ原本を保存済み',same_data_different_file:'同じ台データを保存済み・原本は異なります',revision_conflict:'台データが保存済みの内容と異なります',imported:'保存しました'};
  result.textContent=[statuses[data.status],data.name,'営業日 '+data.businessDate,'台数 '+data.machineCount,'原本 SHA-256 '+data.rawHash,'台データ SHA-256 '+data.normalizedHash].join('\\n');
  if(data.machines){rows.textContent=data.machines.map(row=>[row.tableNo+'番',row.sourceMachineName,row.games+'G','BB '+row.bb,'RB '+row.rb,'差枚 '+row.diff].join(' · ')).join('\\n');preview.hidden=false}
  if(!save && data.status==='new' && file.files[0]===selected){approved={file:selected,token:data.reviewToken};commit.disabled=false}
 }catch{result.textContent='通信を確認してから、もう一度照合してください。'}finally{review.disabled=!file.files.length}
}
review.onclick=()=>send(false);commit.onclick=()=>send(true);
</script></html>`;

export async function handleDevelopmentPiaImport(request, options) {
  if (!options.enabled) return json({ok: false, code: 'not_found'}, 404);
  const principal = await readDevelopmentPrincipal(request, options);
  if (!principal) return json({ok: false, code: 'unauthorized'}, 401);
  if (request.method === 'GET') return new Response(html, {headers: {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'"}});
  if (request.method !== 'POST') return json({ok: false, code: 'method_not_allowed'}, 405);
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ok: false, code: 'origin_denied'}, 403);
  if (request.headers.get('content-type') !== 'application/json') return json({ok: false, code: 'unsupported_media_type'}, 415);
  const reader = request.body?.getReader();
  const bytes = new Uint8Array(MAX_PIA_FILE_BYTES);
  let size = 0;
  try {
    if (reader) for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      if (size + value.length > bytes.length) {
        await reader.cancel();
        return json({ok: false, code: 'file_too_large'}, 413);
      }
      bytes.set(value, size);
      size += value.length;
    }
    const reviewedHash = request.headers.get('x-jugest-reviewed-hash') ?? undefined;
    if (reviewedHash !== undefined && !/^[a-f0-9]{64}$/.test(reviewedHash)) return json({ok: false, code: 'invalid_review'}, 400);
    return json({ok: true, ...await importPiaDay(bytes.subarray(0, size), {...options, reviewKey: principal.token, reviewedHash, now: options.now?.()})});
  } catch (error) {
    return json({ok: false, code: error.status ? error.code : 'import_temporarily_unavailable'}, error.status ?? 503);
  }
}
