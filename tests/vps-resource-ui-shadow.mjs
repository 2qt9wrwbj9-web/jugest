import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../vps-resource-ui.mjs',import.meta.url),'utf8');

assert.match(source,/document\.querySelector\('jugest-app'\)/,'resource UI must attach to jugest-app');
assert.match(source,/candidate\?\.shadowRoot/,'resource UI must resolve the app shadow root');
assert.match(source,/observer\.observe\(root,/,'resource UI must observe the app shadow root');
assert.match(source,/root\.addEventListener\('click',onRootClick,true\)/,'resource UI must handle settings-row clicks inside the shadow root');
assert.match(source,/root\?\.querySelector\('\.vps-settings-overlay \.vps-settings-wrap'\)/,'resource UI must search the settings overlay inside the shadow root');
assert.doesNotMatch(source,/document\.querySelector\('\.vps-settings-overlay \.vps-settings-wrap'\)/,'resource UI must not search shadow settings from document');
assert.match(source,/font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Noto Sans JP","Hiragino Sans","Yu Gothic UI",sans-serif/,'resource overlay must use the app shell font stack');
assert.match(source,/-webkit-font-smoothing:antialiased/,'resource overlay must match app shell font smoothing');
assert.match(source,/text-rendering:optimizeLegibility/,'resource overlay must match app shell text rendering');

console.log('vps resource UI shadow integration PASS');
