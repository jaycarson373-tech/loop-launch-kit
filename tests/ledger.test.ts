import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  signedWriteStatements,
  type SignedWrite,
} from '../lib/transaction-ledger.ts';
function fixture() {
  const db = new DatabaseSync(':memory:');
  for (const f of [
    '0000_glorious_pixie.sql',
    '0001_bizarre_riptide.sql',
    '0002_modern_apocalypse.sql',
  ])
    db.exec(readFileSync(new URL('../drizzle/' + f, import.meta.url), 'utf8'));
  db.exec(
    "INSERT INTO launches(id,owner,wallet,plan,engine,created_at,updated_at,lock_token,lock_until) VALUES ('l','owner','wallet','{}','old',0,0,'lease',5000); INSERT INTO transactions(id,launch_id,kind,unsigned,block_height,details,created_at,updated_at) VALUES ('j','l','buyback','unsigned',10,'{}',0,0)",
  );
  return db;
}
const write: SignedWrite = {
  launchId: 'l',
  jobId: 'j',
  revision: 0,
  lockToken: 'lease',
  now: 1000,
  engine: 'signed engine',
  status: 'active',
  signed: 'signed bytes',
  signature: 'signature',
};
function batch(db: DatabaseSync, input: SignedWrite, failAfterFirst = false) {
  db.exec('BEGIN');
  try {
    const rows = signedWriteStatements(input).map((s, i) => {
      if (i === 1 && failAfterFirst) throw new Error('Injected crash');
      return db.prepare(s.sql).run(...s.args);
    });
    db.exec('COMMIT');
    return rows;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
void test('signed bytes, transaction identity and engine checkpoint commit atomically', () => {
  const db = fixture();
  db.exec("UPDATE launches SET updated_at=1 WHERE id='absent'");
  assert.deepEqual(
    batch(db, write).map((r) => Number(r.changes)),
    [1, 1],
  );
  assert.equal(
    db.prepare('SELECT engine FROM launches').get()!.engine,
    'signed engine',
  );
  assert.equal(
    db.prepare('SELECT signature FROM transactions').get()!.signature,
    'signature',
  );
  db.close();
});
void test('crash between ledger writes rolls back both pieces of state', () => {
  const db = fixture();
  assert.throws(() => batch(db, write, true));
  assert.equal(db.prepare('SELECT engine FROM launches').get()!.engine, 'old');
  assert.equal(
    db.prepare('SELECT signature FROM transactions').get()!.signature,
    null,
  );
  assert.deepEqual(
    batch(db, write).map((r) => Number(r.changes)),
    [1, 1],
  );
  db.close();
});
void test('expired leases, stale revisions and changed jobs cannot commit', () => {
  for (const patch of [
    { now: 6000 },
    { revision: 9 },
    { lockToken: 'another lease' },
    { jobId: 'missing' },
  ]) {
    const db = fixture();
    assert.deepEqual(
      batch(db, { ...write, ...patch }).map((r) => Number(r.changes)),
      [0, 0],
    );
    assert.equal(
      db.prepare('SELECT engine FROM launches').get()!.engine,
      'old',
    );
    db.close();
  }
});
void test('replaying an already signed job never rewrites the engine', () => {
  const db = fixture();
  batch(db, write);
  assert.deepEqual(
    batch(db, { ...write, revision: 1, engine: 'clobbered' }).map((r) =>
      Number(r.changes),
    ),
    [0, 0],
  );
  assert.equal(db.prepare('SELECT revision FROM launches').get()!.revision, 1);
  db.close();
});
