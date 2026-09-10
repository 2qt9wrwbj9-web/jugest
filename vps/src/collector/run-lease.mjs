function assertDb(db){if(!db?.prepare)throw new TypeError('db is required');}
function assertText(value,name){if(typeof value!=='string'||!value.trim())throw new TypeError(`${name} is required`);return value.trim();}
function assertIso(value,name){const s=assertText(value,name);if(!Number.isFinite(Date.parse(s)))throw new TypeError(`${name} must be ISO date-time`);return s;}

function tx(db,fn){
  db.exec('BEGIN IMMEDIATE');
  try{const out=fn();db.exec('COMMIT');return out}catch(error){try{db.exec('ROLLBACK')}catch{}throw error}
}

export function acquireCollectorRunLease(db,{owner,nowIso,leaseExpiresIso}){
  assertDb(db);
  owner=assertText(owner,'owner');
  nowIso=assertIso(nowIso,'nowIso');
  leaseExpiresIso=assertIso(leaseExpiresIso,'leaseExpiresIso');
  if(Date.parse(leaseExpiresIso)<=Date.parse(nowIso))throw new TypeError('leaseExpiresIso must be after nowIso');

  return tx(db,()=>{
    db.prepare(`INSERT INTO collector_control(id,updated_at) VALUES(1,?) ON CONFLICT(id) DO NOTHING`).run(nowIso);
    const result=db.prepare(`UPDATE collector_control
      SET run_owner=?,run_lease_expires_at=?,updated_at=?
      WHERE id=1 AND (
        run_owner IS NULL OR
        run_lease_expires_at IS NULL OR
        run_lease_expires_at<=? OR
        run_owner=?
      )`).run(owner,leaseExpiresIso,nowIso,nowIso,owner);
    return result.changes===1;
  });
}

export function releaseCollectorRunLease(db,{owner,nowIso}){
  assertDb(db);
  owner=assertText(owner,'owner');
  nowIso=assertIso(nowIso,'nowIso');
  const result=db.prepare(`UPDATE collector_control
    SET run_owner=NULL,run_lease_expires_at=NULL,updated_at=?
    WHERE id=1 AND run_owner=?`).run(nowIso,owner);
  return result.changes===1;
}
