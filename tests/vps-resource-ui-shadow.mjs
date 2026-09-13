import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../vps-resource-ui.mjs',import.meta.url),'utf8');

assert.match(source,/document\.querySelector\('jugest-app'\)/,'resource UI must attach to jugest-app');
assert.match(source,/candidate\?\.shadowRoot/,'resource UI must resolve the app shadow root');
assert.match(source,/observer\.observe\(root,/,'resource UI must observe the app shadow root');
assert.match(source,/root\.addEventListener\('click',onRootClick,true\)/,'resource UI must handle settings-row clicks inside the shadow root');
assert.match(source,/root\?\.querySelector\('\.vps-settings-overlay \.vps-settings-wrap'\)/,'resource UI must search the settings overlay inside the shadow root');
assert.doesNotMatch(source,/document\.querySelector\('\.vps-settings-overlay \.vps-settings-wrap'\)/,'resource UI must not search shadow settings from document');

console.log('vps resource UI shadow integration PASS');
