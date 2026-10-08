import fs from 'node:fs';
import assert from 'node:assert/strict';

// The historical hashes stay fixed. Reverse only the explicitly reviewed sync
// changes, then let the existing hash check protect all remaining bytes.
export function withoutReliabilitySyncChanges(file,source){
  if(!['api/_sync-web.js','sync-core.js'].includes(file))return source;
  const patch=fs.readFileSync('docs/development/2026-10-09-data-prediction/reviewed-sync.patch','utf8').split('\n');
  let active=false,hunk=null;const hunks=[];
  for(const line of patch){
    if(line.startsWith('diff --git ')){active=line===`diff --git a/${file} b/${file}`;hunk=null;continue}
    if(!active)continue;
    const header=/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if(header){hunk={start:Number(header[1])-1,before:[],after:[]};hunks.push(hunk);continue}
    if(!hunk)continue;
    if(line.startsWith(' ')){hunk.before.push(line.slice(1));hunk.after.push(line.slice(1))}
    else if(line.startsWith('-'))hunk.before.push(line.slice(1));
    else if(line.startsWith('+'))hunk.after.push(line.slice(1));
  }
  assert.ok(hunks.length,`Reviewed sync patch missing: ${file}`);
  const lines=source.split('\n');
  for(const h of hunks.reverse()){
    assert.deepEqual(lines.slice(h.start,h.start+h.after.length),h.after,`Unreviewed sync change: ${file}`);
    lines.splice(h.start,h.after.length,...h.before);
  }
  return lines.join('\n');
}
