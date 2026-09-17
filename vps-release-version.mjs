export const JUGEST_RELEASE_VERSION='6.0.0';

function applyReleaseVersion(){
  document.title=`JUGEST v${JUGEST_RELEASE_VERSION}`;
  for(const node of document.querySelectorAll('.brand small')){
    if(node.textContent!==JUGEST_RELEASE_VERSION)node.textContent=JUGEST_RELEASE_VERSION;
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

export const __test={applyReleaseVersion};
