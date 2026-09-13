import type { Client } from '@libsql/client';
import migrations from './migration-data.json' with { type: 'json' };

export async function migrateDatabase(client: Client) {
  await client.execute(
    'CREATE TABLE IF NOT EXISTS loop_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)',
  );
  for (const migration of migrations) {
    // A write transaction serializes the version check with the schema change.
    const tx = await client.transaction('write');
    try {
      const applied = await tx.execute({
        sql: 'SELECT name FROM loop_migrations WHERE name=?',
        args: [migration.name],
      });
      if (!applied.rows.length) {
        for (const sql of migration.statements) await tx.execute(sql);
        await tx.execute({
          sql: 'INSERT INTO loop_migrations (name,applied_at) VALUES (?,?)',
          args: [migration.name, Date.now()],
        });
      }
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  }
}
