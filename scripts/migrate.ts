import { createClient } from '@libsql/client';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const url = process.env.TURSO_DATABASE_URL;
if (!url)
  throw new Error(
    'Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN for a remote database).',
  );
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
try {
  await client.execute(
    'CREATE TABLE IF NOT EXISTS loop_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)',
  );
  for (const directory of ['../drizzle/', '../migrations/vercel/']) {
    const location = new URL(directory, import.meta.url);
    for (const name of (await readdir(location))
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      const migration = `${directory}${name}`;
      const tx = await client.transaction('write');
      try {
        const applied = await tx.execute({
          sql: 'SELECT name FROM loop_migrations WHERE name=?',
          args: [migration],
        });
        if (!applied.rows.length) {
          const sql = await readFile(
            fileURLToPath(new URL(name, location)),
            'utf8',
          );
          for (const statement of sql
            .split('--> statement-breakpoint')
            .map((s) => s.trim())
            .filter(Boolean))
            await tx.execute(statement);
          await tx.execute({
            sql: 'INSERT INTO loop_migrations (name,applied_at) VALUES (?,?)',
            args: [migration, Date.now()],
          });
        }
        await tx.commit();
        console.log(`Ready: ${name}`);
      } catch (error) {
        await tx.rollback();
        throw error;
      } finally {
        tx.close();
      }
    }
  }
} finally {
  client.close();
}
