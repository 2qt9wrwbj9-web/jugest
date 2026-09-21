import {readFileSync} from 'node:fs';

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

function readOwnerChannelFile(path=process.env.JUGEST_PIA_OWNER_CHANNEL_FILE??DEFAULT_OWNER_CHANNEL_FILE){
  try{return readFileSync(String(path),'utf8').trim()}
  catch{return ''}
}

function configuredOwnerChannels(options={}){
  if(Object.prototype.hasOwnProperty.call(options,'piaOwnerChannelIds'))return options.piaOwnerChannelIds;
  const envValue=String(process.env.JUGEST_PIA_OWNER_CHANNEL_IDS??'').trim();
  if(envValue)return envValue;
  return readOwnerChannelFile(options.piaOwnerChannelFile);
}

export function canAccessStoreMetadata(metadata,channelId,options={}){
  if(metadata?.source===PIA_SOURCE){
    const mode=String(options.piaAccessMode??process.env.JUGEST_PIA_ACCESS_MODE??'owner').trim().toLowerCase();
    if(mode==='owner')return Boolean(channelId)&&ownerChannelIds(configuredOwnerChannels(options)).has(String(channelId));
    if(mode==='public')return isPublicNativeStore(metadata);
    return false;
  }
  return Boolean(channelId)&&String(metadata?.collectorChannelId??'')===String(channelId);
}

export function canAccessStoreRow(row,channelId,options){
  return canAccessStoreMetadata(storeMetadata(row?.source_metadata_json),channelId,options);
}

export const __test={PIA_SOURCE,DEFAULT_OWNER_CHANNEL_FILE,ownerChannelIds,readOwnerChannelFile,configuredOwnerChannels};
