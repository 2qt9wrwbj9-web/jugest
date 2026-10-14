import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const hashes=JSON.parse(readFileSync(new URL('./group-historical-shas.json',import.meta.url),'utf8'));
const owner='2qt9wrwbj9-web',repo='jugest';
export async function historicalSource(revision,filename,{cwd=process.cwd()}={}){
  const expected=hashes[revision]?.[filename];
  if(!expected)throw new Error('Unpinned historical source requested');
  let source;
  if(process.env.JUGEST_TEST_FORCE_HISTORICAL_FALLBACK!=='1'){
    try{source=execFileSync('git',['show',revision+':'+filename],{cwd,maxBuffer:20*1024*1024,stdio:['ignore','pipe','ignore']});}
    catch{/* Some CI/Preview Git clones omit old history. */}
  }
  if(!source){
    const url='https://raw.githubusercontent.com/'+owner+'/'+repo+'/'+revision+'/'+filename;
    const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('Historical test fixture fetch failed: '+revision+' '+filename+' HTTP '+response.status);
    source=Buffer.from(await response.arrayBuffer());
  }
  // Git blob identity is pinned to the original historical commit content.
  // Fail closed if a network response or shallow-checkout fallback is altered.
  const actual=createHash('sha1').update('blob '+source.length+'\0').update(source).digest('hex');
  if(actual!==expected)throw new Error('Historical baseline SHA mismatch: '+revision+' '+filename);
  return source;
}
