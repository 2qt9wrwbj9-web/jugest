import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {openDatabase} from '../src/db.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const VPS=join(HERE,'..');
function run(script,args=[]){return spawnSync(process.execPath,[join(VPS,'scripts',script),...args],{encoding:'utf8'});}

test('migrate, enqueue, and status CLIs operate on one durable SQLite file',()=>{
  const dir=mkdtempSync(join(tmpdir(),'jugest-cli-'));
  const dbPath=join(dir,'jugest.sqlite');
  try{
    const migrated=run('migrate.mjs',['--db',dbPath]);
    assert.equal(migrated.status,0,migrated.stderr);
    const enqueued=run('enqueue.mjs',['--db',dbPath,'--type','RESEARCH','--key','cli-r1','--payload','{"store":"A"}','--lease','192']);
    assert.equal(enqueued.status,0,enqueued.stderr);
    const queued=JSON.parse(enqueued.stdout);
    assert.equal(queued.type,'RESEARCH');
    assert.equal(queued.idempotencyKey,'cli-r1');
    const status=run('status.mjs',['--db',dbPath]);
    assert.equal(status.status,0,status.stderr);
    const summary=JSON.parse(status.stdout);
    assert.equal(summary.queue.queued,1);
    assert.equal(summary.queue.total,1);
    const db=openDatabase(dbPath);
    try{assert.equal(db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE idempotency_key='cli-r1'").get().n,1)}finally{db.close()}
  }finally{rmSync(dir,{recursive:true,force:true})}
});

test('systemd coordinator template runs as unprivileged jugest user with hardening',()=>{
  const text=readFileSync(join(VPS,'systemd','jugest-coordinator.service'),'utf8');
  assert.match(text,/^User=jugest$/m);
  assert.match(text,/^Group=jugest$/m);
  assert.match(text,/^EnvironmentFile=-\/etc\/jugest\/jugest\.env$/m);
  assert.match(text,/^NoNewPrivileges=true$/m);
  assert.match(text,/^ProtectSystem=strict$/m);
  assert.match(text,/^ReadWritePaths=\/var\/lib\/jugest$/m);
  assert.match(text,/src\/main\.mjs/);
});
