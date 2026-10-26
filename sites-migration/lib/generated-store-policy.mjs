// Generated from frozen source; configuration is supplied explicitly.
const PIA_SOURCE='pia-public-ranking-top';
const DEFAULT_OWNER_CHANNEL_FILE='/opt/jugest/pia-owner-channel';

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

export function canAccessStoreMetadata(metadata,channelId,options={}){
  if(metadata?.source===PIA_SOURCE){
    const mode=String(options.piaAccessMode??'owner').trim().toLowerCase();
    if(mode==='owner')return Boolean(channelId)&&ownerChannelIds(options.piaOwnerChannelIds).has(String(channelId));
    if(mode==='public')return isPublicNativeStore(metadata);
    return false;
  }
  return Boolean(channelId)&&String(metadata?.collectorChannelId??'')===String(channelId);
}

export function canAccessStoreRow(row,channelId,options){
  return canAccessStoreMetadata(storeMetadata(row?.source_metadata_json),channelId,options);
}

// Enabled invitation sharing must never coexist with legacy all-receivers PIA access.
// Disabled sharing leaves the original public/owner policy unchanged.
export function assertPiaSharingOwnership(options={}){
  const mode=String(options.piaAccessMode??'owner').trim().toLowerCase();
  if(mode!=='owner'||!ownerChannelIds(options.piaOwnerChannelIds).size)throw new Error('pia_sharing_requires_owner_mode_and_allowlist');
}
