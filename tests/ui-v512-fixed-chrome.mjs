import fs from 'node:fs';
import assert from 'node:assert/strict';
const css=fs.readFileSync('public/app-v510.css','utf8');
assert.doesNotMatch(css,/contain:\s*layout/,'layout containment breaks viewport-fixed chrome');
assert.match(css,/\.bottom-nav\{position:fixed/,'bottom navigation must stay viewport-fixed');
assert.match(css,/\.topbar\{position:fixed/,'topbar must stay viewport-fixed');
assert.match(css,/\.sheet-layer\{position:fixed/,'store selector layer must be viewport-fixed');
assert.match(css,/\.sheet\{position:absolute;left:50%;top:calc\(74px/,'store selector must open near viewport top');
const topbar=css.match(/\.topbar\{([^}]*)\}/)?.[1]||'';
const bottom=css.match(/\.bottom-nav\{([^}]*)\}/)?.[1]||'';
for(const [name,rule] of [['topbar',topbar],['bottom navigation',bottom]]){
  assert.match(rule,/left:0/ ,`${name} must center without a transformed fixed layer`);
  assert.match(rule,/right:0/ ,`${name} must be pinned to both viewport sides`);
  assert.match(rule,/margin:0 auto/,`${name} must center with auto margins`);
  assert.doesNotMatch(rule,/transform:/,`${name} must not use transform centering on iOS fixed chrome`);
}
console.log('v5.1.2 fixed mobile chrome static PASS');
