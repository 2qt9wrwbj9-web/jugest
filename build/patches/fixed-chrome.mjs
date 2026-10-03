export function patchFixedChromeCss(input){
 let css=String(input??'');
 const transforms=[
  ['.topbar{position:fixed;z-index:50;top:0;left:50%;transform:translateX(-50%);width:min(100%,560px);','.topbar{position:fixed;z-index:50;top:0;left:0;right:0;margin:0 auto;width:min(100%,560px);','topbar fixed centering'],
  ['.bottom-nav{position:fixed;z-index:50;bottom:0;left:50%;transform:translateX(-50%);width:min(100%,560px);','.bottom-nav{position:fixed;z-index:50;bottom:0;left:0;right:0;margin:0 auto;width:min(100%,560px);','bottom navigation fixed centering'],
 ];
 for(const [from,to,label] of transforms){
  const hits=css.split(from).length-1;
  if(hits!==1)throw new Error(`${label} anchor count ${hits}`);
  css=css.replace(from,to);
 }
 return css;
}
