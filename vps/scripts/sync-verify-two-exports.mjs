#!/usr/bin/env node
// No network or writes. Check two independent, private and frozen old Blob
// snapshots before any migration rehearsal. Only public counts/digests printed.
import {realpathSync} from 'node:fs';
import {validateArchive,loadPrivateArchive,safePrivateArchivePath} from './sync-import-offline.mjs';

export function verifyMatchingExports(first,second){
  const a=validateArchive(first),b=validateArchive(second);
  if(a.recordCount!==b.recordCount||a.shareCount!==b.shareCount||
     a.fingerprint!==b.fingerprint){
    throw new Error('sync_verify_source_changed_between_exports');
  }
  return {ok:true,readOnly:true,shareCount:a.shareCount,
    recordCount:a.recordCount,fingerprint:a.fingerprint,matching:true};
}

export function parseArgs(args){
  if(args.length!==4||args[0]!=='--first'||args[2]!=='--second')
    throw new Error('sync_verify_use_two_private_export_paths');
  const first=safePrivateArchivePath(args[1]),second=safePrivateArchivePath(args[3]);
  if(first===second)throw new Error('sync_verify_distinct_export_paths_required');
  return {first,second};
}

if(process.argv[1]&&realpathSync(process.argv[1])===realpathSync(new URL(import.meta.url))){
  try{
    const {first,second}=parseArgs(process.argv.slice(2));
    console.log(JSON.stringify(verifyMatchingExports(loadPrivateArchive(first),loadPrivateArchive(second))));
  }catch(error){
    console.error(String(error?.message||'sync_verify_failed'));
    process.exitCode=1;
  }
}
