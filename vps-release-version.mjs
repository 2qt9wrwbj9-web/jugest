export const JUGEST_RELEASE_VERSION='6.0.0';

function collectOpenRoots(root){
  const roots=[],stack=[root],seen=new Set();
  while(stack.length){
    const current=stack.pop();
    if(!current||seen.has(current))continue;
    seen.add(current);roots.push(current);
    for(const node of current.querySelectorAll?.('*')??[]){
      if(node?.shadowRoot)stack.push(node.shadowRoot);
    }
  }
  return roots;
}

function applyReleaseVersion(){
  document.title=`JUGEST v${JUGEST_RELEASE_VERSION}`;
  for(const root of collectOpenRoots(document)){
    for(const node of root.querySelectorAll?.('.brand small')??[]){
      if(node.textContent!==JUGEST_RELEASE_VERSION)node.textContent=JUGEST_RELEASE_VERSION;
    }
  }
}

if(typeof document!=='undefined'){
  applyReleaseVersion();
  const root=document.documentElement;
  if(root&&typeof MutationObserver!=='undefined'){
    new MutationObserver(applyReleaseVersion).observe(root,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyReleaseVersion,{once:true});
}

export const __test={applyReleaseVersion,collectOpenRoots};
