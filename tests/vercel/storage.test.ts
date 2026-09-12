import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqlDatabase, SqlArtworkStore } from '../../server/sql-storage.ts';

test('Vercel storage persists across connections and rolls back a failed ledger batch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'loop-sql-'));
  const url = `file:${join(directory, 'test.db')}`;
  const client = createClient({ url });
  const database = new SqlDatabase(client);
  try {
    await database
      .prepare('CREATE TABLE ledger (id TEXT PRIMARY KEY, amount INTEGER)')
      .run();
    await database
      .prepare(
        'CREATE TABLE artwork_blobs (id TEXT PRIMARY KEY, data BLOB, mime TEXT)',
      )
      .run();
    await database
      .prepare('INSERT INTO ledger VALUES (?,?)')
      .bind('receipt', 10)
      .run();
    await assert.rejects(
      database.batch([
        database
          .prepare('UPDATE ledger SET amount=amount-5 WHERE id=?')
          .bind('receipt'),
        database.prepare('INSERT INTO ledger VALUES (?,?)').bind('receipt', 5),
      ]),
    );
    assert.equal(
      (
        await database
          .prepare('SELECT amount FROM ledger')
          .first<{ amount: number }>()
      )?.amount,
      10,
    );
    const bytes = new Uint8Array([137, 80, 78, 71, 0, 255]).buffer;
    const artworks = new SqlArtworkStore(database);
    await artworks.put('image', bytes, {
      httpMetadata: { contentType: 'image/png' },
    });
    client.close();
    const restarted = createClient({ url });
    try {
      const persisted = new SqlArtworkStore(new SqlDatabase(restarted));
      const image = await persisted.get('image');
      assert.ok(image);
      assert.deepEqual(await image.arrayBuffer(), bytes);
      assert.equal(image.httpMetadata.contentType, 'image/png');
      assert.equal(await persisted.get('missing'), null);
      assert.ok(await persisted.head('image'));
    } finally {
      restarted.close();
    }
  } finally {
    client.close();
    await rm(directory, { recursive: true, force: true });
  }
});
