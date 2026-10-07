import {renderAccessContent} from '../../../access-components.mjs';

export function renderAccessPage(page){
  const content=renderAccessContent(page);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="no-referrer"><title>JUGEST・共有アクセス</title><link rel="stylesheet" href="/access-ui.css"></head><body data-page="${page}"><header><a href="/">JUGEST</a><span>PIAデータ共有</span></header><main>${content}<p id="message" role="status" aria-live="polite"></p></main><script type="module" src="/access-ui.mjs"></script></body></html>`;
}
