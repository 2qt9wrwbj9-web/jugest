export function storeMetadata(text){
  try{const value=JSON.parse(String(text??''));return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
  catch{return {}}
}

export function isPublicNativeStore(metadata){
  return metadata?.visibility==='public'&&metadata?.source==='pia-public-ranking-top';
}

export function canAccessStoreMetadata(metadata,channelId){
  if(isPublicNativeStore(metadata))return true;
  return Boolean(channelId)&&String(metadata?.collectorChannelId??'')===String(channelId);
}

export function canAccessStoreRow(row,channelId){
  return canAccessStoreMetadata(storeMetadata(row?.source_metadata_json),channelId);
}
