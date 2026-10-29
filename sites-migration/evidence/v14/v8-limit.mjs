// TEST ONLY: capture the original config at Miniflare's documented debug-write
// boundary, preserving Cap'n Proto Void symbols and byte arrays. Do not modify
// dependency files. The official workerd.Config.v8Flags applies to every isolate.
export function applyV8Limit({Runtime,serializeConfig},heap){
 if(!heap)return()=>{};
 const prior=process.env.MINIFLARE_WORKERD_CONFIG_DEBUG,update=Runtime.prototype.updateConfig,stringify=JSON.stringify;let captured;
 process.env.MINIFLARE_WORKERD_CONFIG_DEBUG='/dev/null';
 JSON.stringify=function(value,...args){if(value?.services&&value?.sockets)captured=value;return stringify.call(this,value,...args)};
 Runtime.prototype.updateConfig=function(buffer,...args){
  if(!captured)throw Error('original workerd config not captured');
  const config={...captured,v8Flags:[`--max-old-space-size=${heap}`,'--max-semi-space-size=4']};
  console.log('V8_LIMIT',stringify({oldSpaceMiB:heap,semiSpaceMiB:4,total128MbLimit:false,allNativeBindings:true}));
  return update.call(this,serializeConfig(config),...args);
 };
 return()=>{Runtime.prototype.updateConfig=update;JSON.stringify=stringify;if(prior===undefined)delete process.env.MINIFLARE_WORKERD_CONFIG_DEBUG;else process.env.MINIFLARE_WORKERD_CONFIG_DEBUG=prior};
}
