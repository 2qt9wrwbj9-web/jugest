// Reusable functions.exec orchestration for this dedicated development branch.
// Uses the connected GitHub API, never deployment refs. No credentials are stored.
// First generate /workspace/scratch/de64dcbbff0a/resume-upload-manifest.json
// from a local committed tree and the current remote development branch head.
// Evaluate this source inside functions.exec; tools/text/notify/store are provided there.
const repository='2qt9wrwbj9-web/jugest';
const branch='work/parallel-group-checkpoint-20261012';
const root='/workspace/scratch/de64dcbbff0a/jugest-checkpoint-20261012';
const read=await tools.exec_command({cmd:'cat /workspace/scratch/de64dcbbff0a/resume-upload-manifest.json',login:false,max_output_tokens:16000});
if(read.exit_code!==0)throw Error('Cannot read save manifest');
const manifest=JSON.parse(read.output);
const data=result=>{
 if(result.isError)throw Error(JSON.stringify(result.content));
 return result.structuredContent||JSON.parse(result.content.find(item=>item.type==='text').text);
};
async function chunk(file,offset,size){
 const cmd="python3 - <<'PY'\nfrom pathlib import Path\nimport json,base64\nb=Path("+JSON.stringify(root+'/'+file.path)+").read_bytes()\ns=b.decode('utf-8') if "+JSON.stringify(file.encoding)+" == 'utf-8' else base64.b64encode(b).decode()\nprint(json.dumps(s["+offset+':'+(offset+size)+"],ensure_ascii=False))\nPY";
 const result=await tools.exec_command({cmd,login:false,max_output_tokens:16000});
 if(result.exit_code!==0)throw Error('File read failed: '+file.path);
 try{
  const value=JSON.parse(result.output);
  if((file.encoding==='utf-8'?Array.from(value).length:value.length)!==Math.min(size,file.length-offset))throw Error('Read length mismatch');
  return value;
 }catch(error){
  if(size<1000)throw error;
  const half=Math.floor(size/2);
  return await chunk(file,offset,half)+(offset+half<file.length?await chunk(file,offset+half,size-half):'');
 }
}
const elements=[];
for(const file of manifest.files){
 if(file.reuse){elements.push({path:file.path,mode:file.mode,type:'blob',sha:file.sha});continue}
 const chunks=[],parts=[];
 for(let offset=0;offset<file.length;offset+=12000)chunks.push({offset,size:Math.min(12000,file.length-offset)});
 for(let i=0;i<chunks.length;i+=4){
  const results=await Promise.allSettled(chunks.slice(i,i+4).map(c=>chunk(file,c.offset,c.size)));
  for(const result of results){if(result.status==='rejected')throw result.reason;parts.push(result.value)}
 }
 const blob=data(await tools.mcp__codex_apps__github_create_blob({repository_full_name:repository,content:parts.join(''),encoding:file.encoding}));
 if(blob.sha!==file.sha)throw Error('Git blob differs: '+file.path);
 elements.push({path:file.path,mode:file.mode,type:'blob',sha:blob.sha});
 notify({savedBlob:file.path,bytes:file.bytes});
}
const tree=data(await tools.mcp__codex_apps__github_create_tree({repository_full_name:repository,base_tree_sha:manifest.baseTree,tree_elements:elements}));
if(tree.sha!==manifest.tree)throw Error('Git tree differs');
const commit=data(await tools.mcp__codex_apps__github_create_commit({repository_full_name:repository,parent_sha:manifest.base,...(manifest.additional_parent_shas?.length?{additional_parent_shas:manifest.additional_parent_shas}:{}),tree_sha:tree.sha,message:manifest.message}));
const ref=data(await tools.mcp__codex_apps__github_update_ref({repository_full_name:repository,branch_name:branch,expected_sha:manifest.base,force:false,sha:commit.sha}));
store('resumeLastSaved',{sha:commit.sha,tree:tree.sha,local:manifest.head,files:manifest.files.length});
text({saved:commit.sha,tree:tree.sha,local:manifest.head,files:manifest.files.length,ref});
