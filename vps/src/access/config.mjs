import path from 'node:path';
import {existsSync,realpathSync} from 'node:fs';

export function readAccessConfig(env=process.env){
  if(env.JUGEST_ACCESS_ENABLED!=='1')return null;
  return validateAccessConfig({dbPath:env.JUGEST_ACCESS_DB||'/var/lib/jugest/access.sqlite',origin:env.JUGEST_ACCESS_ORIGIN,rpID:env.JUGEST_ACCESS_RP_ID,allowLocalhost:env.JUGEST_ACCESS_ALLOW_LOCALHOST==='1',trustLoopbackProxy:env.JUGEST_ACCESS_TRUST_LOOPBACK_PROXY==='1'});
}
export function validateAccessConfig(config){
  if(!config)return null;
  let url;try{url=new URL(config.origin)}catch{throw new Error('invalid_access_origin')}
  const local=config.allowLocalhost&&url.protocol==='http:'&&url.hostname==='localhost';
  if((url.protocol!=='https:'&&!local)||url.origin!==config.origin||url.username||url.password||config.rpID!==url.hostname)throw new Error('invalid_access_origin_or_rp_id');
  if(typeof config.dbPath!=='string'||!config.dbPath)throw new Error('access_database_path_required');
  return {...config,dbPath:path.resolve(config.dbPath)};
}
export function assertPrivateAccessPath(config,rootDir,otherDbPaths=[]){
  if(!config)return;
  const actual=p=>{
    let ancestor=path.resolve(p);const suffix=[];
    while(!existsSync(ancestor)){suffix.unshift(path.basename(ancestor));const parent=path.dirname(ancestor);if(parent===ancestor)break;ancestor=parent}
    return path.join(realpathSync(ancestor),...suffix);
  };
  const root=actual(rootDir),database=actual(config.dbPath);
  if(database===root||database.startsWith(root+path.sep)||otherDbPaths.filter(Boolean).some(p=>actual(p)===database))throw new Error('access_database_must_be_private_and_separate');
}
