export const JUGEST_RELEASE_VERSION='6.0.0';

const observedReleaseTargets=new WeakSet();

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

function installReleaseVersionObservers(Observer=MutationObserver,observedTargets=observedReleaseTargets){
  const sync=()=>{
    applyReleaseVersion();
    for(const root of collectOpenRoots(document)){
      const target=root===document?document.documentElement:root;
      if(!target||observedTargets.has(target))continue;
      observedTargets.add(target);
      new Observer(sync).observe(target,{childList:true,subtree:true});
    }
  };
  sync();
  return sync;
}

if(typeof document!=='undefined'){
  const sync=typeof MutationObserver!=='undefined'
    ?installReleaseVersionObservers(MutationObserver,observedReleaseTargets)
    :applyReleaseVersion;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});
}

export const __test={applyReleaseVersion,collectOpenRoots,installReleaseVersionObservers};
