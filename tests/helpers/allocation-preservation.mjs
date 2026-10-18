// Restore only the reviewed UI diff before the older, unchanged protected
// hashes are checked. New code inside a restored hunk is itself hash-pinned.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const bytes=readFileSync(new URL('./approved-allocation-ui-changes.json',import.meta.url));
const hash=value=>createHash('sha256').update(value).digest('hex');
assert.equal(hash(bytes),'6c770351309ae6599771a49d74bad32f94afa93a9777bdfe8ead9349b471cd4a','Unreviewed allocation preservation manifest');
const manifest=JSON.parse(bytes);
export function withoutAllocationAdditions(file,source){
  for(const hunk of manifest.files[file]||[]){
    assert.equal(hash(hunk.after),hunk.sha256,'Unreviewed allocation hunk');
    assert.equal(source.split(hunk.after).length-1,1,'Unreviewed allocation UI modification or boundary: '+file);
    source=source.replace(hunk.after,hunk.before);
  }
  return source;
}
export function withoutAllocationTab(html){
  const tab='<button class="" data-action="store-allocation">投入分析</button>';
  assert.equal(html.split(tab).length-1,1,'Unreviewed allocation navigation anchor');
  return html.replace(tab,'');
}
