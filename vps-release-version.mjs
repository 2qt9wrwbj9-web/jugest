export const JUGEST_RELEASE_VERSION='6.0.0';

const observedReleaseTargets=new WeakSet();

function findAppShell(doc=document){
  return doc?.getElementById?.('JUGEST_APP')||doc?.querySelector?.('jugest-app')||null;
}

function findAppShadowRoot(doc=document){
  return findAppShell(doc)?.shadowRoot||null;
}

function applyReleaseVersion(doc=document){
  if(!doc)return false;
  doc.title=`JUGEST v${JUGEST_RELEASE_VERSION}`;
  const root=findAppShadowRoot(doc);
  const node=(root?.querySelectorAll?.('.brand small')??[])[0]||null;
  if(node&&node.textContent!==JUGEST_RELEASE_VERSION)node.textContent=JUGEST_RELEASE_VERSION;
  return !!root;
}

function installReleaseVersionObservers(Observer=MutationObserver,observedTargets=observedReleaseTargets,doc=document){
  const sync=()=>applyReleaseVersion(doc);
  sync();
  const root=findAppShadowRoot(doc);
  if(root&&!observedTargets.has(root)){
    observedTargets.add(root);
    new Observer(sync).observe(root,{childList:true,subtree:true});
  }
  return sync;
}

if(typeof document!=='undefined'){
  const start=()=>typeof MutationObserver!=='undefined'
    ?installReleaseVersionObservers(MutationObserver,observedReleaseTargets,document)
    :applyReleaseVersion(document);
  start();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  if(typeof customElements!=='undefined'&&typeof customElements.whenDefined==='function'){
    customElements.whenDefined('jugest-app').then(start).catch(()=>{});
  }
}

export const __test={applyReleaseVersion,findAppShell,findAppShadowRoot,installReleaseVersionObservers};
