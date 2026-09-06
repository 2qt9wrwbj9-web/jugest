import fs from 'node:fs';
import assert from 'node:assert/strict';
const css=fs.readFileSync('public/app-v510.css','utf8');
assert.doesNotMatch(css,/contain:\s*layout/,'layout containment breaks viewport-fixed chrome');
assert.match(css,/\.bottom-nav\{position:fixed/,'bottom navigation must stay viewport-fixed');
assert.match(css,/\.topbar\{position:fixed/,'topbar must stay viewport-fixed');
assert.match(css,/\.sheet-layer\{position:fixed/,'store selector layer must be viewport-fixed');
assert.match(css,/\.sheet\{position:absolute;left:50%;top:calc\(74px/,'store selector must open near viewport top');
console.log('v5.1.2 fixed mobile chrome static PASS');
