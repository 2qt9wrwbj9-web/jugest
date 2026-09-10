import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {buildAnaSloUrl,fetchAnaSloDay} from '../src/collector/source.mjs';
import {archiveRawHtml} from '../src/collector/archive.mjs';

const gunzipAsync=promisify(gunzip);

test('buildAnaSloUrl encodes the agreed date/slug route',()=>{
  assert.equal(buildAnaSloUrl({date:'2026-09-09',slug:'abc-store'}),'https://ana-slo.com/2026-09-09-abc-store-data/');
  assert.throws(()=>buildAnaSloUrl({date:'2026/09/09',slug:'abc-store'}),/date/i);
  assert.throws(()=>buildAnaSloUrl({date:'2026-09-09',slug:'../bad'}),/slug/i);
});

test('fetchAnaSloDay uses one bounded GET and returns status final URL and HTML',async()=>{
  const calls=[];
  const transport=async(url,options)=>{
    calls.push({url,options});
    return {status:200,statusText:'OK',ok:true,url:url+'?final=1',text:async()=>'<html><table></table></html>'};
  };
  const result=await fetchAnaSloDay({date:'2026-09-09',slug:'abc-store',transport,timeoutMs:4321,clock:()=>123});
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://ana-slo.com/2026-09-09-abc-store-data/');
  assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[0].options.redirect,'follow');
  assert.equal(calls[0].options.cache,'no-store');
  assert.ok(calls[0].options.signal);
  assert.equal(result.status,200);
  assert.equal(result.finalUrl,'https://ana-slo.com/2026-09-09-abc-store-data/?final=1');
  assert.equal(result.html,'<html><table></table></html>');
  assert.equal(result.elapsedMs,0);
});

test('fetchAnaSloDay returns non-2xx response metadata without hiding HTTP status',async()=>{
  const transport=async url=>({status:429,statusText:'Too Many Requests',ok:false,url,text:async()=>'<html>blocked</html>'});
  const result=await fetchAnaSloDay({date:'2026-09-09',slug:'abc',transport});
  assert.equal(result.status,429);
  assert.equal(result.ok,false);
  assert.equal(result.html,'<html>blocked</html>');
});

test('archiveRawHtml gzip-archives original bytes atomically with sha256 and 0600 mode',async()=>{
  const root=await mkdtemp(join(tmpdir(),'jugest-raw-'));
  try{
    const html='<html><body>日本語 raw html</body></html>';
    const out=await archiveRawHtml({root,storeId:'abc-store',date:'2026-09-09',html});
    assert.equal(out.path,join(root,'abc-store','2026','09','2026-09-09.html.gz'));
    assert.equal(out.sha256,createHash('sha256').update(Buffer.from(html)).digest('hex'));
    assert.equal(out.bytes,Buffer.byteLength(html));
    const zipped=await readFile(out.path);
    assert.equal((await gunzipAsync(zipped)).toString('utf8'),html);
    assert.equal((await stat(out.path)).mode&0o777,0o600);
    const names=await readdir(join(root,'abc-store','2026','09'));
    assert.deepEqual(names,['2026-09-09.html.gz']);
  }finally{await rm(root,{recursive:true,force:true})}
});

test('archiveRawHtml rejects traversal-like store IDs and dates',async()=>{
  const root=await mkdtemp(join(tmpdir(),'jugest-raw-'));
  try{
    await assert.rejects(()=>archiveRawHtml({root,storeId:'../etc',date:'2026-09-09',html:'x'}),/storeId/i);
    await assert.rejects(()=>archiveRawHtml({root,storeId:'abc',date:'../09',html:'x'}),/date/i);
  }finally{await rm(root,{recursive:true,force:true})}
});
