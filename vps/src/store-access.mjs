const PIA_SOURCE='pia-public-ranking-top';

export function storeMetadata(text){
  try{const value=JSON.parse(String(text??''));return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
  catch{return {}}
}

export function isPublicNativeStore(metadata){
  return metadata?.visibility==='public'&&metadata?.source===PIA_SOURCE;
}

function ownerChannelIds(raw){
  const source=Array.isArray(raw)?raw:String(raw??'').split(',');
  return new Set(source.map(value=>String(value||'').trim()).filter(Boolean));
}

export function canAccessStoreMetadata(metadata,channelId,{piaAccessMode=process.env.JUGEST_PIA_ACCESS_MODE??'public',piaOwnerChannelIds=process.env.JUGEST_PIA_OWNER_CHANNEL_IDS??''}={}){
  if(metadata?.source===PIA_SOURCE){
    const mode=String(piaAccessMode||'').trim().toLowerCase();
    if(mode==='owner')return Boolean(channelId)&&ownerChannelIds(piaOwnerChannelIds).has(String(channelId));
    if(mode==='public')return isPublicNativeStore(metadata);
    return false;
  }
  return Boolean(channelId)&&String(metadata?.collectorChannelId??'')===String(channelId);
}

export function canAccessStoreRow(row,channelId,options){
  return canAccessStoreMetadata(storeMetadata(row?.source_metadata_json),channelId,options);
}

export const __test={PIA_SOURCE,ownerChannelIds};
