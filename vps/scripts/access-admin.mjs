import path from 'node:path';
import {migrateAccessDatabase,createAccessStore} from '../src/access/store.mjs';

// Registration tokens are intentionally displayed only by the operator CLI.
// Never pass a registration/session secret in argv or persist this output.
const command=process.argv[2],dbPath=path.resolve(process.env.JUGEST_ACCESS_DB||'/var/lib/jugest/access.sqlite');
try{
  if(command==='migrate'){
    migrateAccessDatabase(dbPath);
    console.log('Access schema 2 ready. Existing collection databases are unchanged.');
  }else{
    const store=createAccessStore({dbPath});
    try{
      if(command==='bootstrap'||command==='recover'){
        if(command==='recover'&&!process.argv.includes('--confirm-recovery'))throw new Error('recovery_confirmation_required');
        const grant=store.issueEnrollment({kind:command==='bootstrap'?'bootstrap':'recovery'});
        console.log(JSON.stringify({token:grant.token,expiresAt:new Date(grant.expiresAt).toISOString(),use:'Open /admin/register and paste this token. Displayed once; do not save terminal output.'}));
      }else if(command==='revoke'){
        const id=process.argv[3];
        if(!id)throw new Error('credential_id_required');
        store.revokeCredential(id,'cli');console.log('Credential and its admin sessions revoked.');
      }else if(command==='status')console.log(JSON.stringify(store.listState()));
      else throw new Error('usage_access_admin_migrate_bootstrap_recover_revoke_status');
    }finally{store.close()}
  }
}catch(error){
  const known=['already_initialized','access_migration_required','access_database_not_empty','unsupported_access_schema','recovery_confirmation_required','credential_id_required','not_found'];
  console.error(known.includes(error.message)?error.message:'access_admin_failed');process.exitCode=1;
}
